'use server';

import clientPromise from '@/lib/mongodb';
import { RepositoryService, SYSTEM_WORKSPACE_ID } from '@/services/repositoryService';
import { MonthlySettlementResult } from '@/types';

export async function getMonthlySettlement(year: number, month: number, campaignId: string) {
  const client = await clientPromise;
  const repo = new RepositoryService(client);
  const rows = await repo.getMonthlySettlementData(year, month, campaignId);

  const totalExecution = rows.reduce((s: number, r: any) => s + (r.total_execution || 0), 0);
  const totalNet = rows.reduce((s: number, r: any) => s + (r.total_net || 0), 0);
  const totalFee = rows.reduce((s: number, r: any) => s + (r.fee_amount || 0), 0);
  const diffPct = totalExecution > 0 ? Math.abs(totalExecution - totalNet) / totalExecution * 100 : 0;

  return {
    success: true,
    result: {
      year, month, campaign_id: campaignId, rows,
      total_execution: totalExecution,
      total_net: totalNet,
      total_fee: totalFee,
      verification_status: diffPct < 20 ? 'valid' : 'warning',
      diff_percentage: diffPct,
    } as MonthlySettlementResult,
  };
}

export async function getAllCampaignsSettlement(year: number, month: number) {
  const client = await clientPromise;
  const repo = new RepositoryService(client);
  const rows = await repo.getAllCampaignsMonthlySettlementData(year, month);
  return { success: true, rows };
}

export async function saveSettlement(data: MonthlySettlementResult) {
  const client = await clientPromise;
  const repo = new RepositoryService(client);
  const result = await repo.saveMonthlySettlement(SYSTEM_WORKSPACE_ID, data);
  return { success: true, ...result };
}
