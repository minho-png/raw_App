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
  InsightsQuery,
  InsightsResponse,
} from './types'

const INSIGHTS_PATH = '/ads/insights'

/**
 * 일반 insights 호출 — level 은 query 가 명시. dimensions 타입은 호출자가 제네릭으로 지정.
 *
 * 모든 level 별 helper 가 본 함수를 거치며, 본 함수는 client.openApiFetch 의 단순 wrapper.
 * 신규 쿼리 키 추가 시 본 객체에 한 번만 반영하면 모든 helper 가 자동으로 지원.
 */
export async function fetchInsights<D>(
  query: InsightsQuery,
): Promise<InsightsResponse<D>> {
  return openApiFetch<InsightsResponse<D>>(INSIGHTS_PATH, {
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
  if (first.paging.totalPages <= 1) return first

  const merged = { ...first, data: [...first.data] }
  const lastPage = Math.min(first.paging.totalPages, MAX_PAGES)
  for (let page = 2; page <= lastPage; page++) {
    const next = await fetchCampaignInsights({ ...query, page, limit })
    merged.data.push(...next.data)
  }
  merged.paging = { ...first.paging, page: 1, limit, totalPages: lastPage }
  return merged
}
