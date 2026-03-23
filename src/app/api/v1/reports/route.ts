export const dynamic = 'force-dynamic';
/**
 * POST /api/v1/reports  - 공유 보고서 링크 생성
 * GET  /api/v1/reports  - 공유 링크 목록
 * Auth 비활성화 모드로 동작
 */
import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { WorkspaceRepository, SYSTEM_WORKSPACE_ID } from '@/services/workspaceRepository';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { campaign_id, config, expires_in_days } = body;

    const client = await clientPromise;
    const wsRepo = new WorkspaceRepository(client);

    const expires_at = expires_in_days
      ? new Date(Date.now() + expires_in_days * 24 * 60 * 60 * 1000)
      : undefined;

    const shared = await wsRepo.createSharedReport({
      workspace_id: SYSTEM_WORKSPACE_ID,
      campaign_id,
      created_by: 'system',
      expires_at,
      last_viewed_at: undefined,
      config: config ?? {
        sections: ['trend', 'dmp_share', 'budget', 'audience'],
        show_budget: false,
        branding: true,
      },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const shareUrl = `${appUrl}/share/${shared.share_id}`;
    return NextResponse.json({ share_id: shared.share_id, url: shareUrl, expires_at }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/v1/reports]', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const campaignId = req.nextUrl.searchParams.get('campaign_id');
  if (!campaignId) {
    return NextResponse.json({ error: 'campaign_id required' }, { status: 400 });
  }
  try {
    const client = await clientPromise;
    const wsRepo = new WorkspaceRepository(client);
    const reports = await wsRepo.getSharedReportsByCampaign(SYSTEM_WORKSPACE_ID, campaignId);
    return NextResponse.json({ data: reports });
  } catch (err) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
