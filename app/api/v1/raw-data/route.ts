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

/** POST /api/v1/raw-data — 배치 1개 추가 (body: RawBatch)
 *
 * 중복 제거 전략:
 *   새 배치의 각 row에 대해 "날짜 + 매체 + 캠페인명 + 소재명" 조합이 같으면 동일 데이터로 판단.
 *   기존 배치들에서 해당 row를 먼저 제거한 뒤, 새 배치의 데이터로 교체(최신화)한다.
 *   row가 모두 제거된 빈 배치는 자동으로 삭제된다.
 */
export async function POST(req: NextRequest) {
  try {
    const batch: RawBatch = await req.json()
    if (!batch?.id) return NextResponse.json({ error: 'batch.id required' }, { status: 400 })

    const col = await getCol()
    const doc = await col.findOne({ workspace_id: WORKSPACE })
    const existingBatches: RawBatch[] = (doc?.batches ?? []) as RawBatch[]

    // 새 배치 row들의 고유키 셋 생성 (날짜 + 매체 + 캠페인명 + 소재명)
    const newRowKeys = new Set(
      batch.rows.map(r => `${r.date}||${r.media}||${r.campaignName}||${r.creativeName}`)
    )

    // 기존 배치에서 새 배치와 키가 겹치는 row 제거 → 새 데이터로 최신화
    const deduplicatedBatches = existingBatches
      .filter(b => b.id !== batch.id)               // 동일 id 배치는 완전 교체
      .map(b => ({
        ...b,
        rows: b.rows.filter(r => {
          const key = `${r.date}||${r.media}||${r.campaignName}||${r.creativeName}`
          return !newRowKeys.has(key)
        }),
      }))
      .filter(b => b.rows.length > 0)               // row 없어진 빈 배치 제거
      .map(b => ({ ...b, rowCount: b.rows.length })) // rowCount 동기화

    const updatedBatches = [...deduplicatedBatches, batch]

    await col.updateOne(
      { workspace_id: WORKSPACE },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {
        $set: { batches: updatedBatches, updated_at: new Date() },
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
