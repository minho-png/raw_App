import { NextRequest, NextResponse } from 'next/server'
import clientPromise from '@/lib/mongodb'
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth/session'

/**
 * 캠페인별 대행수수료 다중 지급처 (agency_fee_splits).
 *
 * 사용자 요청 (2026-06-22): "대행사명을 분리하거나 하나의 캠페인에 수수료 지급처가
 * 여러 개 있을 수 있어 추가적인 수수료 지급처를 작성하고 해당 금액을 반영"
 *
 * 데이터 모델:
 *   { workspace_id, month, campaignId,
 *     splits: [{ agencyId?, agencyName, amount, memo? }],
 *     totalAmount,        // splits.amount 합 — UI/리포트 검증용
 *     baselineAmount?,    // 정산 시점 자동 산출액(차이 감지)
 *     confirmedAt?, confirmedBy?, frozen?,
 *     createdAt, updatedAt }
 *
 * unique index: workspace_id + month + campaignId
 *
 * 합계 검증: splits.amount 합 vs baselineAmount — 차이는 클라이언트 표시로만 노출
 * (강제 매칭 안 함, 사용자 자율).
 */

const COLLECTION = 'agency_fee_splits'
const AUDIT_COLLECTION = 'settlement_audit_logs'
const WORKSPACE = 'system'

export interface AgencyFeeSplit {
  /** 내부 agencies 마스터 id (선택) — 없으면 free-form agencyName 만. */
  agencyId?: string
  agencyName: string
  amount: number
  memo?: string
}

export interface AgencyFeeSplitDoc {
  month: string
  /** 캠페인 ID — Motiv: `motiv-{id}`, CT+: `{campaignId}`. */
  campaignId: string
  splits: AgencyFeeSplit[]
  totalAmount: number
  baselineAmount?: number
  confirmedAt?: string
  confirmedBy?: string
  frozen?: boolean
  updatedAt?: string
}

async function getCollection() {
  const client = await clientPromise
  const col = client.db('kim_dashboard').collection(COLLECTION)
  await col.createIndex(
    { workspace_id: 1, month: 1, campaignId: 1 },
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
    console.error('[agency-fee-splits] audit insert failed')
  }
}

function bad(message: string, status = 400) {
  return NextResponse.json({ error: { code: 'BAD_REQUEST', message } }, { status })
}

function sumSplits(splits: AgencyFeeSplit[]): number {
  return splits.reduce((s, x) => s + (Number(x.amount) || 0), 0)
}

// GET /api/v1/agency-fee-splits?month=2026-04[&campaignId=motiv-123]
export async function GET(req: NextRequest) {
  try {
    const month = req.nextUrl.searchParams.get('month')
    const campaignId = req.nextUrl.searchParams.get('campaignId')
    if (!month) return bad('month required')
    const col = await getCollection()
    const filter: Record<string, unknown> = { workspace_id: WORKSPACE, month }
    if (campaignId) filter.campaignId = campaignId
    const docs = await col.find(filter).toArray()
    const data: AgencyFeeSplitDoc[] = docs.map(d => ({
      month: d.month,
      campaignId: d.campaignId,
      splits: d.splits ?? [],
      totalAmount: d.totalAmount ?? 0,
      baselineAmount: d.baselineAmount,
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

// PUT /api/v1/agency-fee-splits   body: AgencyFeeSplitDoc
//   upsert by (month, campaignId). frozen=true 면 409.
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json() as AgencyFeeSplitDoc
    if (!body.month || !body.campaignId) return bad('month, campaignId required')
    if (!Array.isArray(body.splits)) return bad('splits[] required')
    // 각 split 검증
    for (const s of body.splits) {
      if (!s.agencyName || typeof s.agencyName !== 'string') {
        return bad('splits[].agencyName 필수')
      }
      if (!Number.isFinite(Number(s.amount))) {
        return bad('splits[].amount 는 숫자')
      }
    }

    const user = await currentUser(req)
    const col = await getCollection()
    const now = new Date()
    const existing = await col.findOne({ workspace_id: WORKSPACE, month: body.month, campaignId: body.campaignId })
    if (existing?.frozen) {
      return NextResponse.json(
        { error: { code: 'FROZEN', message: '확정된 행입니다. 잠금 해제 후 수정 가능합니다.' } },
        { status: 409 },
      )
    }
    const totalAmount = sumSplits(body.splits)
    const setDoc: Record<string, unknown> = {
      splits: body.splits,
      totalAmount,
      updated_at: now,
    }
    if (body.baselineAmount !== undefined) setDoc.baselineAmount = body.baselineAmount

    await col.updateOne(
      { workspace_id: WORKSPACE, month: body.month, campaignId: body.campaignId },
      { $set: setDoc, $setOnInsert: { created_at: now } },
      { upsert: true },
    )
    await audit({
      rowKey: `agency-fee-splits:${body.month}:${body.campaignId}`,
      action: existing ? 'update' : 'create',
      before: existing?.splits ?? undefined,
      after: body.splits,
      userId: user,
    })
    return NextResponse.json({ ok: true, totalAmount })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: { code: 'INTERNAL', message: msg } }, { status: 500 })
  }
}

// POST /api/v1/agency-fee-splits?action=confirm|unconfirm   body: { month, campaignId }
export async function POST(req: NextRequest) {
  try {
    const action = req.nextUrl.searchParams.get('action')
    if (action !== 'confirm' && action !== 'unconfirm') return bad('action=confirm|unconfirm 필수')
    const body = await req.json().catch(() => ({})) as { month?: string; campaignId?: string }
    if (!body.month || !body.campaignId) return bad('month, campaignId required')
    const user = await currentUser(req)
    const col = await getCollection()
    const now = new Date()
    if (action === 'confirm') {
      await col.updateOne(
        { workspace_id: WORKSPACE, month: body.month, campaignId: body.campaignId },
        { $set: { frozen: true, confirmedAt: now, confirmedBy: user, updated_at: now } },
      )
    } else {
      await col.updateOne(
        { workspace_id: WORKSPACE, month: body.month, campaignId: body.campaignId },
        { $set: { frozen: false, updated_at: now }, $unset: { confirmedAt: '', confirmedBy: '' } },
      )
    }
    await audit({
      rowKey: `agency-fee-splits:${body.month}:${body.campaignId}`,
      action,
      userId: user,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: { code: 'INTERNAL', message: msg } }, { status: 500 })
  }
}

// DELETE /api/v1/agency-fee-splits?month=...&campaignId=...
export async function DELETE(req: NextRequest) {
  try {
    const month = req.nextUrl.searchParams.get('month')
    const campaignId = req.nextUrl.searchParams.get('campaignId')
    if (!month || !campaignId) return bad('month, campaignId required')
    const user = await currentUser(req)
    const col = await getCollection()
    const existing = await col.findOne({ workspace_id: WORKSPACE, month, campaignId })
    if (existing?.frozen) {
      return NextResponse.json(
        { error: { code: 'FROZEN', message: '확정된 행입니다. 잠금 해제 후 삭제 가능합니다.' } },
        { status: 409 },
      )
    }
    await col.deleteOne({ workspace_id: WORKSPACE, month, campaignId })
    await audit({
      rowKey: `agency-fee-splits:${month}:${campaignId}`,
      action: 'delete',
      before: existing?.splits ?? undefined,
      userId: user,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: { code: 'INTERNAL', message: msg } }, { status: 500 })
  }
}
