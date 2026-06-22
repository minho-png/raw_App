import { NextRequest, NextResponse } from 'next/server'
import clientPromise from '@/lib/mongodb'
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth/session'

/**
 * 매입/매출 행 수정값 영속화 + 확정 워크플로우 + 감사 로그.
 *
 * 사용자 요청 (2026-06-22): 정산 데이터 수정·확정·DB 저장 워크플로우 + 다중 지급처.
 * 본 라우트는 (a) 행 단위 override, (b) confirmedAt/frozen 으로 확정 후 잠금,
 * (c) audit log 자동 기록. middleware.ts 가 이미 /api/v1/* JWT 인증 보장 → 본
 * 라우트는 세션에서 username 을 읽어 confirmedBy/audit.userId 로 기록.
 *
 * rowKey 식별자 규칙 (settlementExcel.ts 빌더와 동기화):
 *   sales:    "sales:{month}:{campaignId}"
 *   purchase (CT+):    "purchase:{month}:{campaignId}:{media}"
 *   purchase (Motiv):  "purchase:{month}:motiv-{motivCampaignId}"
 *   openapi (집계):    "openapi:{type}:{month}:{groupBy}:{dimensionId}"  (BE-C 신규)
 *
 * 저장 스키마:
 *   { workspace_id, rowKey, type, month, overrides, baseline?,
 *     confirmedAt?, confirmedBy?, frozen?, updated_at, created_at }
 *
 * audit collection: settlement_audit_logs
 *   { rowKey, action, before, after, userId, timestamp }
 */

const COLLECTION = 'settlement_overrides'
const AUDIT_COLLECTION = 'settlement_audit_logs'
const WORKSPACE  = 'system'

export interface SettlementOverride {
  rowKey: string
  type: 'sales' | 'purchase'
  month: string
  overrides: Record<string, unknown>
  /**
   * 사용자가 수정한 시점의 자동 계산값(수정 필드 한정).
   * 자동 계산식이 변경된 후 같은 행을 다시 조회하면
   * 현재 자동값 ≠ baseline → '계산 기준 변경됨' 경고 표시 가능.
   */
  baseline?: Record<string, unknown>
  /** ISO 8601. 확정 시 자동 설정. */
  confirmedAt?: string
  /** 확정자 username (세션 추출). */
  confirmedBy?: string
  /** true 면 PUT/DELETE 차단 (확정 후 잠금). 재확정 위해 unconfirm 필요. */
  frozen?: boolean
  updatedAt?: string
}

interface AuditEntry {
  rowKey: string
  action: 'create' | 'update' | 'delete' | 'confirm' | 'unconfirm'
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  userId: string
  timestamp: Date
}

async function getCollection() {
  const client = await clientPromise
  const col = client.db('kim_dashboard').collection(COLLECTION)
  await col.createIndex(
    { workspace_id: 1, rowKey: 1 },
    { unique: true, background: true },
  ).catch(() => null)
  await col.createIndex(
    { workspace_id: 1, type: 1, month: 1 },
    { background: true },
  ).catch(() => null)
  return col
}

async function getAuditCollection() {
  const client = await clientPromise
  const col = client.db('kim_dashboard').collection(AUDIT_COLLECTION)
  await col.createIndex(
    { workspace_id: 1, rowKey: 1, timestamp: -1 },
    { background: true },
  ).catch(() => null)
  return col
}

/** 세션 payload 에서 username 추출. middleware 가 이미 보장하므로 null 이면 시스템 호출. */
async function currentUser(req: NextRequest): Promise<string> {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return 'system'
  const payload = await verifySessionToken(token)
  return payload?.username ?? 'system'
}

async function audit(entry: Omit<AuditEntry, 'timestamp'>): Promise<void> {
  try {
    const col = await getAuditCollection()
    await col.insertOne({ workspace_id: WORKSPACE, ...entry, timestamp: new Date() })
  } catch {
    // 감사 실패가 본 작업을 막지 않도록 swallow (로그만)
    console.error('[settlement-overrides] audit insert failed')
  }
}

function bad(message: string, status = 400) {
  return NextResponse.json({ error: { code: 'BAD_REQUEST', message } }, { status })
}

// GET /api/v1/settlement-overrides?type=sales&month=2026-04
//   → { data: SettlementOverride[] }
export async function GET(req: NextRequest) {
  try {
    const type  = req.nextUrl.searchParams.get('type')
    const month = req.nextUrl.searchParams.get('month')
    const col = await getCollection()
    const filter: Record<string, unknown> = { workspace_id: WORKSPACE }
    if (type)  filter.type = type
    if (month) filter.month = month
    const docs = await col.find(filter).toArray()
    const data: SettlementOverride[] = docs.map(d => ({
      rowKey: d.rowKey,
      type:   d.type,
      month:  d.month,
      overrides: d.overrides ?? {},
      baseline:  d.baseline ?? undefined,
      confirmedAt: d.confirmedAt?.toISOString?.() ?? d.confirmedAt,
      confirmedBy: d.confirmedBy,
      frozen: d.frozen ?? false,
      updatedAt: d.updated_at?.toISOString?.() ?? d.updatedAt,
    }))
    return NextResponse.json({ data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: { code: 'INTERNAL', message: msg } }, { status: 500 })
  }
}

// PUT /api/v1/settlement-overrides   body: SettlementOverride
//   → upsert by rowKey. frozen=true 인 기존 행은 거부 (확정 후 잠금).
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json() as SettlementOverride
    if (!body.rowKey || !body.type || !body.month) {
      return bad('rowKey, type, month required')
    }
    const user = await currentUser(req)
    const col = await getCollection()
    const now = new Date()

    // 확정 잠금 확인
    const existing = await col.findOne({ workspace_id: WORKSPACE, rowKey: body.rowKey })
    if (existing?.frozen) {
      return NextResponse.json(
        { error: { code: 'FROZEN', message: '확정된 행입니다. 잠금 해제(unconfirm) 후 수정 가능합니다.' } },
        { status: 409 },
      )
    }

    const setDoc: Record<string, unknown> = {
      type:       body.type,
      month:      body.month,
      overrides:  body.overrides ?? {},
      updated_at: now,
    }
    if (body.baseline !== undefined) setDoc.baseline = body.baseline

    await col.updateOne(
      { workspace_id: WORKSPACE, rowKey: body.rowKey },
      { $set: setDoc, $setOnInsert: { created_at: now } },
      { upsert: true },
    )
    await audit({
      rowKey: body.rowKey,
      action: existing ? 'update' : 'create',
      before: existing?.overrides ?? undefined,
      after: body.overrides,
      userId: user,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: { code: 'INTERNAL', message: msg } }, { status: 500 })
  }
}

// POST /api/v1/settlement-overrides?action=confirm|unconfirm   body: { rowKey }
//   → confirm: frozen=true + confirmedAt + confirmedBy 설정
//   → unconfirm: frozen=false 로 해제
export async function POST(req: NextRequest) {
  try {
    const action = req.nextUrl.searchParams.get('action')
    if (action !== 'confirm' && action !== 'unconfirm') {
      return bad('action=confirm|unconfirm 필수')
    }
    const body = await req.json().catch(() => ({})) as { rowKey?: string }
    if (!body.rowKey) return bad('rowKey required')

    const user = await currentUser(req)
    const col = await getCollection()
    const now = new Date()

    if (action === 'confirm') {
      await col.updateOne(
        { workspace_id: WORKSPACE, rowKey: body.rowKey },
        { $set: { frozen: true, confirmedAt: now, confirmedBy: user, updated_at: now } },
      )
      await audit({ rowKey: body.rowKey, action: 'confirm', userId: user })
    } else {
      await col.updateOne(
        { workspace_id: WORKSPACE, rowKey: body.rowKey },
        { $set: { frozen: false, updated_at: now }, $unset: { confirmedAt: '', confirmedBy: '' } },
      )
      await audit({ rowKey: body.rowKey, action: 'unconfirm', userId: user })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: { code: 'INTERNAL', message: msg } }, { status: 500 })
  }
}

// DELETE /api/v1/settlement-overrides?rowKey=...
//   frozen=true 인 행은 거부.
export async function DELETE(req: NextRequest) {
  try {
    const rowKey = req.nextUrl.searchParams.get('rowKey')
    if (!rowKey) return bad('rowKey required')
    const user = await currentUser(req)
    const col = await getCollection()
    const existing = await col.findOne({ workspace_id: WORKSPACE, rowKey })
    if (existing?.frozen) {
      return NextResponse.json(
        { error: { code: 'FROZEN', message: '확정된 행입니다. 잠금 해제 후 삭제 가능합니다.' } },
        { status: 409 },
      )
    }
    await col.deleteOne({ workspace_id: WORKSPACE, rowKey })
    await audit({
      rowKey,
      action: 'delete',
      before: existing?.overrides ?? undefined,
      userId: user,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: { code: 'INTERNAL', message: msg } }, { status: 500 })
  }
}
