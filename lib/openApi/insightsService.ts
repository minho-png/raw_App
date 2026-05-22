/**
 * `/api/v1/ads/insights` helper — level 별 호출 함수.
 */

import { openApiFetch } from './client'
import type {
  InsightsCampaignDimensions,
  InsightsQuery,
  InsightsResponse,
} from './types'

const INSIGHTS_PATH = '/ads/insights'

/**
 * CAMPAIGN level insights 조회. dateFrom/dateTo 필수.
 *
 * 페이징은 caller 가 처리 — 본 helper 는 단일 호출만 수행.
 * 전체 페이지 순회는 `fetchAllCampaignInsights` 사용.
 */
export async function fetchCampaignInsights(
  query: Omit<InsightsQuery, 'level'>,
): Promise<InsightsResponse<InsightsCampaignDimensions>> {
  return openApiFetch<InsightsResponse<InsightsCampaignDimensions>>(INSIGHTS_PATH, {
    level: 'CAMPAIGN',
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    campaignType: query.campaignType,
    accountId: query.accountId,
    agencyId: query.agencyId,
    page: query.page,
    limit: query.limit,
  })
}

/**
 * CAMPAIGN level 전체 페이지 순회.
 *
 * 안전 가드:
 *   - MAX_PAGES = 50 (limit 200 가정 시 10,000 캠페인까지 커버)
 *   - 페이지 직렬 호출 — 새 API rate limit 명세 확인 전까지 보수적으로 동작.
 *     운영 데이터로 검증 후 병렬화 검토.
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
