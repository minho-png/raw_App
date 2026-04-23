import { NextRequest, NextResponse } from 'next/server'
import clientPromise from '@/lib/mongodb'
import type { RawBatch } from '@/lib/rawDataStore'

const COLLECTION = 'ct_raw_data'
const WORKSPACE  = 'system'

async function getCol() {
  const client = await clientPromise
  return client.db('kim_dashboard').collection(COLLECTION)
}

/** GET /api/v1/raw-data — 전체 배치 목록 반환 */
export async function GET(_req: NextRequest) {
  try {
    const col = await getCol()
    const doc = await col.findOne({ workspace_id: WORKSPACE })
    return NextResponse.json({ batches: (doc?.batches ?? []) as RawBatch[] })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

/** POST /api/v1/raw-data — 배치 1개 추가 (body: RawBatch) */
export async function POST(req: NextRequest) {
  try {
    const batch: RawBatch = await req.json()
    if (!batch?.id) return NextResponse.json({ error: 'batch.id required' }, { status: 400 })
    const col = await getCol()
    // 중복 id 방지: 같은 id가 있으면 교체
    await col.updateOne(
      { workspace_id: WORKSPACE },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { $pull: { batches: { id: batch.id } } } as any,
      { upsert: true }
    )
    await col.updateOne(
      { workspace_id: WORKSPACE },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {
        $push: { batches: batch },
        $set:  { updated_at: new Date() },
        $setOnInsert: { created_at: new Date() },
      } as any,
      { upsert: true }
    )
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

/** DELETE /api/v1/raw-data — 전체 초기화 */
export async function DELETE(_req: NextRequest) {
  try {
    const col = await getCol()
    await col.deleteOne({ workspace_id: WORKSPACE })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
