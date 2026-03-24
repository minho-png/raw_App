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

    const safeRecords = shared.config.show_budget
      ? records
      : records.map(({ execution_amount, net_amount, cost, supply_value, ...r }: any) => r);

    return NextResponse.json({
      campaign: shared.config.show_budget
        ? campaign
        : { campaign_name: (campaign as any)?.campaign_name, campaign_id: (campaign as any)?.campaign_id },
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
