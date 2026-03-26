export const dynamic = 'force-dynamic';
/**
 * GET    /api/v1/dmp-rules           — DMP 규칙 목록
 * POST   /api/v1/dmp-rules           — DMP 규칙 생성/업데이트 (upsert)
 * DELETE /api/v1/dmp-rules?rule_id=  — DMP 규칙 소프트 삭제
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import clientPromise from '@/lib/mongodb';
import { RepositoryService } from '@/services/repositoryService';
import { SYSTEM_WORKSPACE_ID } from '@/services/workspaceRepository';

const DmpRuleSchema = z.object({
  rule_id: z.string().optional(),
  match_field: z.enum(['ad_group_name']).default('ad_group_name'),
  match_type: z.enum(['contains', 'startsWith', 'equals']),
  keyword: z.string().min(1).max(100),
  map_to: z.string().min(1).max(100),
  priority: z.number().int().min(0).max(9999),
  is_active: z.boolean().default(true),
  account_id: z.string().optional(),
});

export async function GET() {
  try {
    const client = await clientPromise;
    const repo = new RepositoryService(client);
    const rules = await repo.getDmpRules(SYSTEM_WORKSPACE_ID);
    return NextResponse.json({ data: rules, total: rules.length });
  } catch (err) {
    console.error('[GET /api/v1/dmp-rules]', err);
    return NextResponse.json({ error: 'Internal Server Error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = DmpRuleSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: result.error.flatten() }, { status: 400 });
    }
    const client = await clientPromise;
    const repo = new RepositoryService(client);
    await repo.upsertDmpRule({ ...result.data, workspace_id: SYSTEM_WORKSPACE_ID });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[POST /api/v1/dmp-rules]', err);
    return NextResponse.json({ error: 'Internal Server Error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ruleId = searchParams.get('rule_id');
    if (!ruleId) {
      return NextResponse.json({ error: 'rule_id is required', code: 'VALIDATION_ERROR' }, { status: 400 });
    }
    const client = await clientPromise;
    const repo = new RepositoryService(client);
    await repo.deleteDmpRule(ruleId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/v1/dmp-rules]', err);
    return NextResponse.json({ error: 'Internal Server Error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
