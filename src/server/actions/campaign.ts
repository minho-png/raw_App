'use server';

import { revalidatePath } from 'next/cache';
import clientPromise from '@/lib/mongodb';
import { RepositoryService } from '@/services/repositoryService';
import { CampaignConfig } from '@/types';

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
    await repo.upsertCampaignConfig(campaign);
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
