'use server';

import clientPromise from '@/lib/mongodb';
import { RepositoryService } from '@/services/repositoryService';
import { SYSTEM_WORKSPACE_ID } from '@/services/workspaceRepository';
import { ImcCampaign } from '@/types';
import { genId } from '@/lib/idGenerator';

export async function getImcCampaignsAction(): Promise<{ success: boolean; campaigns: ImcCampaign[] }> {
  try {
    const client = await clientPromise;
    const repo = new RepositoryService(client);
    const campaigns = await repo.getImcCampaigns(SYSTEM_WORKSPACE_ID);
    return { success: true, campaigns };
  } catch (e: any) {
    console.error('[getImcCampaignsAction]', e);
    return { success: false, campaigns: [] };
  }
}

export async function createImcCampaignAction(
  name: string,
  description?: string,
  total_budget?: number
): Promise<{ success: boolean; campaign?: ImcCampaign; error?: string }> {
  try {
    const client = await clientPromise;
    const repo = new RepositoryService(client);
    const campaign = await repo.createImcCampaign({
      imc_campaign_id: `IMC-${genId(8)}`,
      workspace_id: SYSTEM_WORKSPACE_ID,
      name: name.trim(),
      description,
      total_budget,
    });
    return { success: true, campaign };
  } catch (e: any) {
    console.error('[createImcCampaignAction]', e);
    return { success: false, error: e.message };
  }
}

export async function updateImcCampaignAction(
  imcId: string,
  patch: Partial<Pick<ImcCampaign, 'name' | 'description' | 'total_budget'>>
): Promise<{ success: boolean; error?: string }> {
  try {
    const client = await clientPromise;
    const repo = new RepositoryService(client);
    await repo.updateImcCampaign(imcId, patch);
    return { success: true };
  } catch (e: any) {
    console.error('[updateImcCampaignAction]', e);
    return { success: false, error: e.message };
  }
}

export async function deleteImcCampaignAction(
  imcId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const client = await clientPromise;
    const repo = new RepositoryService(client);
    await repo.deleteImcCampaign(imcId);
    return { success: true };
  } catch (e: any) {
    console.error('[deleteImcCampaignAction]', e);
    return { success: false, error: e.message };
  }
}

export async function assignImcCampaignAction(
  campaignId: string,
  imcCampaignId: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const client = await clientPromise;
    const repo = new RepositoryService(client);
    await repo.assignImcCampaign(campaignId, imcCampaignId);
    return { success: true };
  } catch (e: any) {
    console.error('[assignImcCampaignAction]', e);
    return { success: false, error: e.message };
  }
}
