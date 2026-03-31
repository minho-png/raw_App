import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { RepositoryService } from '@/services/repositoryService';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const client = await clientPromise;
    const repo = new RepositoryService(client);
    await repo.upsertCampaignConfig({ ...body, campaign_id: id });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const client = await clientPromise;
    const repo = new RepositoryService(client);
    await repo.deleteCampaign(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
  }
}
