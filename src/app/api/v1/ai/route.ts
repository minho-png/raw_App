export const dynamic = 'force-dynamic';
/**
 * POST /api/v1/ai  - AI 인사이트 생성
 * GET  /api/v1/ai  - 최신 인사이트 조회
 * Auth 비활성화 모드, ANTHROPIC_API_KEY 있을 때만 실제 AI 호출
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import clientPromise from '@/lib/mongodb';
import { RepositoryService } from '@/services/repositoryService';
import { WorkspaceRepository, SYSTEM_WORKSPACE_ID } from '@/services/workspaceRepository';
import { generateCampaignInsight } from '@/services/ai/insightService';

const AiRequestSchema = z.object({
  campaign_id: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const result = AiRequestSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: result.error.flatten(),
    }, { status: 400 });
  }
  const { campaign_id } = result.data;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다.' }, { status: 503 });
  }

  try {
    const client = await clientPromise;
    const repo = new RepositoryService(client);
    const [campaigns, records] = await Promise.all([
      repo.getCampaigns(),
      repo.getPerformanceData(campaign_id),
    ]);

    const campaign = campaigns.find((c: any) => c.campaign_id === campaign_id);
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    if (records.length === 0) return NextResponse.json({ error: 'No performance data' }, { status: 422 });

    const insight = await generateCampaignInsight(campaign as any, records as any, SYSTEM_WORKSPACE_ID);
    const wsRepo = new WorkspaceRepository(client);
    await wsRepo.saveAiInsight(insight);

    return NextResponse.json({ data: insight }, { status: 201 });
  } catch (err: any) {
    console.error('[POST /api/v1/ai]', err);
    return NextResponse.json({ error: err.message ?? 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const campaignId = req.nextUrl.searchParams.get('campaign_id');
  if (!campaignId) return NextResponse.json({ error: 'campaign_id required' }, { status: 400 });

  try {
    const client = await clientPromise;
    const wsRepo = new WorkspaceRepository(client);
    const insight = await wsRepo.getLatestAiInsight(SYSTEM_WORKSPACE_ID, campaignId);
    return NextResponse.json({ data: insight });
  } catch (err) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
