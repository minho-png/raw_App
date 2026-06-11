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
