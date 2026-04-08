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
