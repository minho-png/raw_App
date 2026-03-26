import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { RepositoryService } from '@/services/repositoryService';
import { SYSTEM_WORKSPACE_ID } from '@/services/workspaceRepository';
import { genId } from '@/lib/idGenerator';

export async function GET() {
  try {
    const client = await clientPromise;
    const repo = new RepositoryService(client);
    const campaigns = await repo.getImcCampaigns(SYSTEM_WORKSPACE_ID);
    return NextResponse.json({ success: true, campaigns });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description, total_budget } = body;
    if (!name?.trim()) {
      return NextResponse.json({ success: false, error: 'name required' }, { status: 400 });
    }

    const client = await clientPromise;
    const repo = new RepositoryService(client);
    const campaign = await repo.createImcCampaign({
      imc_campaign_id: `IMC-${genId(8)}`,
      workspace_id: SYSTEM_WORKSPACE_ID,
      name: name.trim(),
      description,
      total_budget,
    });
    return NextResponse.json({ success: true, campaign }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
