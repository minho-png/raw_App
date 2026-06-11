// Open API proxy 입력 검증 단위 테스트 — dependency-free (node:test + type stripping)
// 실행: node --experimental-strip-types --test tests/*.test.ts  (npm run verify 통합)
//
// lib/openApi/validation.ts 는 './types' 를 'import type' 으로만 참조하므로
// 런타임 의존이 없어 node_modules 없이 격리 실행된다. (QA 리뷰 ⑥)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateIdList,
  sanitizeOrderBy,
  isValidDate,
  daysBetween,
  validateDateRange,
} from '../lib/openApi/validation.ts'

// ── validateIdList: 숫자 콤마 다중 화이트리스트 (보안 ⑦) ──────────
test('validateIdList: 빈 값은 통과(undefined)', () => {
  assert.deepEqual(validateIdList(null, 'campaignIds'), { ok: true, value: undefined })
  assert.deepEqual(validateIdList('', 'campaignIds'), { ok: true, value: undefined })
})

test('validateIdList: 정상 숫자 콤마 다중 통과', () => {
  assert.deepEqual(validateIdList('12', 'ids'), { ok: true, value: '12' })
  assert.deepEqual(validateIdList('12,15,20', 'ids'), { ok: true, value: '12,15,20' })
})

test('validateIdList: 비숫자/공백/injection 형태 거부', () => {
  assert.equal(validateIdList('12,abc', 'ids').ok, false)
  assert.equal(validateIdList('12, 15', 'ids').ok, false)        // 공백 불가
  assert.equal(validateIdList("12;DROP TABLE", 'ids').ok, false) // injection 표면
  assert.equal(validateIdList('12,', 'ids').ok, false)           // trailing comma
})

test('validateIdList: 500개 초과 거부 (대역폭 abuse 차단)', () => {
  const ok500 = Array.from({ length: 500 }, (_, i) => i + 1).join(',')
  const over501 = Array.from({ length: 501 }, (_, i) => i + 1).join(',')
  assert.equal(validateIdList(ok500, 'ids').ok, true)
  assert.equal(validateIdList(over501, 'ids').ok, false)
})

// ── sanitizeOrderBy: 화이트리스트 외 drop ────────────────────────
test('sanitizeOrderBy: 화이트리스트만 통과, 그 외 undefined', () => {
  assert.equal(sanitizeOrderBy('impressions'), 'impressions')
  assert.equal(sanitizeOrderBy('clicks'), 'clicks')
  assert.equal(sanitizeOrderBy('date'), 'date')
  assert.equal(sanitizeOrderBy('datetime'), 'datetime')
  assert.equal(sanitizeOrderBy('cost'), undefined)      // 미허용 키
  assert.equal(sanitizeOrderBy('1=1'), undefined)        // injection 표면
  assert.equal(sanitizeOrderBy(null), undefined)
})

// ── isValidDate ─────────────────────────────────────────────────
test('isValidDate: YYYY-MM-DD 형식만', () => {
  assert.equal(isValidDate('2026-05-15'), true)
  assert.equal(isValidDate('2026-5-15'), false)
  assert.equal(isValidDate('2026/05/15'), false)
  assert.equal(isValidDate(null), false)
})

// ── daysBetween: 포함 기준, UTC (호스트 TZ 무관) ─────────────────
test('daysBetween: 포함 기준 일수', () => {
  assert.equal(daysBetween('2026-05-15', '2026-05-15'), 1)   // 같은 날 = 1일
  assert.equal(daysBetween('2026-05-15', '2026-05-21'), 7)   // 7일
})

test('daysBetween: 윤년 2월 경계 (2024-02-29 존재)', () => {
  assert.equal(daysBetween('2024-02-28', '2024-03-01'), 3)   // 28,29,01 = 3일
  assert.equal(daysBetween('2025-02-28', '2025-03-01'), 2)   // 평년: 28,01 = 2일
})

// ── validateDateRange: level 별 상한 (가이드 §5) ─────────────────
test('validateDateRange: DAILY 90일 경계', () => {
  // 2026-01-01 .. 2026-03-31 = 90일 (포함) → 통과
  assert.equal(validateDateRange('DAILY', '2026-01-01', '2026-03-31').ok, true)
  // 2026-01-01 .. 2026-04-01 = 91일 → 거부
  assert.equal(validateDateRange('DAILY', '2026-01-01', '2026-04-01').ok, false)
})

test('validateDateRange: HOURLY 7일 경계', () => {
  assert.equal(validateDateRange('HOURLY', '2026-05-15', '2026-05-21').ok, true)  // 7일
  assert.equal(validateDateRange('HOURLY', '2026-05-15', '2026-05-22').ok, false) // 8일
})

test('validateDateRange: CAMPAIGN 은 상한 없음', () => {
  // 1년 범위도 통과 (CAMPAIGN/ADGROUP/AD 는 일자 상한 없음)
  assert.equal(validateDateRange('CAMPAIGN', '2025-01-01', '2025-12-31').ok, true)
})

test('validateDateRange: dateFrom > dateTo 거부', () => {
  const r = validateDateRange('DAILY', '2026-05-21', '2026-05-15')
  assert.equal(r.ok, false)
  if (!r.ok) assert.ok(r.message.includes('늦을'))
})
