/**
 * AI 인사이트 서비스 — 스텁 (ANTHROPIC_API_KEY 미설정 시)
 * `npm install @anthropic-ai/sdk` 설치 후 아래 주석 해제하여 활성화합니다.
 */
import { AiInsight } from '@/types';
import { PerformanceRecord, CampaignConfig } from '@/types';

export async function generateCampaignInsight(
  _campaign: CampaignConfig,
  _records: PerformanceRecord[],
  _workspaceId: string
): Promise<AiInsight> {
  throw new Error(
    'AI 인사이트 기능을 사용하려면 npm install @anthropic-ai/sdk 설치 후 insightService.ts를 활성화하세요.'
  );
}
