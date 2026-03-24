export const dynamic = 'force-dynamic';
/**
 * GET  /api/v1/campaigns  - 캠페인 목록
 * POST /api/v1/campaigns  - 캠페인 생성
 * Auth 비활성화 모드로 동작
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import clientPromise from '@/lib/mongodb';
import { RepositoryService } from '@/services/repositoryService';
import { genId } from '@/lib/idGenerator';

const SubCampaignSchema = z.object({
  id: z.string().min(1),
  mapping_value: z.string().min(1),
  media: z.enum(['네이버GFA', '카카오Moment', '구글Ads', '메타Ads', 'Kakao', 'Google', 'Meta']),
  fee_rate: z.number().min(0).max(100),
  budget: z.number().min(0),
  budget_type: z.enum(['integrated', 'individual']),
  target_cpc: z.number().min(0).optional(),
  target_ctr: z.number().min(0).max(100).optional(),
  enabled: z.boolean().default(true),
  dmp_column: z.string().optional(),
  excel_name: z.string().optional(),
});

const CampaignConfigSchema = z.object({
  campaign_id: z.string().min(1).optional(), // optional — generated if missing
  campaign_name: z.string().min(1).max(200),
  sub_campaigns: z.array(SubCampaignSchema).default([]),
  insights: z.string().max(5000).optional(),
  dashboard_layout: z.array(z.string()).optional(),
}).strict();

export async function GET() {
  try {
    const client = await clientPromise;
    const repo = new RepositoryService(client);
    const campaigns = await repo.getCampaigns();
    return NextResponse.json({ data: campaigns, total: campaigns.length });
  } catch (err) {
    console.error('[GET /api/v1/campaigns]', err);
    return NextResponse.json({ error: 'Internal Server Error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = CampaignConfigSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: result.error.flatten(),
      }, { status: 400 });
    }

    const campaign = { ...result.data, campaign_id: result.data.campaign_id ?? genId() };
    const client = await clientPromise;
    const repo = new RepositoryService(client);
    await repo.upsertCampaignConfig(campaign);
    return NextResponse.json({ data: campaign }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/v1/campaigns]', err);
    return NextResponse.json({ error: 'Internal Server Error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
