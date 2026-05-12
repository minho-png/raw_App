// MOTIV API stats → 분석 페이지가 사용하는 통합 메트릭으로 변환.
// CT (DISPLAY/VIDEO/PARTNERS) 와 CTV (TV) 페이지가 공통으로 사용.
//
// 매핑 규칙:
//   impressions    ← v_impression (없으면 win 폴백)
//   clicks         ← click
//   spend          ← cost              (실제 매체 소진액)
//   agencyFee      ← agency_fee
//   dmpFee         ← data_fee
//   mediaCost      ← cost - agency_fee - data_fee - profit
//   completedViews ← v_play100         (VTR 분자)
//   ctr            ← ctr               (직접 제공)
//   profitRate     ← profit_rate       (직접 제공)

import type { MotivCampaign, MotivCampaignStats } from './types'
import type { MediaProductType } from './productMapping'
import { motivTypeToProduct } from './productMapping'

export interface UnifiedDailyMetrics {
  impressions: number
  clicks: number
  spend: number
  agencyFee: number
  dmpFee: number
  mediaCost: number
  completedViews: number
}

export interface UnifiedCampaignSnapshot {
  id: string
  motivId: number
  name: string
  agency: string
  product: MediaProductType
  motivCampaignType: string   // 'DISPLAY' | 'VIDEO' | 'TV' | 'PARTNERS' (원본)
  uiType: 'display' | 'video' | 'partners' | 'ctv'
  budget: number
  startDate: string
  endDate: string
  today: UnifiedDailyMetrics
  yesterday: UnifiedDailyMetrics
  ctr: number
  profitRate: number
}

const ZERO_METRICS: UnifiedDailyMetrics = {
  impressions: 0, clicks: 0, spend: 0,
  agencyFee: 0, dmpFee: 0, mediaCost: 0, completedViews: 0,
}

export function motivStatsToMetrics(stats: MotivCampaignStats | null | undefined): UnifiedDailyMetrics {
  if (!stats) return { ...ZERO_METRICS }
  const spend = Math.round(stats.cost ?? 0)
  const agencyFee = Math.round(stats.agency_fee ?? 0)
  const dmpFee = Math.round(stats.data_fee ?? 0)
  const profit = Math.round(stats.profit ?? 0)
  const mediaCost = Math.max(0, spend - agencyFee - dmpFee - profit)
  return {
    impressions: Math.round(stats.v_impression || stats.win || 0),
    clicks: Math.round(stats.click ?? 0),
    spend, agencyFee, dmpFee, mediaCost,
    completedViews: Math.round(stats.v_play100 ?? 0),
  }
}

function motivTypeToUiType(campaignType: string): UnifiedCampaignSnapshot['uiType'] {
  if (campaignType === 'TV') return 'ctv'
  if (campaignType === 'VIDEO') return 'video'
  if (campaignType === 'PARTNERS') return 'partners'
  return 'display'
}

// MotivCampaign → UnifiedCampaignSnapshot.
// yesterday 는 별도 일별 스냅샷 컬렉션이 도입되기 전까지 0 으로 채움 (Phase S4 에서 주입).
export function motivCampaignToSnapshot(
  c: MotivCampaign,
  agencyName: string,
  yesterdayMetrics?: UnifiedDailyMetrics,
): UnifiedCampaignSnapshot {
  const product = motivTypeToProduct(c.campaign_type) ?? 'CT'
  return {
    id: String(c.id),
    motivId: c.id,
    name: c.title ?? `Campaign #${c.id}`,
    agency: agencyName || '—',
    product,
    motivCampaignType: c.campaign_type,
    uiType: motivTypeToUiType(c.campaign_type),
    budget: c.total_budget ?? 0,
    startDate: c.start_date ?? '',
    endDate: c.end_date ?? '',
    today: motivStatsToMetrics(c.stats),
    yesterday: yesterdayMetrics ?? { ...ZERO_METRICS },
    ctr: c.stats?.ctr ?? 0,
    profitRate: c.stats?.profit_rate ?? 0,
  }
}

export function aggregateMetrics(list: UnifiedDailyMetrics[]): UnifiedDailyMetrics {
  return list.reduce<UnifiedDailyMetrics>((acc, m) => ({
    impressions:    acc.impressions    + m.impressions,
    clicks:         acc.clicks         + m.clicks,
    spend:          acc.spend          + m.spend,
    agencyFee:      acc.agencyFee      + m.agencyFee,
    dmpFee:         acc.dmpFee         + m.dmpFee,
    mediaCost:      acc.mediaCost      + m.mediaCost,
    completedViews: acc.completedViews + m.completedViews,
  }), { ...ZERO_METRICS })
}

// 계산식 (mock 페이지와 동일)
export const calcCTR  = (clicks: number, imp: number)    => imp === 0 ? 0 : (clicks / imp) * 100
export const calcSR   = (spend: number, budget: number)  => budget === 0 ? 0 : (spend / budget) * 100
export const calcPR   = (m: UnifiedDailyMetrics)         => m.spend === 0 ? 0
  : ((m.spend - m.agencyFee - m.dmpFee - m.mediaCost) / m.spend) * 100
export const calcVTR  = (m: UnifiedDailyMetrics)         => m.impressions === 0 ? 0
  : (m.completedViews / m.impressions) * 100
export const profitAmt = (m: UnifiedDailyMetrics)        => m.spend - m.agencyFee - m.dmpFee - m.mediaCost
