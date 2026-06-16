/**
 * Open API 정산 집계 호출 — `/settlements` (또는 운영망 확정 경로).
 *
 * 명세: docs/OPEN_API_INSIGHTS_SPEC.md. 조회는 **월 단위로만** (과부하 방지).
 * client.openApiFetch(timeout/재시도/에러정규화)를 재사용한다.
 *
 * 응답 shape 방어: 명세는 배열 키 `data`, 노드 키 `dimension`(단수). 운영망 변형을
 * 대비해 `data`/`rows` 둘 다 수용하고, 행의 `dimension`/`dimensions` 둘 다 수용한다.
 */

import { openApiFetch } from './client'
import type {
  SettlementsQuery,
  SettlementsResponse,
  SettlementRow,
  SettlementMetrics,
  SettlementsPaging,
  DimensionNode,
  GroupByDim,
} from './settlementsTypes'

// 운영망 경로 미확정 — env override 가능. 기본은 명세 추정 경로.
const SETTLEMENTS_PATH = process.env.OPEN_API_SETTLEMENTS_PATH || '/settlements'

const EMPTY_METRICS: SettlementMetrics = {
  revenue: 0,
  grossProfit: 0,
  margin: 0,
  mediaCost: 0,
  mediaCostInternal: 0,
}

function toNum(v: unknown): number {
  if (v === undefined || v === null) return 0
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

/** 임의 metrics 객체를 SettlementMetrics 로 정규화(미확정 필드도 number 로 보존). */
function normalizeMetrics(raw: unknown): SettlementMetrics {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_METRICS }
  const src = raw as Record<string, unknown>
  const out: SettlementMetrics = { ...EMPTY_METRICS }
  for (const [k, v] of Object.entries(src)) {
    out[k] = toNum(v)
  }
  return out
}

/** dimension 노드 배열 정규화 — 알 수 없는 노드는 그대로 통과(방어적). */
function normalizeDimension(raw: unknown): DimensionNode[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((n): n is DimensionNode => !!n && typeof n === 'object' && 'type' in n)
}

function normalizeRow(raw: unknown): SettlementRow {
  const r = (raw ?? {}) as Record<string, unknown>
  // dimension(단수, 명세) 우선, dimensions(복수) 변형도 수용.
  const dimRaw = r.dimension ?? r.dimensions
  return {
    dimension: normalizeDimension(dimRaw),
    metrics: normalizeMetrics(r.metrics),
  }
}

function normalizeResponse(raw: unknown, requested: GroupByDim[]): SettlementsResponse {
  const r = (raw ?? {}) as Record<string, unknown>
  const arr = Array.isArray(r.data) ? r.data : Array.isArray(r.rows) ? r.rows : []
  const data = arr.map(normalizeRow)
  const pagingRaw = (r.paging ?? {}) as Record<string, unknown>
  const paging: SettlementsPaging = {
    page: toNum(pagingRaw.page) || 1,
    limit: toNum(pagingRaw.limit) || data.length,
    totalCount: toNum(pagingRaw.totalCount) || data.length,
    totalPages: toNum(pagingRaw.totalPages) || 1,
  }
  const groupBy = Array.isArray(r.groupBy) ? (r.groupBy as GroupByDim[]) : requested
  // 진단(명세 확정용) — 운영망 응답 상위/행 키를 1줄 기록.
  try {
    const topKeys = Object.keys(r).join(',')
    const rowKeys = data[0] ? Object.keys((arr[0] ?? {}) as object).join(',') : '(empty)'
    console.info(`[OpenAPI:settlements] shape topKeys=${topKeys} rowKeys=${rowKeys} count=${data.length}`)
  } catch { /* 무시 */ }
  return { groupBy, data, paging }
}

/**
 * 정산 집계 조회 (JSON). 단일 월 권장 — query.dateFrom/dateTo 는 monthToRange 산출.
 */
export async function fetchSettlements(query: SettlementsQuery): Promise<SettlementsResponse> {
  const groupBy = query.groupBy && query.groupBy.length > 0 ? query.groupBy : (['DATE'] as GroupByDim[])
  const raw = await openApiFetch<unknown>(SETTLEMENTS_PATH, {
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    groupBy: groupBy.join(','),
    output: 'json',
    agencyId: query.agencyId,
    mediaId: query.mediaId,
    dataProviderId: query.dataProviderId,
    includeInternalTrade: query.includeInternalTrade === undefined
      ? undefined
      : String(query.includeInternalTrade),
    orderBy: query.orderBy,
    order: query.order,
    page: query.page,
    limit: query.limit,
  })
  return normalizeResponse(raw, groupBy)
}
