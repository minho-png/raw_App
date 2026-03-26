export const dynamic = 'force-dynamic';
/**
 * GET  /api/v1/ad-accounts              — 광고계정 목록 (agency_id 필터 선택)
 * POST /api/v1/ad-accounts              — 광고계정 생성/업데이트 (upsert)
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import clientPromise from '@/lib/mongodb';
import { RepositoryService } from '@/services/repositoryService';
import { SYSTEM_WORKSPACE_ID } from '@/services/workspaceRepository';

const AdAccountSchema = z.object({
  account_id: z.string().optional(),
  agency_id: z.string().min(1),
  name: z.string().min(1).max(200),
  is_active: z.boolean().default(true),
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const agencyId = searchParams.get('agency_id') ?? undefined;
    const client = await clientPromise;
    const repo = new RepositoryService(client);
    const accounts = await repo.getAdAccounts(SYSTEM_WORKSPACE_ID, agencyId);
    return NextResponse.json({ data: accounts, total: accounts.length });
  } catch (err) {
    console.error('[GET /api/v1/ad-accounts]', err);
    return NextResponse.json({ error: 'Internal Server Error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = AdAccountSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: result.error.flatten() }, { status: 400 });
    }
    const client = await clientPromise;
    const repo = new RepositoryService(client);
    const accountId = await repo.upsertAdAccount({ ...result.data, workspace_id: SYSTEM_WORKSPACE_ID });
    return NextResponse.json({ success: true, account_id: accountId });
  } catch (err) {
    console.error('[POST /api/v1/ad-accounts]', err);
    return NextResponse.json({ error: 'Internal Server Error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
