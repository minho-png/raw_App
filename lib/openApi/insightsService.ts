/**
 * `/api/v1/ads/insights` helper — level 별 호출 함수.
 *
 * Phase 1 인프라 — CAMPAIGN level 만 운영에서 사용. ADGROUP/AD/DAILY/HOURLY 는
 * 인프라 차원에서 지원 (501 가드 해제, 2026-06-11) — 후속 단계에서 페이지 통합.
 */

import { openApiFetch } from './client'
import type {
  InsightsAdDimensions,
  InsightsAdGroupDimensions,
  InsightsCampaignDimensions,
  InsightsDailyDimensions,
  InsightsHourlyDimensions,
  InsightsMetrics,
  InsightsPaging,
  InsightsQuery,
  InsightsResponse,
  InsightsRow,
} from './types'

const INSIGHTS_PATH = '/ads/insights'

/**
 * 빈/누락 metrics 기본값 — currency 는 가이드상 'KRW' 고정.
 * 업스트림이 summary 를 생략하거나 부분만 채워도 소비부(roundWon 등)가 안전.
 */
const EMPTY_METRICS: InsightsMetrics = {
  impressions: 0,
  clicks: 0,
  ctr: 0,
  cost: 0,
  currency: 'KRW',
  cpc: 0,
  cpm: 0,
}

/**
 * 업스트림 200 응답 shape 정규화 — 견고성 가드 (VIDEO 500 회귀 수정 2026-06-15).
 *
 * 운영 가이드 §7: "200(data=null) → proxy 가 필드 접근 실패로 500". 실제로 결과가
 * 0건인 level/campaignType (예: VIDEO 캠페인 부재) 에서 업스트림이 `data` 만 주고
 * `summary`/`paging` 을 생략하면, 하위 소비부(pagingToMotivMeta·fetchAllCampaignInsights·
 * route 매핑)가 `paging.limit`·`paging.totalPages` 접근에서 TypeError 를 던져 500
 * (INTERNAL) 이 됐다. DISPLAY(데이터 존재) 는 정상, VIDEO(0건) 만 500 나던 증상의 근본 원인.
 *
 * 본 정규화로 모든 level helper 가 항상 완전한 InsightsResponse 를 반환하도록 보장한다.
 * 에러(4xx/5xx)는 정규화 이전 client.ts 에서 OpenApiError 로 throw 되므로 영향 없음.
 */
function normalizeInsightsResponse<D>(raw: unknown): InsightsResponse<D> {
  const r = (raw ?? {}) as Partial<InsightsResponse<D>> & { rows?: InsightsRow<D>[] }
  // 배열 키 호환 (2026-06-16): 명세상 응답 배열 키가 `data` 인지 `rows` 인지 운영망
  // 확인 전까지 둘 다 수용. 실제 API 가 `rows` 로 응답하는데 `data` 만 읽으면 모든
  // 캠페인이 빈 배열로 떨어져 화면이 통째 0 이 된다(콘솔에 정상 수신 로그 부재와 일치).
  const data: InsightsRow<D>[] = Array.isArray(r.data)
    ? r.data
    : Array.isArray(r.rows)
      ? r.rows
      : []
  const summaryMetrics = r.summary?.metrics ?? { ...EMPTY_METRICS }
  const paging: InsightsPaging = r.paging ?? {
    page: 1,
    limit: data.length,
    totalCount: data.length,
    totalPages: 1,
  }
  return { data, summary: { metrics: summaryMetrics }, paging }
}

/**
 * 일반 insights 호출 — level 은 query 가 명시. dimensions 타입은 호출자가 제네릭으로 지정.
 *
 * 모든 level 별 helper 가 본 함수를 거치며, 본 함수는 client.openApiFetch 의 단순 wrapper.
 * 신규 쿼리 키 추가 시 본 객체에 한 번만 반영하면 모든 helper 가 자동으로 지원.
 */
export async function fetchInsights<D>(
  query: InsightsQuery,
): Promise<InsightsResponse<D>> {
  const raw = await openApiFetch<unknown>(INSIGHTS_PATH, {
    level: query.level,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    campaignType: query.campaignType,
    accountId: query.accountId,
    agencyId: query.agencyId,
    campaignIds: query.campaignIds,
    adGroupIds: query.adGroupIds,
    adIds: query.adIds,
    ids: query.ids,
    status: query.status,
    q: query.q,
    orderBy: query.orderBy,
    order: query.order,
    page: query.page,
    limit: query.limit,
  })
  // 업스트림 shape 변형(summary/paging 누락) 방어 — VIDEO 0건 등 빈 결과 안전 처리.
  return normalizeInsightsResponse<D>(raw)
}

/**
 * CAMPAIGN level — Phase 1 기존 helper. 시그니처 호환 유지 (useOpenApiCampaigns).
 */
export async function fetchCampaignInsights(
  query: Omit<InsightsQuery, 'level'>,
): Promise<InsightsResponse<InsightsCampaignDimensions>> {
  return fetchInsights<InsightsCampaignDimensions>({ ...query, level: 'CAMPAIGN' })
}

/**
 * ADGROUP level — campaignIds 필수 (proxy 단에서 검증). 캠페인 하위 광고그룹 집계.
 */
export async function fetchAdGroupInsights(
  query: Omit<InsightsQuery, 'level'>,
): Promise<InsightsResponse<InsightsAdGroupDimensions>> {
  return fetchInsights<InsightsAdGroupDimensions>({ ...query, level: 'ADGROUP' })
}

/**
 * AD level — campaignIds 필수. adGroupIds 로 추가 좁히기 가능.
 */
export async function fetchAdInsights(
  query: Omit<InsightsQuery, 'level'>,
): Promise<InsightsResponse<InsightsAdDimensions>> {
  return fetchInsights<InsightsAdDimensions>({ ...query, level: 'AD' })
}

/**
 * DAILY level — 최대 90일 기간 (proxy 검증). 페이징 무시 (항상 전체 행).
 */
export async function fetchDailyInsights(
  query: Omit<InsightsQuery, 'level'>,
): Promise<InsightsResponse<InsightsDailyDimensions>> {
  return fetchInsights<InsightsDailyDimensions>({ ...query, level: 'DAILY' })
}

/**
 * HOURLY level — 최대 7일 기간 (proxy 검증). 페이징 무시 (항상 전체 행).
 */
export async function fetchHourlyInsights(
  query: Omit<InsightsQuery, 'level'>,
): Promise<InsightsResponse<InsightsHourlyDimensions>> {
  return fetchInsights<InsightsHourlyDimensions>({ ...query, level: 'HOURLY' })
}

/**
 * CAMPAIGN level 전체 페이지 순회.
 *
 * 안전 가드:
 *   - MAX_PAGES = 50 (limit 200 가정 시 10,000 캠페인까지 커버)
 *   - 페이지 직렬 호출 — 새 API rate limit 명세 확인 전까지 보수적으로 동작.
 *     운영 데이터로 검증 후 병렬화 검토.
 *
 * DAILY/HOURLY 는 가이드상 항상 totalPages=1 이므로 별도 all helper 불요.
 */
export async function fetchAllCampaignInsights(
  query: Omit<InsightsQuery, 'level' | 'page'>,
): Promise<InsightsResponse<InsightsCampaignDimensions>> {
  const MAX_PAGES = 50
  const limit = query.limit ?? 200

  const first = await fetchCampaignInsights({ ...query, page: 1, limit })
  // normalizeInsightsResponse 가 paging 을 항상 채우지만, totalPages 가 0/NaN 인
  // 변형도 방어 (≤1 이면 단일 페이지로 간주).
  const totalPages = first.paging?.totalPages ?? 1
  if (!Number.isFinite(totalPages) || totalPages <= 1) return first

  const merged = { ...first, data: [...first.data] }
  const lastPage = Math.min(totalPages, MAX_PAGES)
  for (let page = 2; page <= lastPage; page++) {
    const next = await fetchCampaignInsights({ ...query, page, limit })
    merged.data.push(...next.data)
  }
  merged.paging = { ...first.paging, page: 1, limit, totalPages: lastPage }
  merged.summary = first.summary
  return merged
}
