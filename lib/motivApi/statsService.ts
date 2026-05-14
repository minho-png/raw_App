// MOTIV Stats API wrapper (P3).
// 문서 §10 의 모든 stats 엔드포인트는 동일 응답 구조 `{ data[], links, meta }` 를 반환하며
// `data` 의 각 행은 dictionary[string, string] 형태.
//
// 본 모듈은 일별(daily) 통계만 우선 wrapping. 다른 breakdown(campaign/publisher/...)
// 은 동일 패턴이라 필요 시 확장 가능.

const BASE_URL = 'https://desk-ct.motiv-i.com/api'

function getApiToken(): string {
  const token = process.env.MOTIV_API_TOKEN
  if (!token) {
    throw new Error('MOTIV_API_TOKEN 환경변수가 설정되지 않았습니다. .env.local에 추가하세요.')
  }
  return token
}

// 권한 규칙: Platform 외 유저는 scope 필수 — campaign_id / adaccount_id / agency_id / publisher_id
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

function buildQuery(query: StatsQuery): string {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue
    params.set(k, String(v))
  }
  const s = params.toString()
  return s ? `?${s}` : ''
}

async function fetchStatsBreakdown(path: string, query: StatsQuery): Promise<StatsBreakdownResponse> {
  const token = getApiToken()
  const url = `${BASE_URL}${path}${buildQuery(query)}`
  // 30초 timeout (QA BUG-004 패턴)
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 30_000)
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      cache: 'no-store',
      signal: ac.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Motiv API ${res.status}: ${text.slice(0, 300)}`)
    }
    return (await res.json()) as StatsBreakdownResponse
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('Motiv stats 응답 시간 초과 (30s)')
    throw e
  } finally {
    clearTimeout(timer)
  }
}

export const fetchStatsDaily   = (q: StatsQuery) => fetchStatsBreakdown('/v1/stats/daily/breakdown', q)

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
// 같은 회계 규약 적용 (사용자 확인):
//   매출(spend)  = cost
//   대행+DMP합   = agency_fee (Motiv 원본은 합산)
//   DMP 수수료   = data_fee
//   순수 대행    = agency_fee - data_fee
//   매체비       = cost - agency_fee - profit
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
  let cost = 0, rawAgency = 0, dmpFee = 0, profit = 0
  for (const p of points) {
    cost      += p.cost
    rawAgency += p.agency_fee
    dmpFee    += p.data_fee
    profit    += p.profit
  }
  const spend     = Math.round(cost)
  const rawA      = Math.round(rawAgency)
  const dmpF      = Math.round(dmpFee)
  const agencyFee = Math.max(0, rawA - dmpF)
  const prf       = Math.round(profit)
  const mediaCost = Math.max(0, spend - rawA - prf)
  return { spend, agencyFee, dmpFee: dmpF, mediaCost, profit: prf }
}
