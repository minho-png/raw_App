export const dynamic = 'force-dynamic';
/**
 * POST /api/v1/settlements/confirm
 *
 * 지정 연월의 전체 캠페인 DMP 정산 데이터를 dmp_settlements 컬렉션에 스냅샷으로 확정 저장.
 *
 * - upsert 키: { workspace_id, year, month, campaign_id: '__ALL__' }
 * - 동일 키가 존재하면 덮어씀 (재확정 시 멱등성 보장)
 * - 저장 대상은 processed_reports 집계 결과이므로 raw_metrics는 건드리지 않음
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import clientPromise from '@/lib/mongodb';
import { RepositoryService } from '@/services/repositoryService';
import { SYSTEM_WORKSPACE_ID } from '@/services/workspaceRepository';
import { AllCampaignsSettlementRow, MonthlySettlementResult } from '@/types';

// ---- Request validation ----

const ConfirmSettlementSchema = z.object({
  year: z
    .number()
    .int('year는 정수여야 합니다.')
    .min(2000, 'year는 2000 이상이어야 합니다.')
    .max(2100, 'year는 2100 이하여야 합니다.'),
  month: z
    .number()
    .int('month는 정수여야 합니다.')
    .min(1, 'month는 1 이상이어야 합니다.')
    .max(12, 'month는 12 이하여야 합니다.'),
});

// ---- Handler ----

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // 1. Body 파싱 및 유효성 검증
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Request body가 유효한 JSON이 아닙니다.', code: 'INVALID_JSON' },
        { status: 400 }
      );
    }

    const parsed = ConfirmSettlementSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: '입력값 검증 실패',
          code: 'VALIDATION_ERROR',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { year, month } = parsed.data;

    // 2. DB 연결 및 전체 캠페인 월별 집계 조회
    const client = await clientPromise;
    const repo = new RepositoryService(client);

    const rawRows = await repo.getAllCampaignsMonthlySettlementData(
      year,
      month
    ) as AllCampaignsSettlementRow[];

    if (rawRows.length === 0) {
      return NextResponse.json(
        {
          error: `${year}년 ${month}월에 저장된 정산 데이터가 없습니다.`,
          code: 'NO_DATA',
        },
        { status: 404 }
      );
    }

    // 3. AllCampaignsSettlementRow[] → MonthlySettlementResult 변환
    //    saveMonthlySettlement 시그니처: (workspaceId: string, data: MonthlySettlementResult)
    //    전체 집계 확정이므로 campaign_id는 sentinel '__ALL__' 사용.
    //    AllCampaignsSettlementRow의 fee_amount 필드를 DmpSettlementRow.fee_amount로 그대로 사용.
    const totalExecution = rawRows.reduce((sum, r) => sum + r.total_execution, 0);
    const totalNet = rawRows.reduce((sum, r) => sum + r.total_net, 0);
    const totalFee = rawRows.reduce((sum, r) => sum + r.fee_amount, 0);

    // AllCampaignsSettlementRow에는 예산 정보가 없으므로 diff_percentage는 0으로 설정.
    // 단일 캠페인 정산(saveMonthlySettlementAction)과 달리 전체 집계 확정은
    // budget 대비 검증이 의미 없음 — 대신 스냅샷 시점 기록이 목적.
    const settlementData: MonthlySettlementResult = {
      year,
      month,
      campaign_id: '__ALL__',
      rows: rawRows.map((r) => ({
        dmp_type: r.dmp_type,
        total_execution: r.total_execution,
        total_net: r.total_net,
        fee_amount: r.fee_amount,
        row_count: r.row_count,
      })),
      total_execution: totalExecution,
      total_net: totalNet,
      total_fee: totalFee,
      verification_status: 'valid',
      diff_percentage: 0,
    };

    // 4. dmp_settlements에 upsert
    //    upsert 키: { workspace_id: SYSTEM_WORKSPACE_ID, year, month, campaign_id: '__ALL__' }
    await repo.saveMonthlySettlement(SYSTEM_WORKSPACE_ID, settlementData);

    console.log(
      `[POST /api/v1/settlements/confirm] ${year}년 ${month}월 정산 확정 완료` +
        ` — rows=${rawRows.length}, total_execution=${totalExecution}, workspace=${SYSTEM_WORKSPACE_ID}`
    );

    return NextResponse.json({ success: true, confirmedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[POST /api/v1/settlements/confirm] 정산 확정 실패:', err);
    return NextResponse.json(
      { error: '정산 확정 처리 중 서버 오류가 발생했습니다.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
