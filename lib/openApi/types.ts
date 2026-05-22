/**
 * Crosstarget Open API (`/api/v1/ads/*`) 타입 정의.
 *
 * 기존 Motiv API (lib/motivApi) 와 별개 — 사용자 요청 (2026-05-22) 으로
 * 신규 공식 Open API 로 점진 마이그레이션 중. Phase 1 은 인프라만 구축,
 * 페이지 교체는 차후 정산성 지표 (profit_rate / agency_fee / data_fee /
 * is_free) 가 새 API 에서 제공되면 진행.
 *
 * 명세 출처: 사용자 제공 문서 (Crosstarget desk · API 가이드).
 */

export type InsightsLevel = 'CAMPAIGN' | 'ADGROUP' | 'AD' | 'DAILY' | 'HOURLY'

/** 새 API status — 기존 Motiv 'Y' / 'N' 과 다름. 매핑 시 변환 필수. */
export type OpenApiStatus = 'ACTIVE' | 'PAUSED'

/**
 * 캠페인 타입 — 새 API 가이드 기준.
 * Motiv 의 PARTNERS 대응값은 추후 확인 필요.
 */
export type OpenApiCampaignType = 'DISPLAY' | 'VIDEO' | 'TV'

/**
 * CAMPAIGN level dimensions — 캠페인 단위로 그룹된 집계 row 의 식별/속성 컬럼.
 *
 * 누락 (새 API 미제공) — Phase 1 마이그레이션 보류 사유:
 *   - profit_rate (정산 마진율)
 *   - agency_fee / data_fee (정산 fee 분해)
 *   - is_free (무상 캠페인 플래그)
 */
export interface InsightsCampaignDimensions {
  campaignId: string
  campaignName: string
  status: OpenApiStatus
  campaignType?: OpenApiCampaignType
  productType?: string
  productTypeName?: string
  startDate: string | null
  endDate: string | null
  accountId: string
  accountName: string
  agencyId?: string
  agencyName?: string
  totalBudget: number
  totalSpent: number
  dailyBudget: number
  dailySpent: number
}

/**
 * 모든 level 공통 metrics. 새 API 명세상 30+ 필드 — 자주 쓰는 핵심만 명시,
 * 나머지는 index signature 로 확장 허용 (타입 안전성과 명세 진화 사이 절충).
 */
export interface InsightsMetrics {
  impressions: number
  clicks: number
  ctr: number
  cost: number
  currency: string
  cpc: number
  cpm: number
  views?: number
  viewRate?: number
  vtr?: number
  cpv?: number
  conversions?: number
  conversionRate?: number
  costPerConversion?: number
  [key: string]: number | string | undefined
}

export interface InsightsRow<D = InsightsCampaignDimensions> {
  dimensions: D
  metrics: InsightsMetrics
}

export interface InsightsPaging {
  page: number
  limit: number
  totalCount: number
  totalPages: number
}

export interface InsightsResponse<D = InsightsCampaignDimensions> {
  data: InsightsRow<D>[]
  summary: { metrics: InsightsMetrics }
  paging: InsightsPaging
}

export interface InsightsErrorBody {
  error: {
    code: string
    message: string
    details?: Record<string, string[]>
  }
}

/**
 * `/api/v1/ads/insights` 쿼리 파라미터.
 *
 * 새 API 는 `dateFrom`/`dateTo` 필수 — proxy 단에서 검증.
 */
export interface InsightsQuery {
  level: InsightsLevel
  dateFrom: string
  dateTo: string
  campaignType?: OpenApiCampaignType | string
  accountId?: string
  agencyId?: string
  page?: number
  limit?: number
}
