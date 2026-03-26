export const dynamic = 'force-dynamic';
/**
 * GET  /api/v1/agencies  — 대행사 목록
 * POST /api/v1/agencies  — 대행사 생성/업데이트 (upsert)
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import clientPromise from '@/lib/mongodb';
import { RepositoryService } from '@/services/repositoryService';
import { SYSTEM_WORKSPACE_ID } from '@/services/workspaceRepository';

const AgencySchema = z.object({
  agency_id: z.string().optional(),
  name: z.string().min(1).max(200),
  is_active: z.boolean().default(true),
});

export async function GET() {
  try {
    const client = await clientPromise;
    const repo = new RepositoryService(client);
    const agencies = await repo.getAgencies(SYSTEM_WORKSPACE_ID);
    return NextResponse.json({ data: agencies, total: agencies.length });
  } catch (err) {
    console.error('[GET /api/v1/agencies]', err);
    return NextResponse.json({ error: 'Internal Server Error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = AgencySchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: result.error.flatten() }, { status: 400 });
    }
    const client = await clientPromise;
    const repo = new RepositoryService(client);
    const agencyId = await repo.upsertAgency({ ...result.data, workspace_id: SYSTEM_WORKSPACE_ID });
    return NextResponse.json({ success: true, agency_id: agencyId });
  } catch (err) {
    console.error('[POST /api/v1/agencies]', err);
    return NextResponse.json({ error: 'Internal Server Error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
