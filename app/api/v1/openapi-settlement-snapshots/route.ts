import { NextRequest, NextResponse } from 'next/server'
import clientPromise from '@/lib/mongodb'
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth/session'

/**
 * Open API 정산 집계 스냅샷 (openapi_settlement_snapshots).
 *
 * 사용자 요청 (2026-06-22): "API 불러온 정보를 DB에 저장하고 DB의 데이터를 수정하고
 * CRUD를 통해 사용자가 개선·확인할 수 있도록 모든 정산을 진행".
 *
 * 워크플로우:
 *  1) 정산 페이지에서 "정산 진행" 버튼 → 현재 Open API /settlements 응답을 그대로
 *     본 collection 에 스냅샷으로 저장.
 *  2) 사용자가 스냅샷 metric 행을 직접 수정 (PUT 으로 rowEdits 누적).
 *  3) 확정 (POST ?action=confirm) → frozen=true 잠금 + audit_logs.
 *  4) 다음 페이지 진입 시 스냅샷 있으면 그 값을 우선 표시 (Open API 라이브 응답 대신).
 *
 * 데이터 모델:
 *   { workspace_id, month, groupBy:[GroupByDim],
 *     capturedAt, capturedBy,
 *     rows: [{ dimension:[...], metrics:{...}, _key:string }],  // Open API 원본 + 안정 key
 *     rowEdits: { [_key]: Partial<metrics> },                   // 사용자 수정값
 *     frozen?, confirmedAt?, confirmedBy?,
 *     createdAt, updatedAt }
 *
 * unique index: workspace_id + month + groupBy(join)
 */

const COLLECTION = 'openapi_settlement_snapshots'
const AUDIT_COLLECTION = 'settlement_audit_logs'
const WORKSPACE = 'system'

export type GroupByDim = 'DATE' | 'AGENCY' | 'MEDIA' | 'DATA_PROVIDER'

export interface SnapshotRow {
  /** dimension node 배열을 평탄화한 안정 key. 행 식별 + 사용자 수정값 매칭. */
  _key: string
  dimension: unknown[]
  metrics: Record<string, number>
}

export interface SettlementSnapshotDoc {
  month: string
  groupBy: GroupByDim[]
  capturedAt?: string
  capturedBy?: string
  rows: SnapshotRow[]
  rowEdits?: Record<string, Record<string, number>>
  frozen?: boolean
  confirmedAt?: string
  confirmedBy?: string
  updatedAt?: string
}

async function getCollection() {
  const client = await clientPromise
  const col = client.db('kim_dashboard').collection(COLLECTION)
  await col.createIndex(
    { workspace_id: 1, month: 1, groupByKey: 1 },
    { unique: true, background: true },
  ).catch(() => null)
  return col
}

async function currentUser(req: NextRequest): Promise<string> {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return 'system'
  const payload = await verifySessionToken(token)
  return payload?.username ?? 'system'
}

async function audit(entry: { rowKey: string; action: string; before?: unknown; after?: unknown; userId: string }) {
  try {
    const client = await clientPromise
    const col = client.db('kim_dashboard').collection(AUDIT_COLLECTION)
    await col.insertOne({ workspace_id: WORKSPACE, ...entry, timestamp: new Date() })
  } catch {
    console.error('[openapi-settlement-snapshots] audit insert failed')
  }
}

function bad(message: string, status = 400) {
  return NextResponse.json({ error: { code: 'BAD_REQUEST', message } }, { status })
}

const ALLOWED_GROUPBY: GroupByDim[] = ['DATE', 'AGENCY', 'MEDIA', 'DATA_PROVIDER']

function parseGroupBy(raw: string | null): GroupByDim[] | null {
  if (!raw) return null
  const tokens = raw.split(',').map(t => t.trim())
  for (const t of tokens) if (!ALLOWED_GROUPBY.includes(t as GroupByDim)) return null
  if (tokens.length === 0 || tokens.length > 4) return null
  return tokens as GroupByDim[]
}

// GET /api/v1/openapi-settlement-snapshots?month=2026-04&groupBy=AGENCY
//   → { data: SettlementSnapshotDoc | null }
export async function GET(req: NextRequest) {
  try {
    const month = req.nextUrl.searchParams.get('month')
    const groupBy = parseGroupBy(req.nextUrl.searchParams.get('groupBy'))
    if (!month) return bad('month required')
    if (!groupBy) return bad('groupBy 콤마결합 토큰 (DATE/AGENCY/MEDIA/DATA_PROVIDER) 필수')
    const groupByKey = groupBy.join(',')
    const col = await getCollection()
    const d = await col.findOne({ workspace_id: WORKSPACE, month, groupByKey })
    if (!d) return NextResponse.json({ data: null })
    const data: SettlementSnapshotDoc = {
      month: d.month,
      groupBy: d.groupBy ?? groupBy,
      capturedAt: d.capturedAt?.toISOString?.() ?? d.capturedAt,
      capturedBy: d.capturedBy,
      rows: d.rows ?? [],
      rowEdits: d.rowEdits ?? {},
      frozen: d.frozen ?? false,
      confirmedAt: d.confirmedAt?.toISOString?.() ?? d.confirmedAt,
      confirmedBy: d.confirmedBy,
      updatedAt: d.updated_at?.toISOString?.() ?? d.updatedAt,
    }
    return NextResponse.json({ data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: { code: 'INTERNAL', message: msg } }, { status: 500 })
  }
}

// PUT /api/v1/openapi-settlement-snapshots
//   body: { month, groupBy[], rows[], rowEdits? }
//   → upsert. frozen=true 면 rowEdits/rows 만 차단.
//
//   - rows 전달 → "정산 진행" (API 라이브 응답을 그대로 스냅샷). capturedAt/By 갱신.
//   - rowEdits 전달 → 사용자 수정값 누적.
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json() as SettlementSnapshotDoc
    if (!body.month) return bad('month required')
    if (!Array.isArray(body.groupBy) || body.groupBy.length === 0) return bad('groupBy[] required')
    for (const g of body.groupBy) if (!ALLOWED_GROUPBY.includes(g)) return bad(`groupBy 잘못된 값: ${g}`)

    const user = await currentUser(req)
    const col = await getCollection()
    const now = new Date()
    const groupByKey = body.groupBy.join(',')
    const existing = await col.findOne({ workspace_id: WORKSPACE, month: body.month, groupByKey })
    if (existing?.frozen) {
      return NextResponse.json(
        { error: { code: 'FROZEN', message: '확정된 스냅샷입니다. 잠금 해제 후 수정 가능합니다.' } },
        { status: 409 },
      )
    }

    const setDoc: Record<string, unknown> = {
      month: body.month,
      groupBy: body.groupBy,
      groupByKey,
      updated_at: now,
    }
    let action: 'capture' | 'edit'
    if (Array.isArray(body.rows) && body.rows.length > 0) {
      setDoc.rows = body.rows
      setDoc.capturedAt = now
      setDoc.capturedBy = user
      action = 'capture'
    } else {
      action = 'edit'
    }
    if (body.rowEdits && typeof body.rowEdits === 'object') {
      setDoc.rowEdits = body.rowEdits
    }

    await col.updateOne(
      { workspace_id: WORKSPACE, month: body.month, groupByKey },
      { $set: setDoc, $setOnInsert: { created_at: now } },
      { upsert: true },
    )
    await audit({
      rowKey: `openapi-snapshot:${body.month}:${groupByKey}`,
      action,
      before: existing ? { rows: existing.rows?.length ?? 0, rowEdits: existing.rowEdits } : undefined,
      after: { rows: setDoc.rows ? (setDoc.rows as SnapshotRow[]).length : undefined, rowEdits: setDoc.rowEdits },
      userId: user,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: { code: 'INTERNAL', message: msg } }, { status: 500 })
  }
}

// POST /api/v1/openapi-settlement-snapshots?action=confirm|unconfirm
//   body: { month, groupBy }
export async function POST(req: NextRequest) {
  try {
    const action = req.nextUrl.searchParams.get('action')
    if (action !== 'confirm' && action !== 'unconfirm') return bad('action=confirm|unconfirm')
    const body = await req.json().catch(() => ({})) as { month?: string; groupBy?: GroupByDim[] }
    if (!body.month || !Array.isArray(body.groupBy)) return bad('month, groupBy[] required')
    const groupByKey = body.groupBy.join(',')
    const user = await currentUser(req)
    const col = await getCollection()
    const now = new Date()
    if (action === 'confirm') {
      await col.updateOne(
        { workspace_id: WORKSPACE, month: body.month, groupByKey },
        { $set: { frozen: true, confirmedAt: now, confirmedBy: user, updated_at: now } },
      )
    } else {
      await col.updateOne(
        { workspace_id: WORKSPACE, month: body.month, groupByKey },
        { $set: { frozen: false, updated_at: now }, $unset: { confirmedAt: '', confirmedBy: '' } },
      )
    }
    await audit({ rowKey: `openapi-snapshot:${body.month}:${groupByKey}`, action, userId: user })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: { code: 'INTERNAL', message: msg } }, { status: 500 })
  }
}

// DELETE /api/v1/openapi-settlement-snapshots?month=...&groupBy=...
export async function DELETE(req: NextRequest) {
  try {
    const month = req.nextUrl.searchParams.get('month')
    const groupBy = parseGroupBy(req.nextUrl.searchParams.get('groupBy'))
    if (!month || !groupBy) return bad('month, groupBy required')
    const groupByKey = groupBy.join(',')
    const user = await currentUser(req)
    const col = await getCollection()
    const existing = await col.findOne({ workspace_id: WORKSPACE, month, groupByKey })
    if (existing?.frozen) {
      return NextResponse.json(
        { error: { code: 'FROZEN', message: '확정된 스냅샷입니다. 잠금 해제 후 삭제 가능합니다.' } },
        { status: 409 },
      )
    }
    await col.deleteOne({ workspace_id: WORKSPACE, month, groupByKey })
    await audit({ rowKey: `openapi-snapshot:${month}:${groupByKey}`, action: 'delete', userId: user })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: { code: 'INTERNAL', message: msg } }, { status: 500 })
  }
}
