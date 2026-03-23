export const dynamic = 'force-dynamic';
/**
 * GET  /api/v1/campaigns  - 캠페인 목록
 * POST /api/v1/campaigns  - 캠페인 생성
 * Auth 비활성화 모드로 동작
 */
import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { RepositoryService } from '@/services/repositoryService';
import { genId } from '@/lib/idGenerator';

export async function GET() {
  try {
    const client = await clientPromise;
    const repo = new RepositoryService(client);
    const campaigns = await repo.getCampaigns();
    return NextResponse.json({ data: campaigns, total: campaigns.length });
  } catch (err) {
    console.error('[GET /api/v1/campaigns]', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const campaign = { ...body, campaign_id: body.campaign_id ?? genId() };
    const client = await clientPromise;
    const repo = new RepositoryService(client);
    await repo.upsertCampaignConfig(campaign);
    return NextResponse.json({ data: campaign }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/v1/campaigns]', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
