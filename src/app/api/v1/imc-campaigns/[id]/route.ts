import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { RepositoryService } from '@/services/repositoryService';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const body = await req.json();
    const client = await clientPromise;
    const repo = new RepositoryService(client);
    await repo.updateImcCampaign(id, body);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const client = await clientPromise;
    const repo = new RepositoryService(client);
    await repo.deleteImcCampaign(id);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
