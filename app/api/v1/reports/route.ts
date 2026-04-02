import { NextRequest, NextResponse } from 'next/server'
import clientPromise from '@/lib/mongodb'

const COLLECTION = 'ct_daily_reports'
const WORKSPACE  = 'system'

async function getCol() {
  const client = await clientPromise
  const col = client.db('kim_dashboard').collection(COLLECTION)
  // Ensure index once
  await col.createIndex({ workspace_id: 1, saved_at: -1 }, { background: true } as Parameters<typeof col.createIndex>[1])
  return col
}

// GET /api/v1/reports?type=ct-plus|ct-ctv
export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type') ?? 'ct-plus'
  try {
    const col = await getCol()
    const docs = await col
      .find({ workspace_id: WORKSPACE, type })
      .sort({ saved_at: -1 })
      .limit(50)
      .toArray()
    // Strip _id for client
    return NextResponse.json({ reports: docs.map(({ _id, ...d }) => d) })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// POST /api/v1/reports  (body: SavedReport object)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, type = 'ct-plus', ...rest } = body
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const col = await getCol()
    await col.updateOne(
      { workspace_id: WORKSPACE, id },
      { $set: { ...rest, id, type, workspace_id: WORKSPACE, saved_at: new Date() } },
      { upsert: true }
    )
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// DELETE /api/v1/reports?id=<reportId>
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  try {
    const col = await getCol()
    await col.deleteOne({ workspace_id: WORKSPACE, id })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
