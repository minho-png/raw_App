import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { RepositoryService, SYSTEM_WORKSPACE_ID } from '@/services/repositoryService';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const year = Number(searchParams.get('year') ?? new Date().getFullYear());
    const month = Number(searchParams.get('month') ?? new Date().getMonth() + 1);
    const campaignId = searchParams.get('campaign_id');

    const client = await clientPromise;
    const repo = new RepositoryService(client);

    if (campaignId) {
      const rows = await repo.getMonthlySettlementData(year, month, campaignId);
      return NextResponse.json({ success: true, rows });
    }

    const rows = await repo.getAllCampaignsMonthlySettlementData(year, month);
    return NextResponse.json({ success: true, rows });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const client = await clientPromise;
    const repo = new RepositoryService(client);
    const result = await repo.saveMonthlySettlement(SYSTEM_WORKSPACE_ID, body);
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
