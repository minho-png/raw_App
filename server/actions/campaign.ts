'use server';

import clientPromise from '@/lib/mongodb';
import { RepositoryService, SYSTEM_WORKSPACE_ID } from '@/services/repositoryService';
import { CampaignConfig } from '@/types';
import { genId } from '@/lib/idGenerator';

export async function getCampaigns() {
  const client = await clientPromise;
  const repo = new RepositoryService(client);
  const campaigns = await repo.getCampaigns(SYSTEM_WORKSPACE_ID);
  return { success: true, campaigns };
}

export async function saveCampaign(campaign: Partial<CampaignConfig>) {
  const client = await clientPromise;
  const repo = new RepositoryService(client);
  const data = {
    campaign_id: campaign.campaign_id ?? genId(16),
    workspace_id: SYSTEM_WORKSPACE_ID,
    sub_campaigns: [],
    ...campaign,
  } as CampaignConfig;
  await repo.upsertCampaignConfig(data);
  return { success: true, campaign: data };
}

export async function deleteCampaign(campaignId: string) {
  const client = await clientPromise;
  const repo = new RepositoryService(client);
  await repo.deleteCampaign(campaignId);
  return { success: true };
}
