'use server';

import clientPromise from '@/lib/mongodb';
import { RepositoryService } from '@/services/repositoryService';
import { SYSTEM_WORKSPACE_ID } from '@/services/workspaceRepository';
import { DmpRule } from '@/types';

export async function getDmpRulesAction(): Promise<{ success: boolean; rules: DmpRule[] }> {
  try {
    const client = await clientPromise;
    const repo = new RepositoryService(client);
    const rules = await repo.getDmpRules(SYSTEM_WORKSPACE_ID);
    return { success: true, rules };
  } catch (e: any) {
    console.error('[getDmpRulesAction]', e);
    return { success: false, rules: [] };
  }
}

export async function upsertDmpRuleAction(
  rule: Partial<DmpRule>
): Promise<{ success: boolean; error?: string }> {
  try {
    const client = await clientPromise;
    const repo = new RepositoryService(client);
    await repo.upsertDmpRule({ ...rule, workspace_id: SYSTEM_WORKSPACE_ID });
    return { success: true };
  } catch (e: any) {
    console.error('[upsertDmpRuleAction]', e);
    return { success: false, error: e.message };
  }
}

export async function deleteDmpRuleAction(
  ruleId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const client = await clientPromise;
    const repo = new RepositoryService(client);
    await repo.deleteDmpRule(ruleId);
    return { success: true };
  } catch (e: any) {
    console.error('[deleteDmpRuleAction]', e);
    return { success: false, error: e.message };
  }
}
