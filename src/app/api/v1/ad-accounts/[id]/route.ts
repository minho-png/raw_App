export const dynamic = 'force-dynamic';
/**
 * PUT    /api/v1/ad-accounts/[id]  — 광고계정 수정
 * DELETE /api/v1/ad-accounts/[id]  — 광고계정 삭제
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import clientPromise from '@/lib/mongodb';
import { SYSTEM_WORKSPACE_ID } from '@/services/workspaceRepository';

const AdAccountUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  agency_id: z.string().min(1).optional(),
  is_active: z.boolean().optional(),
});

interface RouteContext {
  params: { id: string };
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'Account ID required', code: 'MISSING_ID' }, { status: 400 });
  }
  try {
    const body = await req.json();
    const result = AdAccountUpdateSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: result.error.flatten() },
        { status: 400 }
      );
    }
    const client = await clientPromise;
    const db = client.db('gfa_master_pro');
    const now = new Date();
    const updateResult = await db.collection('ad_accounts').updateOne(
      { account_id: id, workspace_id: SYSTEM_WORKSPACE_ID },
      { $set: { ...result.data, updated_at: now } }
    );
    if (updateResult.matchedCount === 0) {
      return NextResponse.json({ error: 'Account not found', code: 'NOT_FOUND' }, { status: 404 });
    }
    return NextResponse.json({ success: true, account_id: id });
  } catch (err) {
    console.error('[PUT /api/v1/ad-accounts/[id]]', err);
    return NextResponse.json({ error: 'Internal Server Error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'Account ID required', code: 'MISSING_ID' }, { status: 400 });
  }
  try {
    const client = await clientPromise;
    const db = client.db('gfa_master_pro');
    const result = await db.collection('ad_accounts').deleteOne({
      account_id: id,
      workspace_id: SYSTEM_WORKSPACE_ID,
    });
    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'Account not found', code: 'NOT_FOUND' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/v1/ad-accounts/[id]]', err);
    return NextResponse.json({ error: 'Internal Server Error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
