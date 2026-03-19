'use server';

import { revalidatePath } from 'next/cache';
import clientPromise from '@/lib/mongodb';
import { RepositoryService } from '@/services/repositoryService';
import { CampaignConfig } from '@/types';

function toDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  const d = new Date(String(value));
  if (isNaN(d.getTime())) return undefined;
  return d;
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

function normalizeCampaignInput(input: CampaignConfig): CampaignConfig {
  const campaign: any = input as any;

  const sub_campaigns = Array.isArray(campaign.sub_campaigns) ? campaign.sub_campaigns : [];
  const normalizedSubs = sub_campaigns.map((sub: any) => ({
    ...sub,
    fee_rate: toNumber(sub.fee_rate, 10),
    budget: toNumber(sub.budget, 0),
    target_cpc: sub.target_cpc == null ? undefined : toNumber(sub.target_cpc, 0),
    target_ctr: sub.target_ctr == null ? undefined : toNumber(sub.target_ctr, 0),
    enabled: sub.enabled !== false,
  }));

  return {
    ...campaign,
    created_at: toDate(campaign.created_at),
    updated_at: toDate(campaign.updated_at),
    target_cpc: campaign.target_cpc == null ? undefined : toNumber(campaign.target_cpc, 0),
    target_ctr: campaign.target_ctr == null ? undefined : toNumber(campaign.target_ctr, 0),
    dashboard_layout: Array.isArray(campaign.dashboard_layout)
      ? campaign.dashboard_layout.map((x: any) => String(x)).filter(Boolean)
      : undefined,
    sub_campaigns: normalizedSubs,
  };
}

export async function getCampaignsAction() {
  try {
    const client = await clientPromise;
    const repo = new RepositoryService(client);
    const campaigns = await repo.getCampaigns();
    return { success: true, campaigns: JSON.parse(JSON.stringify(campaigns)) };
  } catch (error) {
    console.error('Failed to get campaigns:', error);
    return { success: false, error: String(error) };
  }
}

export async function saveCampaignAction(campaign: CampaignConfig) {
  try {
    const client = await clientPromise;
    const repo = new RepositoryService(client);
    const normalized = normalizeCampaignInput(campaign);
    await repo.upsertCampaignConfig(normalized);
    const campaigns = await repo.getCampaigns();
    revalidatePath('/');
    return { success: true, campaigns: JSON.parse(JSON.stringify(campaigns)) };
  } catch (error) {
    console.error('Failed to save campaign:', error);
    return { success: false, error: String(error) };
  }
}

export async function deleteCampaignAction(campaignId: string) {
  try {
    const client = await clientPromise;
    const repo = new RepositoryService(client);
    await repo.deleteCampaign(campaignId);
    const campaigns = await repo.getCampaigns();
    revalidatePath('/');
    return { success: true, campaigns: JSON.parse(JSON.stringify(campaigns)) };
  } catch (error) {
    console.error('Failed to delete campaign:', error);
    return { success: false, error: String(error) };
  }
}
