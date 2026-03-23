export const dynamic = 'force-dynamic';
/**
 * GET  /api/v1/alerts       - 최근 알림 조회
 * POST /api/v1/alerts       - 알림 규칙 생성
 * Auth 비활성화 모드
 */
import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { WorkspaceRepository, SYSTEM_WORKSPACE_ID } from '@/services/workspaceRepository';
import { RepositoryService } from '@/services/repositoryService';
import { AlertEvent, AlertRule } from '@/types';

function genId(size = 16): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: size }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export async function GET() {
  try {
    const client = await clientPromise;
    const wsRepo = new WorkspaceRepository(client);
    const alerts = await wsRepo.getRecentAlerts(SYSTEM_WORKSPACE_ID, 50);
    return NextResponse.json({ data: alerts });
  } catch (err) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const url = req.nextUrl.pathname;

  if (url.endsWith('/check')) {
    const workerSecret = req.headers.get('x-worker-secret');
    if (workerSecret !== process.env.WORKER_SECRET) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return handleAlertCheck();
  }

  try {
    const body = await req.json();
    const rule: AlertRule = {
      ...body,
      rule_id: body.rule_id ?? genId(),
      workspace_id: SYSTEM_WORKSPACE_ID,
      created_by: 'system',
      created_at: new Date(),
    };
    const client = await clientPromise;
    const wsRepo = new WorkspaceRepository(client);
    await wsRepo.upsertAlertRule(rule);
    return NextResponse.json({ data: rule }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

async function handleAlertCheck() {
  try {
    const client = await clientPromise;
    const wsRepo = new WorkspaceRepository(client);
    const repo = new RepositoryService(client);
    const db = client.db('gfa_master_pro');
    const allRules = await db.collection<AlertRule>('alert_rules').find({ is_active: true }).toArray();

    let triggered = 0;
    for (const rule of allRules) {
      const records = await repo.getPerformanceData(rule.campaign_id);
      const event = evaluateRule(rule, records as any);
      if (event) {
        await wsRepo.createAlertEvent(event);
        triggered++;
      }
    }
    return NextResponse.json({ checked: allRules.length, triggered });
  } catch (err) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

function evaluateRule(rule: AlertRule, records: any[]): AlertEvent | null {
  const totalSpend = records.reduce((s: number, r: any) => s + (r.execution_amount ?? 0), 0);
  const totalClicks = records.reduce((s: number, r: any) => s + (r.clicks ?? 0), 0);
  const totalImpressions = records.reduce((s: number, r: any) => s + (r.impressions ?? 0), 0);

  let metricValue = 0;
  let message = '';

  switch (rule.type) {
    case 'cpc_spike': {
      metricValue = totalClicks > 0 ? totalSpend / totalClicks : 0;
      if (metricValue <= rule.threshold) return null;
      message = `CPC ₩${Math.round(metricValue).toLocaleString()}이 임계값 ₩${rule.threshold.toLocaleString()} 초과`;
      break;
    }
    case 'ctr_drop': {
      metricValue = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
      if (metricValue >= rule.threshold) return null;
      message = `CTR ${metricValue.toFixed(2)}%가 임계값 ${rule.threshold}% 이하로 하락`;
      break;
    }
    default:
      return null;
  }

  return {
    event_id: genId(),
    rule_id: rule.rule_id,
    workspace_id: rule.workspace_id,
    campaign_id: rule.campaign_id,
    triggered_at: new Date(),
    metric_value: metricValue,
    threshold: rule.threshold,
    message,
    is_resolved: false,
  };
}
