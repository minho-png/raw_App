/**
 * Crosstarget Open API (`/api/v1/ads/*`, `/api/v1/me`) 타입 정의.
 *
 * 기존 Motiv API (lib/motivApi) 와 별개 — 사용자 요청 (2026-05-22) 으로
 * 신규 공식 Open API 로 점진 마이그레이션 중. Phase 1 은 인프라만 구축,
 * 페이지 교체는 차후 정산성 지표 (profit_rate / agency_fee / data_fee /
 * is_free) 가 새 API 에서 제공되면 진행.
 *
 * Phase 1 확장 (2026-06-11): `/me` 헬스체크 타입 + ADGROUP/AD/DAILY/HOURLY
 * level dimension 타입 + InsightsMetrics 30 metric 명세 반영.
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
 * ADGROUP level dimensions — 가이드상 핵심 식별/속성만 명시.
 * costMethod/price/platform/sdk/targetingMethod 는 매체별 상이 — index signature 확장.
 */
export interface InsightsAdGroupDimensions {
  adGroupId: string
  adGroupName: string
  campaignId: string
  campaignName?: string
  status: OpenApiStatus
  costMethod?: string
  price?: number
  platform?: string
  sdk?: string
  targetingMethod?: string
  accountId?: string
  accountName?: string
  agencyId?: string
  agencyName?: string
  [key: string]: string | number | null | undefined
}

/** AD level dimensions — 광고 1건. 소재 메타는 매체별 상이 → index signature. */
export interface InsightsAdDimensions {
  adId: string
  adName: string
  adGroupId: string
  adGroupName?: string
  campaignId: string
  campaignName?: string
  status: OpenApiStatus
  accountId?: string
  accountName?: string
  agencyId?: string
  agencyName?: string
  [key: string]: string | number | null | undefined
}

/** DAILY level — 한 행이 한 날짜의 일별 집계. */
export interface InsightsDailyDimensions {
  /** YYYY-MM-DD */
  date: string
  [key: string]: string | number | null | undefined
}

/** HOURLY level — 한 행이 한 시간대의 집계. */
export interface InsightsHourlyDimensions {
  /** 'YYYY-MM-DD HH' 형식 (가이드 기준). */
  datetime: string
  [key: string]: string | number | null | undefined
}

/**
 * 모든 level 공통 metrics — 가이드 30 metric 반영.
 *
 * VIDEO/TV 캠페인 전용 metric (videoStarts/P25/...) 은 DISPLAY 에선 0 또는 undefined.
 * caller 는 undefined-safe 로 다룰 것. 추가 metric 은 index signature 로 확장.
 */
export interface InsightsMetrics {
  // ── 기본 ──
  impressions: number
  clicks: number
  ctr: number
  cost: number
  currency: string
  cpc: number
  cpm: number

  // ── 전환 (30일 윈도) ──
  conversions30d?: number
  conversionRate30d?: number
  conversionValue30d?: number
  opens30d?: number
  installs30d?: number
  purchases30d?: number

  // ── 전환 (1일 윈도) ──
  conversions1d?: number
  conversionRate1d?: number
  conversionValue1d?: number
  opens1d?: number
  installs1d?: number
  purchases1d?: number

  // ── 영상 ──
  videoImpressions?: number
  videoStarts?: number
  videoP25Watched?: number
  videoP50Watched?: number
  videoP75Watched?: number
  videoCompletions?: number
  videoCompletionRate?: number
  videoViews?: number

  // ── 호환: 초기 가이드(Phase 1 인프라) 추정 키. 새 가이드의 윈도 분해 키로 대체되었으나
  //         기존 hook 호환 위해 보존. 신규 코드는 위 명시 키 사용 권장.
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
 *
 * level 별 추가 필터 (가이드 §5 매트릭스):
 *   - ADGROUP/AD: campaignIds 필수
 *   - DAILY: 최대 90일, HOURLY: 최대 7일 (proxy 검증)
 *   - status / campaignType / q 는 CAMPAIGN/ADGROUP/AD 전용
 */
export interface InsightsQuery {
  level: InsightsLevel
  dateFrom: string
  dateTo: string
  campaignType?: OpenApiCampaignType | string
  accountId?: string
  agencyId?: string
  /** 콤마 결합 다중 ID. ADGROUP/AD 필수, DAILY/HOURLY 선택. */
  campaignIds?: string
  /** 콤마 결합 다중 ID. AD/DAILY/HOURLY 선택. */
  adGroupIds?: string
  /** 콤마 결합 다중 ID. DAILY/HOURLY 선택. */
  adIds?: string
  /** 자기 자신 ID 다중 (해당 level PK). CAMPAIGN/ADGROUP/AD 선택. */
  ids?: string
  status?: OpenApiStatus
  /** 이름 부분 매칭. CAMPAIGN/ADGROUP/AD 선택. */
  q?: string
  /** 정렬 키 (impressions/clicks/date/datetime) — 화이트리스트 외 값은 무시됨. */
  orderBy?: string
  order?: 'ASC' | 'DESC'
  page?: number
  limit?: number
}

/**
 * `/api/v1/me` 응답 — 토큰 헬스체크 + 사용자 식별.
 *
 * 토큰이 유효하면 200 + data. 무효/만료 401, 권한 부족 403, env 미설정 503.
 * permissions 는 'dsp.view' 등 권한 토큰 배열.
 */
export interface MeResponse {
  data: {
    id: number
    mb_id: string
    name: string
    email: string
    roles: string[]
    permissions: string[]
  }
}
