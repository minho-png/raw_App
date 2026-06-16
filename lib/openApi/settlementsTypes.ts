/**
 * Open API 정산 집계 엔드포인트 타입 — 명세 docs/OPEN_API_INSIGHTS_SPEC.md.
 *
 * 기존 insights(types.ts)의 `dimensions`(평면 객체) 와 **다르다**: 정산 응답의 각 행은
 * `dimension`(단수, groupBy 순서대로 담긴 노드 배열) + `metrics` 를 가진다. 섞이지
 * 않도록 별도 타입으로 둔다.
 *
 * 조회는 **월 단위로만** (사용자 결정) — 과부하 방지. dateFrom/dateTo 는 단일 월.
 */

export type GroupByDim = 'DATE' | 'AGENCY' | 'MEDIA' | 'DATA_PROVIDER'

/** groupBy 차원 노드 — type 으로 판별. */
export type DimensionNode =
  | { type: 'DATE'; date: string }
  | { type: 'AGENCY'; id: string; name: string }
  | { type: 'MEDIA'; id: string; name: string }
  // DATA_PROVIDER: 데이터비용 없으면 id="NON", name="데이터비용 없음"
  | { type: 'DATA_PROVIDER'; id: string; name: string }

/**
 * 정산 metrics — 명세에서 확인된 5개 + index signature(미확정 필드 보존).
 *
 * ⚠️ 전체 metrics 표 미확정: 수수료 분해(agencyFee/dataFee 등)는 명세 표 확보 후 추가.
 * 그 전까지 미확정 필드는 index signature 로 보존되어 raw 접근 가능(추측 매핑 금지).
 */
export interface SettlementMetrics {
  /** 매출 (광고주 청구액) */
  revenue: number
  /** 매출총이익 */
  grossProfit: number
  /** 마진율 (단위 미확정 — 1행 실측 후 확정) */
  margin: number
  /** 매체비 */
  mediaCost: number
  /** 내부거래 매체비 (includeInternalTrade=false 시 mediaCost 에서 제외분) */
  mediaCostInternal: number
  [key: string]: number
}

export interface SettlementRow {
  /** groupBy 순서대로의 차원 노드 배열. */
  dimension: DimensionNode[]
  metrics: SettlementMetrics
}

export interface SettlementsPaging {
  page: number
  limit: number
  totalCount: number
  totalPages: number
}

export interface SettlementsResponse {
  groupBy: GroupByDim[]
  data: SettlementRow[]
  paging: SettlementsPaging
}

/**
 * 정산 집계 쿼리. dateFrom/dateTo 는 **단일 월** 만 (monthToRange 산출).
 */
export interface SettlementsQuery {
  dateFrom: string
  dateTo: string
  groupBy?: GroupByDim[]
  output?: 'json' | 'csv'
  agencyId?: string
  mediaId?: string
  dataProviderId?: string
  includeInternalTrade?: boolean
  orderBy?: string
  order?: 'ASC' | 'DESC'
  page?: number
  limit?: number
}

/** 특정 차원 노드를 dimension 배열에서 추출하는 헬퍼. */
export function findDimension<T extends GroupByDim>(
  row: SettlementRow,
  type: T,
): Extract<DimensionNode, { type: T }> | undefined {
  return row.dimension.find(d => d.type === type) as Extract<DimensionNode, { type: T }> | undefined
}
