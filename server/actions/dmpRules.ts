'use server';

import clientPromise from '@/lib/mongodb';
import { RepositoryService, SYSTEM_WORKSPACE_ID } from '@/services/repositoryService';
import { DmpRule } from '@/types';

export async function getDmpRules() {
  const client = await clientPromise;
  const repo = new RepositoryService(client);
  const rules = await repo.getDmpRules(SYSTEM_WORKSPACE_ID);
  return { success: true, rules };
}

export async function saveDmpRule(rule: Partial<DmpRule>) {
  const client = await clientPromise;
  const repo = new RepositoryService(client);
  await repo.upsertDmpRule({ ...rule, workspace_id: SYSTEM_WORKSPACE_ID });
  return { success: true };
}

export async function removeDmpRule(ruleId: string) {
  const client = await clientPromise;
  const repo = new RepositoryService(client);
  await repo.deleteDmpRule(ruleId);
  return { success: true };
}
