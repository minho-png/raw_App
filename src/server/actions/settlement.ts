'use server';

import { revalidatePath } from 'next/cache';
import clientPromise from '@/lib/mongodb';
import { RepositoryService } from '@/services/repositoryService';
import { WorkspaceRepository } from '@/services/workspaceRepository';
import { PerformanceRecord, MonthlySettlementResult, DmpSettlementRow, AllCampaignsSettlementRow, AllCampaignsSettlementResult } from '@/types';

/**
 * savePerformanceData: Saves processed CSV records to MongoDB.
 */
export async function savePerformanceData(records: PerformanceRecord[]) {
  try {
    const client = await clientPromise;
    const repo = new RepositoryService(client);
    
    // Ensure dates are actual Date objects (serializable from client)
    const normalizedRecords = records.map(r => ({
      ...r,
      date: new Date(r.date)
    }));

    const result = await repo.upsertCampaignData(normalizedRecords);

    // 데이터 갱신 후 관련 캠페인의 AI 인사이트를 stale로 표시
    const uniqueCampaignIds = Array.from(new Set(normalizedRecords.map(r => r.campaign_id)));
    const wsRepo = new WorkspaceRepository(client);
    await wsRepo.invalidateAiInsights(uniqueCampaignIds);

    revalidatePath('/');
    return { success: true, ...result };
  } catch (error) {
    console.error('Failed to save performance data:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * getMonthlySettlement: Fetches and calculates DMP settlement for a specific month.
 */
export async function getMonthlySettlement(year: number, month: number, campaignId: string, budget: number): Promise<MonthlySettlementResult | { error: string }> {
  try {
    const client = await clientPromise;
    const repo = new RepositoryService(client);
    
    const rawRows = await repo.getMonthlySettlementData(year, month, campaignId);
    const rows = rawRows as DmpSettlementRow[];
    
    const totalExecution = rows.reduce((sum, r) => sum + r.total_execution, 0);
    const totalNet = rows.reduce((sum, r) => sum + r.total_net, 0);
    const totalFee = rows.reduce((sum, r) => sum + r.fee_amount, 0);
    
    // Verification: Compare totalExecution with budget
    // Gap should be less than 1%
    const diff = Math.abs(totalExecution - budget);
    const diffPercentage = budget > 0 ? (diff / budget) * 100 : 0;
    const verificationStatus = diffPercentage >= 1 ? 'warning' : 'valid';

    return {
      year,
      month,
      campaign_id: campaignId,
      rows,
      total_execution: totalExecution,
      total_net: totalNet,
      total_fee: totalFee,
      verification_status: verificationStatus,
      diff_percentage: diffPercentage
    };
  } catch (error) {
    console.error('Failed to get monthly settlement:', error);
    return { error: String(error) };
  }
}

/**
 * getPerformanceDataAction: Fetches all performance records for a campaign from MongoDB.
 */
export async function getPerformanceDataAction(campaignId: string) {
  try {
    const client = await clientPromise;
    const repo = new RepositoryService(client);
    const data = await repo.getPerformanceData(campaignId);
    return { success: true, data: JSON.parse(JSON.stringify(data)) };
  } catch (error) {
    console.error('Failed to get performance data:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * getAllCampaignsMonthlySettlement: 전체 캠페인 월별 DMP 정산 조회
 */
export async function getAllCampaignsMonthlySettlement(year: number, month: number): Promise<AllCampaignsSettlementResult | { error: string }> {
  try {
    const client = await clientPromise;
    const repo = new RepositoryService(client);

    const rows = await repo.getAllCampaignsMonthlySettlementData(year, month) as AllCampaignsSettlementRow[];

    const total_execution = rows.reduce((s, r) => s + r.total_execution, 0);
    const total_net = rows.reduce((s, r) => s + r.total_net, 0);
    const total_fee = rows.reduce((s, r) => s + r.fee_amount, 0);

    return { year, month, rows, total_execution, total_net, total_fee };
  } catch (error) {
    console.error('Failed to get all campaigns monthly settlement:', error);
    return { error: String(error) };
  }
}

/**
 * updatePerformanceDataAction: Updates a single performance record.
 */
export async function updatePerformanceDataAction(id: string, updates: Partial<PerformanceRecord>) {
  try {
    const client = await clientPromise;
    const repo = new RepositoryService(client);
    await repo.updatePerformanceData(id, updates);
    revalidatePath('/');
    return { success: true };
  } catch (error) {
    console.error('Failed to update performance data:', error);
    return { success: false, error: String(error) };
  }
}
