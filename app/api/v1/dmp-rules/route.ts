import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { RepositoryService, SYSTEM_WORKSPACE_ID } from '@/services/repositoryService';

export async function GET() {
  try {
    const client = await clientPromise;
    const repo = new RepositoryService(client);
    const rules = await repo.getDmpRules(SYSTEM_WORKSPACE_ID);
    return NextResponse.json({ success: true, rules });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const client = await clientPromise;
    const repo = new RepositoryService(client);
    await repo.upsertDmpRule({ ...body, workspace_id: SYSTEM_WORKSPACE_ID });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ruleId = searchParams.get('rule_id');
    if (!ruleId) return NextResponse.json({ success: false, error: 'rule_id required' }, { status: 400 });
    const client = await clientPromise;
    const repo = new RepositoryService(client);
    await repo.deleteDmpRule(ruleId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
