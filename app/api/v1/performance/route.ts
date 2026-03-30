import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { RepositoryService, SYSTEM_WORKSPACE_ID } from '@/services/repositoryService';
import { CalculationService } from '@/services/calculationService';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get('campaign_id');
    if (!campaignId) return NextResponse.json({ success: false, error: 'campaign_id required' }, { status: 400 });

    const client = await clientPromise;
    const repo = new RepositoryService(client);
    const records = await repo.getPerformanceData(campaignId);
    return NextResponse.json({ success: true, records });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { campaignId, media, feeRate, rawData, columnMapping, campaignConfigs } = body;
    if (!campaignId || !media || !rawData) {
      return NextResponse.json({ success: false, error: 'campaignId, media, rawData required' }, { status: 400 });
    }

    const client = await clientPromise;
    const repo = new RepositoryService(client);
    const dmpRules = await repo.getDmpRules(SYSTEM_WORKSPACE_ID);

    const { raw, report } = CalculationService.processWithDanfo(
      rawData, campaignId, media, feeRate ?? 0, [], columnMapping, campaignConfigs, dmpRules
    );

    const result = await repo.upsertCampaignData([...raw, ...report]);
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
