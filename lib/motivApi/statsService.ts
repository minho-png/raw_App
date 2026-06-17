// MOTIV Stats API 호환 모듈 — 데이터 출처는 Open API 로 일원화됐고 본 모듈은
// **응답 shape 호환 타입** + 파싱 헬퍼만 남긴다. 직접 호출 함수(fetchStatsDaily/
// fetchStatsCampaign) 와 토큰/URL 빌더는 호출자 0건이라 제거 (2026-06-16 cleanup).
//
// 응답 구조 `{ data[], links, meta }` 는 /api/motiv/stats/* 라우트가 Open API 결과를
// 어댑터로 변환해 그대로 유지하므로, 본 타입(StatsBreakdownResponse) 과 파싱 헬퍼
// (toNum/rowsToDailyPoints/aggregateDailyToMetrics) 는 그대로 사용된다.

// 권한 규칙 호환 — Platform 외 유저는 scope 필수. /api/motiv/stats/* 라우트가 동일 키를 받는다.
export interface StatsQuery {
  campaign_id?: string     // 콤마 구분 복수 가능
  adaccount_id?: string
  adgroup_id?: string
  ad_id?: string
  agency_id?: string
  publisher_id?: string
  country?: string         // ≤3자
  start_date?: string      // YYYY-MM-DD
  end_date?: string
  exchange_rate?: number
  include?: 'totals'
  page?: number
  per_page?: number
  sort?: string
}

// 응답 — data 행은 dictionary[string,string]
export interface StatsBreakdownResponse {
  data: Record<string, string>[]
  links?: { first?: string; last?: string; prev?: string | null; next?: string | null }
  meta?: { current_page?: number; from?: number; to?: number; total?: number; last_page?: number; per_page?: number }
  totals?: Record<string, string>
  exchange_rate?: number
}

// 파싱 helper — dictionary[string,string] 의 숫자 필드 안전 변환
export function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === 'number' ? v : parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

// 차트 데이터로 변환 — date / cost / revenue / profit
export interface DailyCostPoint {
  date: string
  cost: number
  revenue: number
  profit: number
  agency_fee: number
  data_fee: number
}

export function rowsToDailyPoints(rows: Record<string, string>[]): DailyCostPoint[] {
  return rows.map(r => ({
    date:       r.date ?? r.datetime ?? '',
    cost:       toNum(r.cost),
    revenue:    toNum(r.revenue),
    profit:     toNum(r.profit),
    agency_fee: toNum(r.agency_fee),
    data_fee:   toNum(r.data_fee),
  }))
}

// 일자별 stats 합계 → UnifiedDailyMetrics 호환 객체.
// 캠페인 stats 의 누적값 의존을 피하고 선택 일자 범위의 정확한 합산을 제공.
//
// 회계 규약 (사용자 정정 — 2026-05-14):
//   매체비(mediaCost) = cost          (매체비 raw)
//   대행+DMP합        = agency_fee
//   DMP 수수료        = data_fee
//   순수 대행         = agency_fee - data_fee
//   매출(spend)       = revenue       (없으면 cost + agency_fee + profit 항등식 fallback)
//
// impressions/clicks/completedViews 는 daily 응답에 없으므로 0 (호출부가 캠페인
// stats 합으로 보강해야 함).
export interface DailyAggregateMetrics {
  spend: number
  agencyFee: number
  dmpFee: number
  mediaCost: number
  profit: number
}
export function aggregateDailyToMetrics(points: ReadonlyArray<DailyCostPoint>): DailyAggregateMetrics {
  let cost = 0, revenue = 0, rawAgency = 0, dmpFee = 0, profit = 0
  for (const p of points) {
    cost      += p.cost
    revenue   += p.revenue
    rawAgency += p.agency_fee
    dmpFee    += p.data_fee
    profit    += p.profit
  }
  const mediaCost = Math.round(cost)
  const rawA      = Math.round(rawAgency)
  const dmpF      = Math.round(dmpFee)
  const agencyFee = Math.max(0, rawA - dmpF)
  const prf       = Math.round(profit)
  const revRaw    = Math.round(revenue)
  const spend     = revRaw > 0 ? revRaw : (mediaCost + rawA + prf)
  return { spend, agencyFee, dmpFee: dmpF, mediaCost, profit: prf }
}
