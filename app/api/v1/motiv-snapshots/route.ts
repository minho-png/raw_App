import { NextRequest, NextResponse } from 'next/server'
import clientPromise from '@/lib/mongodb'

// GET /api/v1/motiv-snapshots?date=YYYY-MM-DD
// 분석 페이지의 전일 비교용 — 해당 date 의 motiv_daily_snapshots 문서 반환.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COLLECTION = 'motiv_daily_snapshots'

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date')
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date (YYYY-MM-DD) required' }, { status: 400 })
  }

  try {
    const client = await clientPromise
    const col = client.db('kim_dashboard').collection(COLLECTION)
    const doc = await col.findOne({ date }, { projection: { _id: 0 } })
    return NextResponse.json({ snapshot: doc ?? null })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
