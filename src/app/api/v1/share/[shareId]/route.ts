export const dynamic = 'force-dynamic';
/**
 * GET  /api/v1/share/[shareId]  - 공개 공유 보고서 데이터 (인증 불필요)
 * Auth 비활성화 모드, 비밀번호 보호 기능 제거
 */
import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { WorkspaceRepository } from '@/services/workspaceRepository';
import { RepositoryService } from '@/services/repositoryService';

export async function GET(req: NextRequest, { params }: { params: { shareId: string } }) {
  try {
    const client = await clientPromise;
    const wsRepo = new WorkspaceRepository(client);

    const shared = await wsRepo.getSharedReport(params.shareId);
    if (!shared) {
      return NextResponse.json({ error: '존재하지 않거나 만료된 링크입니다.' }, { status: 404 });
    }

    const repo = new RepositoryService(client);
    const [records, campaigns] = await Promise.all([
      repo.getPerformanceData(shared.campaign_id),
      repo.getCampaigns(),
    ]);
    const campaign = campaigns.find((c: any) => c.campaign_id === shared.campaign_id);

    wsRepo.incrementSharedReportViewCount(params.shareId).catch(() => {});

    // HF-1: 공유 보고서에서 원가/수수료 관련 민감 필드 제거
    // - records: supply_value, fee_rate 항상 비노출
    // - show_budget=false 인 경우 execution/net/cost까지 추가 비노출
    const sanitizeRecord = (record: any) => {
      const { supply_value, fee_rate, ...rest } = record;
      if (shared.config.show_budget) return rest;
      const { execution_amount, net_amount, cost, ...nonBudget } = rest;
      return nonBudget;
    };

    const safeRecords = records.map(sanitizeRecord);

    const safeCampaign = (() => {
      if (!campaign) return null;
      const base = shared.config.show_budget
        ? { ...campaign }
        : { campaign_name: (campaign as any).campaign_name, campaign_id: (campaign as any).campaign_id };

      if (Array.isArray((base as any).sub_campaigns)) {
        (base as any).sub_campaigns = (base as any).sub_campaigns.map(({ fee_rate, ...sub }: any) => sub);
      }
      return base;
    })();

    return NextResponse.json({
      campaign: safeCampaign,
      records: safeRecords,
      config: shared.config,
      generated_at: shared.created_at,
      view_count: shared.view_count,
    });
  } catch (err) {
    console.error('[GET /api/v1/share]', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
