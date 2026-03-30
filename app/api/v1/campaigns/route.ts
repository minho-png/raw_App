import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { RepositoryService, SYSTEM_WORKSPACE_ID } from '@/services/repositoryService';
import { genId } from '@/lib/idGenerator';

export async function GET() {
  try {
    const client = await clientPromise;
    const repo = new RepositoryService(client);
    const campaigns = await repo.getCampaigns(SYSTEM_WORKSPACE_ID);
    return NextResponse.json({ success: true, campaigns });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const client = await clientPromise;
    const repo = new RepositoryService(client);

    const campaign = {
      campaign_id: body.campaign_id ?? genId(16),
      workspace_id: SYSTEM_WORKSPACE_ID,
      ...body,
    };

    await repo.upsertCampaignConfig(campaign);
    return NextResponse.json({ success: true, campaign });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
