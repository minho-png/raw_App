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
import { toNum } from './statsService'

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
  advertiser: string         // P1 신규: 광고주 표시명 (MotivAdAccount 에서 추출)
  product: MediaProductType
  motivCampaignType: string   // 'DISPLAY' | 'VIDEO' | 'TV' | 'PARTNERS' (원본)
  uiType: 'display' | 'video' | 'partners' | 'ctv'
  budget: number
  /** 무료 캠페인 — 광고주 비용 0. 매출은 잡지 않고 비용만 잡음. */
  isFree: boolean
  /** 일 예산 (₩). null/0 이면 일예산 미설정. */
  dailyBudget: number
  /** 오늘 누적 소진 (₩). MOTIV Campaign.daily_spent — 실시간. */
  dailySpent: number
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

// 한 캠페인의 stats 한 번만 dev 로그 — 가설 검증용
let _statsLogged = false

export function motivStatsToMetrics(stats: MotivCampaignStats | null | undefined): UnifiedDailyMetrics {
  if (!stats) return { ...ZERO_METRICS }

  // MOTIV API stats 매핑 (재정정):
  //   확인된 사실 — Motiv stats.agency_fee 필드는 '대행 수수료 + DMP 수수료(data_fee)' 합산값.
  //   초기 매핑은 agency_fee 를 그대로 대행수수료로 노출하고 mediaCost 산식에서 data_fee 를
  //   한 번 더 빼고 있었음 → 화면의 대행수수료 = 실 대행+DMP, 매체비는 과소 계산되던 문제.
  //
  // 정정 항등식 (Motiv 회계 — 사용자 확인):
  //   cost (매출)  =  mediaCost (매체비)  +  agency_fee (대행+DMP 합)  +  profit (이익)
  //   ↔  spend    =  mediaCost           +  rawAgency                 +  profit
  //
  // 따라서:
  //   순수 대행 수수료  = rawAgency - data_fee
  //   DMP 수수료       = data_fee
  //   매체비           = spend - rawAgency - profit          (rawAgency 한 번만 차감)
  //   이익             = profit
  //   sum check       = mediaCost + agencyFee + dmpFee + profit = spend  ✓
  const spend     = Math.round(stats.cost ?? 0)
  const rawAgency = Math.round(stats.agency_fee ?? 0)  // Motiv 의 agency_fee (대행+DMP 합 추정)
  const dmpFee    = Math.round(stats.data_fee ?? 0)
  const agencyFee = Math.max(0, rawAgency - dmpFee)    // 순수 대행 수수료
  const profit    = Math.round(stats.profit ?? 0)
  const mediaCost = Math.max(0, spend - rawAgency - profit)

  // dev 환경 진단 — 한 캠페인의 stats 첫 한 번만 출력. 화면 값이 의도와 다르면 콘솔 확인.
  if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production' && !_statsLogged && spend > 0) {
    _statsLogged = true
    console.info('[motivStatsToMetrics] 첫 캠페인 stats 진단', {
      cost: stats.cost, revenue: stats.revenue,
      agency_fee: stats.agency_fee, data_fee: stats.data_fee, profit: stats.profit,
      derived: { spend, agencyFee, dmpFee, mediaCost, profit },
      check: { sum: mediaCost + agencyFee + dmpFee + profit, equalsSpend: mediaCost + agencyFee + dmpFee + profit === spend },
    })
  }

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
// advertiserName 은 옵셔널 — 호출부에서 광고주 미매핑 시 '—' 로 채움.
export function motivCampaignToSnapshot(
  c: MotivCampaign,
  agencyName: string,
  yesterdayMetrics?: UnifiedDailyMetrics,
  advertiserName?: string,
): UnifiedCampaignSnapshot {
  const product = motivTypeToProduct(c.campaign_type) ?? 'CT'
  const isFree = c.is_free === true
  // 무료 캠페인: 매출(spend) 은 0 처리 (광고주 청구 없음). 비용 항목은 그대로 유지.
  const todayMetrics = motivStatsToMetrics(c.stats)
  const today = isFree ? { ...todayMetrics, spend: 0 } : todayMetrics
  const yesterday = yesterdayMetrics
    ? (isFree ? { ...yesterdayMetrics, spend: 0 } : yesterdayMetrics)
    : { ...ZERO_METRICS }
  return {
    id: String(c.id),
    motivId: c.id,
    name: c.title ?? `Campaign #${c.id}`,
    agency: agencyName || '—',
    advertiser: advertiserName && advertiserName.trim() ? advertiserName : '—',
    product,
    motivCampaignType: c.campaign_type,
    uiType: motivTypeToUiType(c.campaign_type),
    budget: c.total_budget ?? 0,
    isFree,
    dailyBudget: c.daily_budget ?? 0,
    dailySpent: c.daily_spent ?? 0,
    startDate: c.start_date ?? '',
    endDate: c.end_date ?? '',
    today,
    yesterday,
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

// MOTIV /v1/stats/campaign/breakdown 행 (dictionary[string,string]) → UnifiedDailyMetrics 변환.
// 캠페인 ID 별로 일자 범위 집계된 stats 가 한 row 로 옴 (sort=campaign_id).
//
// motivStatsToMetrics 와 동일한 회계 모델:
//   spend     = cost
//   rawAgency = agency_fee   (Motiv 원본 — 대행+DMP 합)
//   dmpFee    = data_fee
//   agencyFee = rawAgency - dmpFee
//   mediaCost = spend - rawAgency - profit
//
// impressions / clicks / completedViews 도 row 에 있으면 사용.
export function rowsToCampaignMetricsMap(
  rows: ReadonlyArray<Record<string, string>>,
): Map<number, UnifiedDailyMetrics> {
  const map = new Map<number, UnifiedDailyMetrics>()
  for (const r of rows) {
    const id = Number(r.campaign_id)
    if (!Number.isFinite(id) || id <= 0) continue
    const spend     = Math.round(toNum(r.cost))
    const rawAgency = Math.round(toNum(r.agency_fee))
    const dmpFee    = Math.round(toNum(r.data_fee))
    const agencyFee = Math.max(0, rawAgency - dmpFee)
    const profit    = Math.round(toNum(r.profit))
    const mediaCost = Math.max(0, spend - rawAgency - profit)
    const impressions    = Math.round(toNum(r.v_impression) || toNum(r.win))
    const clicks         = Math.round(toNum(r.click))
    const completedViews = Math.round(toNum(r.v_play100))
    map.set(id, { impressions, clicks, spend, agencyFee, dmpFee, mediaCost, completedViews })
  }
  return map
}

// 계산식 (mock 페이지와 동일)
export const calcCTR  = (clicks: number, imp: number)    => imp === 0 ? 0 : (clicks / imp) * 100
export const calcSR   = (spend: number, budget: number)  => budget === 0 ? 0 : (spend / budget) * 100
export const calcPR   = (m: UnifiedDailyMetrics)         => m.spend === 0 ? 0
  : ((m.spend - m.agencyFee - m.dmpFee - m.mediaCost) / m.spend) * 100
export const calcVTR  = (m: UnifiedDailyMetrics)         => m.impressions === 0 ? 0
  : (m.completedViews / m.impressions) * 100
export const profitAmt = (m: UnifiedDailyMetrics)        => m.spend - m.agencyFee - m.dmpFee - m.mediaCost
