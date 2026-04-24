import { NextRequest, NextResponse } from 'next/server'
import clientPromise from '@/lib/mongodb'
import type { MotivAssignment } from '@/lib/motivApi/productMapping'

const COLLECTION = 'motiv_assignments'
const WORKSPACE  = 'system'

async function getCollection() {
  const client = await clientPromise
  const col = client.db('kim_dashboard').collection(COLLECTION)
  // lazy index (no-op if exists)
  await col.createIndex(
    { workspace_id: 1, motivCampaignId: 1 },
    { unique: true, background: true }
  ).catch(() => null)
  return col
}

// GET /api/v1/motiv-assignments
//   → { data: MotivAssignment[] }
export async function GET() {
  try {
    const col = await getCollection()
    const docs = await col.find({ workspace_id: WORKSPACE }).toArray()
    const data: MotivAssignment[] = docs.map(d => ({
      motivCampaignId:     d.motivCampaignId,
      agencyId:            d.agencyId ?? undefined,
      advertiserId:        d.advertiserId ?? undefined,
      operatorId:          d.operatorId ?? undefined,
      customAgencyFeeRate: d.customAgencyFeeRate ?? undefined,
      memo:                d.memo ?? undefined,
      updatedAt:           d.updated_at?.toISOString?.() ?? d.updatedAt,
    }))
    return NextResponse.json({ data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// PUT /api/v1/motiv-assignments   body: MotivAssignment
//   → upsert by (workspace_id, motivCampaignId)
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json() as MotivAssignment
    const mid = Number(body.motivCampaignId)
    if (!Number.isFinite(mid) || mid <= 0) {
      return NextResponse.json({ error: 'motivCampaignId required' }, { status: 400 })
    }
    const col = await getCollection()
    const now = new Date()
    await col.updateOne(
      { workspace_id: WORKSPACE, motivCampaignId: mid },
      {
        $set: {
          agencyId:            body.agencyId ?? null,
          advertiserId:        body.advertiserId ?? null,
          operatorId:          body.operatorId ?? null,
          customAgencyFeeRate: body.customAgencyFeeRate ?? null,
          memo:                body.memo ?? null,
          updated_at:          now,
        },
        $setOnInsert: { created_at: now },
      },
      { upsert: true }
    )
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// DELETE /api/v1/motiv-assignments?motivCampaignId=123
export async function DELETE(req: NextRequest) {
  try {
    const mid = Number(req.nextUrl.searchParams.get('motivCampaignId'))
    if (!Number.isFinite(mid) || mid <= 0) {
      return NextResponse.json({ error: 'motivCampaignId required' }, { status: 400 })
    }
    const col = await getCollection()
    await col.deleteOne({ workspace_id: WORKSPACE, motivCampaignId: mid })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
