'use server';

import { revalidatePath } from 'next/cache';
import clientPromise from '@/lib/mongodb';
import { RepositoryService } from '@/services/repositoryService';
import { PerformanceRecord, MonthlySettlementResult, DmpSettlementRow } from '@/types';

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
