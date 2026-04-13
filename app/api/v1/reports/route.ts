import { NextRequest, NextResponse } from 'next/server'
import clientPromise from '@/lib/mongodb'

const COLLECTION   = 'ct_daily_reports'
const CHUNK_TYPE   = 'ct-plus-chunk'   // 청크 도큐먼트 타입
const WORKSPACE    = 'system'

async function getCol() {
  const client = await clientPromise
  const col = client.db('kim_dashboard').collection(COLLECTION)
  await col.createIndex({ workspace_id: 1, saved_at: -1 }, { background: true } as Parameters<typeof col.createIndex>[1])
  await col.createIndex({ workspace_id: 1, parentId: 1 }, { background: true } as Parameters<typeof col.createIndex>[1])
  return col
}

// GET /api/v1/reports?type=ct-plus           — 리포트 목록 (청크 제외)
// GET /api/v1/reports?parentId=XXX           — 특정 리포트의 청크 목록
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const type     = searchParams.get('type')     ?? 'ct-plus'
  const parentId = searchParams.get('parentId') ?? null

  try {
    const col = await getCol()

    if (parentId) {
      // 청크 전체 로드 (chunkIndex 순 정렬)
      const docs = await col
        .find({ workspace_id: WORKSPACE, type: CHUNK_TYPE, parentId })
        .sort({ chunkIndex: 1 })
        .toArray()
      return NextResponse.json({ chunks: docs.map(({ _id, ...d }) => d) })
    }

    // 일반 리포트 목록 (청크 도큐먼트 제외)
    const docs = await col
      .find({ workspace_id: WORKSPACE, type, chunked: { $ne: true } })
      .sort({ saved_at: -1 })
      .limit(50)
      .toArray()
    const chunkedDocs = await col
      .find({ workspace_id: WORKSPACE, type, chunked: true })
      .sort({ saved_at: -1 })
      .limit(50)
      .toArray()

    const all = [...docs, ...chunkedDocs].sort(
      (a, b) => new Date(b.saved_at).getTime() - new Date(a.saved_at).getTime()
    ).slice(0, 50)

    return NextResponse.json({ reports: all.map(({ _id, ...d }) => d) })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// POST /api/v1/reports  — 일반 저장
// POST /api/v1/reports  — 청크 저장 (body.isChunk=true, body.chunkIndex, body.parentId)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, type = 'ct-plus', isChunk, parentId, chunkIndex, ...rest } = body
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const col = await getCol()

    if (isChunk) {
      // 청크 도큐먼트 저장
      if (parentId === undefined || chunkIndex === undefined) {
        return NextResponse.json({ error: 'parentId and chunkIndex required for chunks' }, { status: 400 })
      }
      await col.updateOne(
        { workspace_id: WORKSPACE, id },
        {
          $set: {
            ...rest, id, type: CHUNK_TYPE,
            parentId, chunkIndex,
            workspace_id: WORKSPACE,
            saved_at: new Date(),
          }
        },
        { upsert: true }
      )
    } else {
      // 일반/부모 도큐먼트 저장
      await col.updateOne(
        { workspace_id: WORKSPACE, id },
        { $set: { ...rest, id, type, workspace_id: WORKSPACE, saved_at: new Date() } },
        { upsert: true }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// DELETE /api/v1/reports?id=<reportId>  — 부모 + 연결된 청크 모두 삭제
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  try {
    const col = await getCol()
    // 부모 삭제
    await col.deleteOne({ workspace_id: WORKSPACE, id })
    // 연결 청크 cascade 삭제
    await col.deleteMany({ workspace_id: WORKSPACE, type: CHUNK_TYPE, parentId: id })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
