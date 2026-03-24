/**
 * AI 인사이트 서비스 — Claude claude-sonnet-4-6 기반 캠페인 분석
 * ANTHROPIC_API_KEY 환경 변수 필요
 */
import Anthropic from '@anthropic-ai/sdk';
import { AiInsight, AiRecommendation, AiAnomaly } from '@/types';
import { PerformanceRecord, CampaignConfig } from '@/types';
import { nanoid } from 'nanoid';

const MODEL = 'claude-sonnet-4-6';

function buildPrompt(campaign: CampaignConfig, records: PerformanceRecord[]): string {
  // 최근 30일 데이터만 사용 (토큰 절약)
  const sorted = [...records]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 200);

  const totalSpend = sorted.reduce((s, r) => s + (r.execution_amount || 0), 0);
  const totalClicks = sorted.reduce((s, r) => s + (r.clicks || 0), 0);
  const totalImps = sorted.reduce((s, r) => s + (r.impressions || 0), 0);
  const actualCpc = totalClicks > 0 ? Math.round(totalSpend / totalClicks) : 0;
  const actualCtr = totalImps > 0 ? ((totalClicks / totalImps) * 100).toFixed(3) : '0';

  // 일별 집계 (이상 탐지용)
  const dailyMap = new Map<string, { spend: number; clicks: number; imps: number }>();
  sorted.forEach(r => {
    const day = new Date(r.date).toISOString().slice(0, 10);
    const v = dailyMap.get(day) ?? { spend: 0, clicks: 0, imps: 0 };
    v.spend += r.execution_amount || 0;
    v.clicks += r.clicks || 0;
    v.imps += r.impressions || 0;
    dailyMap.set(day, v);
  });
  const dailyRows = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => {
      const cpc = v.clicks > 0 ? Math.round(v.spend / v.clicks) : 0;
      const ctr = v.imps > 0 ? ((v.clicks / v.imps) * 100).toFixed(3) : '0';
      return `${date}: spend=₩${Math.round(v.spend).toLocaleString()} clicks=${v.clicks} imps=${v.imps} cpc=₩${cpc} ctr=${ctr}%`;
    })
    .join('\n');

  // DMP 분포
  const dmpMap = new Map<string, number>();
  sorted.forEach(r => {
    const k = r.dmp_type || 'DIRECT';
    dmpMap.set(k, (dmpMap.get(k) ?? 0) + (r.execution_amount || 0));
  });
  const dmpRows = Array.from(dmpMap.entries())
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .map(([k, v]) => `${k}: ₩${Math.round(v).toLocaleString()} (${totalSpend > 0 ? ((v / totalSpend) * 100).toFixed(1) : 0}%)`)
    .join(', ');

  // Sub-campaign 목표
  const subGoals = campaign.sub_campaigns
    ?.filter(s => s.enabled !== false)
    .map(s => `${s.mapping_value || s.media}: budget=₩${(s.budget || 0).toLocaleString()} fee=${s.fee_rate}% target_cpc=${s.target_cpc ?? 'N/A'} target_ctr=${s.target_ctr ?? 'N/A'}%`)
    .join('\n') ?? 'N/A';

  return `당신은 한국 디지털 광고 성과 분석 전문가입니다. 다음 캠페인 데이터를 분석하고 JSON 형식으로 인사이트를 제공하세요.

## 캠페인 정보
- 캠페인명: ${campaign.campaign_name}
- 분석 기간: ${sorted.length > 0 ? new Date(sorted[sorted.length - 1].date).toISOString().slice(0, 10) : 'N/A'} ~ ${sorted.length > 0 ? new Date(sorted[0].date).toISOString().slice(0, 10) : 'N/A'}
- 총 집행금액: ₩${Math.round(totalSpend).toLocaleString()}
- 총 클릭수: ${totalClicks.toLocaleString()}
- 총 노출수: ${totalImps.toLocaleString()}
- 실제 CPC: ₩${actualCpc.toLocaleString()}
- 실제 CTR: ${actualCtr}%

## 서브캠페인 목표
${subGoals}

## DMP 분포 (집행금액 기준)
${dmpRows || 'N/A'}

## 일별 성과 (최근 ${dailyMap.size}일)
${dailyRows || 'N/A'}

## 분석 요청
위 데이터를 바탕으로 다음 JSON 구조로 응답하세요. 반드시 valid JSON만 출력하세요.

{
  "summary": "2-3문장 핵심 요약 (한국어)",
  "recommendations": [
    {
      "type": "budget|creative|targeting|pacing",
      "priority": "high|medium|low",
      "title": "권장사항 제목 (한국어, 20자 이내)",
      "description": "상세 설명 (한국어, 100자 이내)",
      "action": "실행 방안 (한국어, 50자 이내, 선택)"
    }
  ],
  "anomalies": [
    {
      "metric": "cpc|ctr|spend|impressions",
      "direction": "spike|drop",
      "date": "YYYY-MM-DD",
      "value": 숫자,
      "baseline": 숫자,
      "description": "이상 탐지 설명 (한국어, 80자 이내)"
    }
  ]
}

recommendations는 최대 4개, anomalies는 최대 3개로 제한하세요. 이상값이 없으면 anomalies는 빈 배열로 반환하세요.`;
}

export async function generateCampaignInsight(
  campaign: CampaignConfig,
  records: PerformanceRecord[],
  workspaceId: string
): Promise<AiInsight> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = buildPrompt(campaign, records);

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = message.content.find(b => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('AI 응답에서 텍스트를 찾을 수 없습니다.');
  }

  // JSON 파싱 — 마크다운 코드블록 제거
  const raw = textBlock.text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
  let parsed: { summary: string; recommendations: AiRecommendation[]; anomalies: AiAnomaly[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`AI 응답 JSON 파싱 실패: ${raw.slice(0, 200)}`);
  }

  return {
    insight_id: nanoid(),
    workspace_id: workspaceId,
    campaign_id: campaign.campaign_id,
    generated_at: new Date(),
    model: MODEL,
    summary: parsed.summary ?? '',
    recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
    anomalies: Array.isArray(parsed.anomalies) ? parsed.anomalies : [],
    token_usage: message.usage.input_tokens + message.usage.output_tokens,
  };
}
