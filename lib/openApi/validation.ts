/**
 * Open API proxy 입력 검증 — 순수 함수 (React/Next 의존 없음).
 *
 * route handler 에서 분리해 단위 테스트 가능하게 함 (QA 리뷰 ⑥).
 * 보안 리뷰 ⑦ 의 화이트리스트 규칙을 단일 소스로 보유.
 */

import type { InsightsLevel } from './types'

// id 류: 숫자 콤마 다중, 최대 500개 (거대 문자열 outbound 대역폭 abuse 차단)
export const ID_LIST_RE = /^\d+(,\d+){0,499}$/
export const Q_MAX_LEN = 128
export const ALLOWED_ORDER_BY = new Set(['impressions', 'clicks', 'date', 'datetime'])
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export type Check<T> = { ok: true; value: T } | { ok: false; message: string }

/**
 * 토큰 문자열 sanitize — 공백·개행 전부 제거. 순수 함수.
 *
 * 증상 (2026-06-15): OPEN_API_TOKEN 앞뒤에 '\n' 이 섞이면 `Authorization: Bearer
 * \n9|...` 헤더가 만들어져 fetch 의 Headers.append 가 "invalid header value" 로
 * throw → 모든 Open API 호출이 NETWORK 실패. env/Vercel 에 토큰을 붙여넣을 때
 * trailing newline 이 흔히 들어간다. Crosstarget(Laravel Sanctum) 토큰은
 * `id|alphanumeric` 형식이라 내부 공백이 절대 없으므로 모든 whitespace 제거가 안전.
 */
export function sanitizeApiToken(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\s+/g, '')
}

/** sanitize 후 헤더 안전 문자(printable ASCII)로만 구성됐는지. */
export function isHeaderSafeToken(token: string): boolean {
  return /^[\x21-\x7e]+$/.test(token)
}

/** 콤마 다중 ID 파라미터 검증 — 값이 없으면 통과(undefined). */
export function validateIdList(value: string | null, name: string): Check<string | undefined> {
  if (!value) return { ok: true, value: undefined }
  if (!ID_LIST_RE.test(value)) {
    return { ok: false, message: `${name} 는 숫자 콤마 다중 형식이어야 합니다 (최대 500개, 예: 12,15,20).` }
  }
  return { ok: true, value }
}

/** 화이트리스트 외 orderBy 는 drop (upstream 이 무시 — 표면 최소화). */
export function sanitizeOrderBy(value: string | null): string | undefined {
  return value && ALLOWED_ORDER_BY.has(value) ? value : undefined
}

/** YYYY-MM-DD 형식 검증. */
export function isValidDate(value: string | null): value is string {
  return !!value && DATE_RE.test(value)
}

/** dateFrom..dateTo (포함) 일수. 두 값 모두 형식 검증된 후 호출. UTC 기준 — 호스트 TZ 무관. */
export function daysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10))
  return Math.floor((b - a) / 86_400_000) + 1
}

/**
 * level 별 일자 범위 제약 (가이드 §5): DAILY ≤ 90일, HOURLY ≤ 7일 (포함 기준).
 * 형식·순서는 호출 전 isValidDate 로 검증 가정.
 */
export function validateDateRange(level: InsightsLevel, dateFrom: string, dateTo: string): Check<number> {
  if (dateFrom > dateTo) return { ok: false, message: 'dateFrom 이 dateTo 보다 늦을 수 없습니다.' }
  const days = daysBetween(dateFrom, dateTo)
  if (level === 'DAILY' && days > 90) return { ok: false, message: 'DAILY level 은 최대 90일 (포함 기준).' }
  if (level === 'HOURLY' && days > 7) return { ok: false, message: 'HOURLY level 은 최대 7일 (포함 기준).' }
  return { ok: true, value: days }
}

// ── 정산 집계(/settlements) 검증 (명세 docs/OPEN_API_INSIGHTS_SPEC.md) ──────────
/** groupBy 허용 차원 토큰. */
export const ALLOWED_GROUP_BY = ['DATE', 'AGENCY', 'MEDIA', 'DATA_PROVIDER'] as const
export type GroupByDim = typeof ALLOWED_GROUP_BY[number]
/** 조회 기간 상한 (포함 일수 기준) — 초과 시 422. */
export const SETTLEMENT_MAX_DAYS = 366

/** dateFrom..dateTo 가 최대 366일(포함) 이내인지 + 순서. */
export function validateSettlementDateRange(dateFrom: string, dateTo: string): Check<number> {
  if (dateFrom > dateTo) return { ok: false, message: 'dateFrom 이 dateTo 보다 늦을 수 없습니다.' }
  const days = daysBetween(dateFrom, dateTo)
  if (days > SETTLEMENT_MAX_DAYS) {
    return { ok: false, message: `조회 기간은 최대 ${SETTLEMENT_MAX_DAYS}일 (포함 기준) 입니다.` }
  }
  return { ok: true, value: days }
}

/**
 * groupBy 콤마결합 문자열 검증 — 화이트리스트, 중복 불가, 최대 4개. 나열 순서 보존.
 * 빈 값이면 기본 차원 ['DATE'] (명세 default). 잘못된 토큰/중복은 422.
 */
export function validateGroupBy(value: string | null): Check<GroupByDim[]> {
  if (!value || !value.trim()) return { ok: true, value: ['DATE'] }
  const tokens = value.split(',').map(t => t.trim()).filter(Boolean)
  if (tokens.length === 0) return { ok: true, value: ['DATE'] }
  if (tokens.length > 4) return { ok: false, message: 'groupBy 는 최대 4개 차원까지 가능합니다.' }
  const seen = new Set<string>()
  const out: GroupByDim[] = []
  for (const t of tokens) {
    if (!(ALLOWED_GROUP_BY as readonly string[]).includes(t)) {
      return { ok: false, message: `groupBy 는 ${ALLOWED_GROUP_BY.join('/')} 중에서만 가능합니다 (받은 값: ${t}).` }
    }
    if (seen.has(t)) return { ok: false, message: `groupBy 차원 중복 불가 (${t}).` }
    seen.add(t)
    out.push(t as GroupByDim)
  }
  return { ok: true, value: out }
}

/** 단일 ID 필터 (agencyId/mediaId/dataProviderId) — 안전 문자만, 길이 제한. */
export function sanitizeSingleId(value: string | null): string | undefined {
  if (!value) return undefined
  const v = value.trim()
  if (!v || v.length > 64) return undefined
  // ID/코드: 영숫자·_-만 허용 (인젝션 표면 차단).
  return /^[A-Za-z0-9_-]+$/.test(v) ? v : undefined
}
