import { NextRequest, NextResponse } from 'next/server'
import clientPromise from '@/lib/mongodb'

/**
 * 매입/매출 행 수정값 영속화 — settlement_overrides 컬렉션
 *
 * rowKey 식별자 규칙 (settlementExcel.ts 빌더와 동기화):
 *   sales:    "sales:{month}:{campaignId}"
 *   purchase (CT+):    "purchase:{month}:{campaignId}:{media}"
 *   purchase (Motiv):  "purchase:{month}:motiv-{motivCampaignId}"
 *
 * 저장 스키마:
 *   { workspace_id, rowKey, type, month, overrides: {...}, updated_at, created_at }
 *
 * overrides 는 사용자가 변경한 필드만 저장 (Partial<SalesRow|PurchaseRow>).
 */

const COLLECTION = 'settlement_overrides'
const WORKSPACE  = 'system'

export interface SettlementOverride {
  rowKey: string
  type: 'sales' | 'purchase'
  month: string
  overrides: Record<string, unknown>
  updatedAt?: string
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
      updatedAt: d.updated_at?.toISOString?.() ?? d.updatedAt,
    }))
    return NextResponse.json({ data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// PUT /api/v1/settlement-overrides   body: SettlementOverride
//   → upsert by rowKey
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json() as SettlementOverride
    if (!body.rowKey || !body.type || !body.month) {
      return NextResponse.json({ error: 'rowKey, type, month required' }, { status: 400 })
    }
    const col = await getCollection()
    const now = new Date()
    await col.updateOne(
      { workspace_id: WORKSPACE, rowKey: body.rowKey },
      {
        $set: {
          type:      body.type,
          month:     body.month,
          overrides: body.overrides ?? {},
          updated_at: now,
        },
        $setOnInsert: { created_at: now },
      },
      { upsert: true },
    )
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// DELETE /api/v1/settlement-overrides?rowKey=...
export async function DELETE(req: NextRequest) {
  try {
    const rowKey = req.nextUrl.searchParams.get('rowKey')
    if (!rowKey) return NextResponse.json({ error: 'rowKey required' }, { status: 400 })
    const col = await getCollection()
    await col.deleteOne({ workspace_id: WORKSPACE, rowKey })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
