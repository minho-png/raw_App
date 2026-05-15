// MOTIV API stats → 분석 페이지가 사용하는 통합 메트릭으로 변환.
// CT (DISPLAY/VIDEO/PARTNERS) 와 CTV (TV) 페이지가 공통으로 사용.
//
// 회계 모델 (사용자 확인 — 2026-05-14):
//   stats.cost      = 매체비 (mediaCost) — 매체사에 지불할 금액 raw
//   stats.revenue   = 매출 (spend)       — 광고주 청구액 raw
//   stats.agency_fee= 대행 + DMP 합
//   stats.data_fee  = DMP 단독
//   stats.profit    = Motiv 이익
//
// 항등식 (검증용):
//   revenue = cost + agency_fee + profit
//   ↔ spend = mediaCost + rawAgency + profit
//
// 매핑 규칙:
//   impressions    ← v_impression (없으면 win 폴백)
//   clicks         ← click
//   spend          ← revenue            (매출 raw)
//   mediaCost      ← cost               (매체비 raw — 사용자 정정)
//   agencyFee      ← agency_fee - data_fee  (순수 대행)
//   dmpFee         ← data_fee
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

  // MOTIV API stats 매핑 (사용자 정정 — 2026-05-14):
  //   cost = 매체비 (raw), revenue = 매출 (raw). agency_fee 는 대행+DMP 합.
  //   이전 derivation (mediaCost = spend - rawAgency - profit) 을 raw 필드 직접 사용으로 변경.
  //
  // 항등식 (검증용):
  //   revenue = cost + agency_fee + profit
  //   ↔ spend = mediaCost + (agencyFee + dmpFee) + profit
  //
  // revenue 가 0/누락이면 항등식으로 fallback 보정.
  const mediaCost = Math.round(stats.cost ?? 0)
  const rawAgency = Math.round(stats.agency_fee ?? 0)
  const dmpFee    = Math.round(stats.data_fee ?? 0)
  const agencyFee = Math.max(0, rawAgency - dmpFee)
  const profit    = Math.round(stats.profit ?? 0)
  // 사용자 정책 — '해당 기간에 발생한 정확한 매출 SPEND 만 표시'.
  // c.stats.revenue 가 lifetime 누적일 가능성, 그리고 항등식 폴백
  // (cost+agency_fee+profit) 이 부풀림을 유발했음. → fallback 제거.
  // 분석/정산 페이지는 별도로 /stats/campaign/breakdown 결과로 spend 를 override 함.
  const revenueRaw = Math.round(stats.revenue ?? 0)
  const spend     = revenueRaw

  // dev 환경 진단 — 한 캠페인의 stats 첫 한 번만 출력. 화면 값이 의도와 다르면 콘솔 확인.
  if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production' && !_statsLogged && spend > 0) {
    _statsLogged = true
    const sum = mediaCost + agencyFee + dmpFee + profit
    console.info('[motivStatsToMetrics] 첫 캠페인 stats 진단', {
      raw: {
        cost: stats.cost, revenue: stats.revenue,
        agency_fee: stats.agency_fee, data_fee: stats.data_fee, profit: stats.profit,
      },
      derived: { spend, mediaCost, agencyFee, dmpFee, profit },
      check: { sum, equalsSpend: sum === spend, delta: spend - sum },
    })
  }

  return {
    // 사용자 정책 — '클릭 및 노출은 API로 불러오는 값만 활용'.
    // 이전: stats.v_impression || stats.win (win 폴백). 'win' 은 입찰 성공 카운트로
    // 노출과 다른 의미이므로 폴백 제거. API 명시 필드만 사용.
    impressions: Math.round(stats.v_impression ?? 0),
    clicks:      Math.round(stats.click ?? 0),
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
  // 사용자 정책 — '해당 기간에 발생한 정확한 매출 SPEND 만 표시'.
  // c.stats.revenue / c.total_spent 모두 lifetime 누적이라 부정확.
  // motivStatsToMetrics(c.stats).spend 는 기본값일 뿐 — 분석/정산 페이지가
  // /stats/campaign/breakdown 결과(statsCampaign)로 spend 를 override 한다.
  // 무료 캠페인: 광고주 청구 없으므로 0.
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
// 한 캠페인이 다중 row 로 분리되어 응답될 가능성 (예: groupBy 차원 합쳐지지 않은 경우, 또는
// 클라이언트가 페이지를 합친 경우) 이 있으므로 campaign_id 별 누적 합산으로 처리.
// — 사용자 보고: "기간에 대한 매출 및 비용이 정확한 금액이 아니야"
//   원인: 이전 map.set 덮어쓰기 구현은 한 캠페인의 다중 row 중 마지막만 남겨 합계 오류 유발.
//
// 회계 모델 (사용자 정정):
//   mediaCost = cost            (매체비 raw)
//   rawAgency = agency_fee      (대행+DMP 합)
//   dmpFee    = data_fee
//   agencyFee = rawAgency - dmpFee
//   spend     = revenue         (없으면 mediaCost + rawAgency + profit 항등식 fallback)
//
// 합산 의미: 한 캠페인의 모든 row 의 raw 필드를 먼저 누적한 뒤 회계 모델 적용 — 반올림 손실 최소화.
// impressions / clicks / completedViews 도 row 에 있으면 사용.
export function rowsToCampaignMetricsMap(
  rows: ReadonlyArray<Record<string, string>>,
): Map<number, UnifiedDailyMetrics> {
  // 누적 단계: raw 필드를 캠페인 ID 별로 합산.
  type RawAcc = {
    cost: number; revenue: number; agency_fee: number; data_fee: number; profit: number
    v_impression: number; win: number; click: number; v_play100: number
  }
  const acc = new Map<number, RawAcc>()
  for (const r of rows) {
    const id = Number(r.campaign_id)
    if (!Number.isFinite(id) || id <= 0) continue
    const cur = acc.get(id) ?? { cost: 0, revenue: 0, agency_fee: 0, data_fee: 0, profit: 0, v_impression: 0, win: 0, click: 0, v_play100: 0 }
    cur.cost        += toNum(r.cost)
    cur.revenue     += toNum(r.revenue)
    cur.agency_fee  += toNum(r.agency_fee)
    cur.data_fee    += toNum(r.data_fee)
    cur.profit      += toNum(r.profit)
    cur.v_impression += toNum(r.v_impression)
    cur.win         += toNum(r.win)
    cur.click       += toNum(r.click)
    cur.v_play100   += toNum(r.v_play100)
    acc.set(id, cur)
  }

  // 변환 단계: 회계 모델 적용.
  const map = new Map<number, UnifiedDailyMetrics>()
  for (const [id, a] of acc) {
    const mediaCost = Math.round(a.cost)
    const rawAgency = Math.round(a.agency_fee)
    const dmpFee    = Math.round(a.data_fee)
    const agencyFee = Math.max(0, rawAgency - dmpFee)
    const profit    = Math.round(a.profit)
    // 사용자 정책 — fallback 없이 API revenue 만 사용 (정확 기간 매출).
    const revenueRaw = Math.round(a.revenue)
    const spend     = revenueRaw
    // 사용자 정책 — 노출은 v_impression 만 (win 폴백 제거).
    const impressions    = Math.round(a.v_impression)
    const clicks         = Math.round(a.click)
    const completedViews = Math.round(a.v_play100)
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
