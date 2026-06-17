// 정산 집계(/settlements) 검증·유틸 단위 테스트 — dependency-free (node:test + strip)
// 실행: node --experimental-strip-types --test tests/*.test.ts (npm run verify 통합)
//
// validation.ts / dateRange.ts / settlementsTypes.ts 는 'import type' 또는 순수 함수만
// 참조하므로 런타임 의존 없이 격리 실행된다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateGroupBy,
  validateSettlementDateRange,
  sanitizeSingleId,
  sanitizeSettlementOrderBy,
} from '../lib/openApi/validation.ts'
import { friendlyOpenApiError } from '../lib/openApi/health.ts'
import { monthToRange, isValidMonth, currentMonthKst } from '../lib/dateRange.ts'
import { findDimension } from '../lib/openApi/settlementsTypes.ts'
import type { SettlementRow } from '../lib/openApi/settlementsTypes.ts'

// ── validateGroupBy ──────────────────────────────────────────────
test('validateGroupBy: 빈 값 → 기본 [DATE]', () => {
  assert.deepEqual(validateGroupBy(null), { ok: true, value: ['DATE'] })
  assert.deepEqual(validateGroupBy(''), { ok: true, value: ['DATE'] })
})

test('validateGroupBy: 정상 콤마 결합 + 순서 보존', () => {
  assert.deepEqual(validateGroupBy('AGENCY,MEDIA'), { ok: true, value: ['AGENCY', 'MEDIA'] })
  assert.deepEqual(validateGroupBy('MEDIA,AGENCY'), { ok: true, value: ['MEDIA', 'AGENCY'] })
})

test('validateGroupBy: 잘못된 토큰/중복/4개초과 거부', () => {
  assert.equal(validateGroupBy('CAMPAIGN').ok, false)        // 화이트리스트 외
  assert.equal(validateGroupBy('AGENCY,AGENCY').ok, false)    // 중복
  assert.equal(validateGroupBy('DATE,AGENCY,MEDIA,DATA_PROVIDER,DATE').ok, false) // 5개
})

// ── validateSettlementDateRange (366일 상한) ─────────────────────
test('validateSettlementDateRange: 단일 월 통과', () => {
  assert.equal(validateSettlementDateRange('2026-06-01', '2026-06-30').ok, true)
})

test('validateSettlementDateRange: 366일 초과 거부', () => {
  assert.equal(validateSettlementDateRange('2025-01-01', '2026-12-31').ok, false)
})

test('validateSettlementDateRange: 역순 거부', () => {
  const r = validateSettlementDateRange('2026-06-30', '2026-06-01')
  assert.equal(r.ok, false)
})

// ── sanitizeSingleId ─────────────────────────────────────────────
test('sanitizeSingleId: 영숫자/_- 통과, 그 외 drop', () => {
  assert.equal(sanitizeSingleId('AG123'), 'AG123')
  assert.equal(sanitizeSingleId('a-b_c'), 'a-b_c')
  assert.equal(sanitizeSingleId('12,15'), undefined)   // 콤마 불가(단일 값)
  assert.equal(sanitizeSingleId("1' OR"), undefined)   // 인젝션 형태
  assert.equal(sanitizeSingleId(null), undefined)
})

// ── monthToRange / isValidMonth ──────────────────────────────────
test('monthToRange: 월 → [1일~말일]', () => {
  assert.deepEqual(monthToRange('2026-06'), { start: '2026-06-01', end: '2026-06-30' })
  assert.deepEqual(monthToRange('2026-02'), { start: '2026-02-01', end: '2026-02-28' })
  assert.deepEqual(monthToRange('2024-02'), { start: '2024-02-01', end: '2024-02-29' }) // 윤년
})

test('monthToRange: 잘못된 형식 → null', () => {
  assert.equal(monthToRange('2026-13'), null)
  assert.equal(monthToRange('2026/06'), null)
  assert.equal(monthToRange('bad'), null)
})

test('isValidMonth / currentMonthKst', () => {
  assert.equal(isValidMonth('2026-06'), true)
  assert.equal(isValidMonth('2026-13'), false)
  assert.match(currentMonthKst(new Date('2026-06-16T00:00:00Z')), /^\d{4}-\d{2}$/)
})

// ── sanitizeSettlementOrderBy ────────────────────────────────────
test('sanitizeSettlementOrderBy: 화이트리스트 metrics 만 통과', () => {
  assert.equal(sanitizeSettlementOrderBy('revenue'), 'revenue')
  assert.equal(sanitizeSettlementOrderBy('grossProfit'), 'grossProfit')
  assert.equal(sanitizeSettlementOrderBy('margin'), 'margin')
  assert.equal(sanitizeSettlementOrderBy('mediaCost'), 'mediaCost')
  assert.equal(sanitizeSettlementOrderBy('mediaCostInternal'), 'mediaCostInternal')
  assert.equal(sanitizeSettlementOrderBy('impressions'), undefined)  // insights 키 (정산엔 부적합)
  assert.equal(sanitizeSettlementOrderBy('drop_table'), undefined)
  assert.equal(sanitizeSettlementOrderBy(null), undefined)
})

// ── friendlyOpenApiError ─────────────────────────────────────────
test('friendlyOpenApiError: 기술코드 → 한글 메시지', () => {
  assert.match(friendlyOpenApiError('TOKEN_MISSING'), /토큰이 설정되지 않았습니다/)
  assert.match(friendlyOpenApiError('TIMEOUT'), /60초/)
  assert.match(friendlyOpenApiError('NETWORK'), /네트워크/)
  assert.match(friendlyOpenApiError('HTTP_401'), /만료|무효/)
  assert.match(friendlyOpenApiError('HTTP_403'), /권한/)
  assert.match(friendlyOpenApiError('HTTP_404'), /경로|미배포/)
  assert.match(friendlyOpenApiError('HTTP_503'), /업스트림 서버/)
  // 알 수 없는 code → message fallback
  assert.equal(friendlyOpenApiError('UNKNOWN_CODE', '구체 메시지'), '구체 메시지')
})

// ── findDimension ────────────────────────────────────────────────
test('findDimension: 노드 배열에서 type 으로 추출', () => {
  const row: SettlementRow = {
    dimension: [
      { type: 'AGENCY', id: 'A1', name: '대행사1' },
      { type: 'MEDIA', id: 'M1', name: '네이버' },
    ],
    metrics: { revenue: 0, grossProfit: 0, margin: 0, mediaCost: 0, mediaCostInternal: 0 },
  }
  assert.equal(findDimension(row, 'AGENCY')?.name, '대행사1')
  assert.equal(findDimension(row, 'MEDIA')?.id, 'M1')
  assert.equal(findDimension(row, 'DATE'), undefined)
})
