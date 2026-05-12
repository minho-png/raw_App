import { NextRequest, NextResponse } from 'next/server'
import clientPromise from '@/lib/mongodb'
import type { Campaign, Agency, Advertiser, Operator } from '@/lib/campaignTypes'

type MasterDataType = 'campaigns' | 'agencies' | 'advertisers' | 'operators' | 'ct-groups'

const COLLECTION = 'ct_master_data'
const WORKSPACE  = 'system'

async function getCollection() {
  const client = await clientPromise
  return client.db('kim_dashboard').collection(COLLECTION)
}

// GET /api/v1/master-data?type=campaigns
export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type') as MasterDataType | null
  if (!type) return NextResponse.json({ error: 'type required' }, { status: 400 })
  try {
    const col = await getCollection()
    const doc = await col.findOne({ workspace_id: WORKSPACE, type })
    return NextResponse.json({ data: doc?.data ?? [] })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// POST /api/v1/master-data?type=campaigns  (body: { data: Campaign[] })
export async function POST(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type') as MasterDataType | null
  if (!type) return NextResponse.json({ error: 'type required' }, { status: 400 })
  try {
    const body = await req.json()
    const data: unknown[] = body.data ?? []
    const col = await getCollection()
    await col.updateOne(
      { workspace_id: WORKSPACE, type },
      { $set: { data, updated_at: new Date() }, $setOnInsert: { created_at: new Date() } },
      { upsert: true }
    )
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// PATCH /api/v1/master-data?type=campaigns  (body: { item: {...} })
// 단건 upsert — data 배열 안의 item.id 와 일치하는 원소를 갱신, 없으면 push.
// QA DB-003: 전체 배열 PUT 시 동시 편집 race 차단.
export async function PATCH(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type') as MasterDataType | null
  if (!type) return NextResponse.json({ error: 'type required' }, { status: 400 })
  try {
    const body = await req.json()
    const item = body.item as { id?: string } | undefined
    if (!item || !item.id) return NextResponse.json({ error: 'item.id required' }, { status: 400 })
    const col = await getCollection()
    // 1) 우선 동일 id 항목이 있으면 그 자리 갱신
    const updateRes = await col.updateOne(
      { workspace_id: WORKSPACE, type, 'data.id': item.id },
      { $set: { 'data.$': item, updated_at: new Date() } },
    )
    if (updateRes.matchedCount === 0) {
      // 2) 없으면 push (문서 자체가 없으면 upsert 로 생성)
      await col.updateOne(
        { workspace_id: WORKSPACE, type },
        {
          $push: { data: item } as never,
          $set: { updated_at: new Date() },
          $setOnInsert: { created_at: new Date() },
        },
        { upsert: true },
      )
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// DELETE /api/v1/master-data?type=campaigns&id=xxx
export async function DELETE(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type') as MasterDataType | null
  const id   = req.nextUrl.searchParams.get('id')
  if (!type) return NextResponse.json({ error: 'type required' }, { status: 400 })
  if (!id)   return NextResponse.json({ error: 'id required' }, { status: 400 })
  try {
    const col = await getCollection()
    await col.updateOne(
      { workspace_id: WORKSPACE, type },
      { $pull: { data: { id } } as never, $set: { updated_at: new Date() } },
    )
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
