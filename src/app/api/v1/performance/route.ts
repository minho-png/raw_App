import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { RepositoryService } from '@/services/repositoryService';

/**
 * GET /api/v1/performance?imc_campaign_id=XXX[&start=YYYY-MM-DD&end=YYYY-MM-DD]
 *
 * IMC 마스터 캠페인 하위 전체 캠페인의 성과 데이터를 집계하여 반환.
 * 각 캠페인별 records 배열 + 전체 합산 summary를 함께 반환한다.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const imcId = searchParams.get('imc_campaign_id');

    if (!imcId) {
      return NextResponse.json({ success: false, error: 'imc_campaign_id required' }, { status: 400 });
    }

    const startParam = searchParams.get('start');
    const endParam = searchParams.get('end');

    const client = await clientPromise;
    const repo = new RepositoryService(client);
    const groups = await repo.getPerformanceDataByImc(imcId);

    // 날짜 필터 적용
    const filterByDate = (records: any[]) => {
      if (!startParam && !endParam) return records;
      const start = startParam ? new Date(startParam).getTime() : 0;
      const end = endParam ? new Date(endParam + 'T23:59:59Z').getTime() : Infinity;
      return records.filter(r => {
        const d = new Date(r.date).getTime();
        return d >= start && d <= end;
      });
    };

    const result = groups.map(g => ({
      ...g,
      records: filterByDate(g.records),
    }));

    // 전체 합산 summary
    const allRecords = result.flatMap(g => g.records);
    const total_impressions = allRecords.reduce((s, r) => s + (r.impressions ?? 0), 0);
    const total_clicks = allRecords.reduce((s, r) => s + (r.clicks ?? 0), 0);
    const total_cost = allRecords.reduce((s, r) => s + (r.execution_amount ?? 0), 0);
    const summary = {
      total_impressions,
      total_clicks,
      total_cost,
      total_records: allRecords.length,
      avg_ctr: total_impressions > 0 ? (total_clicks / total_impressions) * 100 : 0,
      avg_cpc: total_clicks > 0 ? total_cost / total_clicks : 0,
    };

    return NextResponse.json({ success: true, groups: result, summary });
  } catch (e: any) {
    console.error('[GET /api/v1/performance]', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
