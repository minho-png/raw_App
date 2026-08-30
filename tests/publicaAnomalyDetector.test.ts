// Publica 이상 징후 탐지 단위 테스트 — dependency-free (node:test + type stripping)
// 실행: node --experimental-strip-types --test tests/*.test.ts  (npm run verify 통합)
//
// anomalyDetector.ts 는 types.ts 를 'import type' 으로만 참조하므로 type stripping 후
// 런타임 의존이 없어 node_modules 없이도 격리 실행된다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  median,
  fmtInt,
  fmtPct,
  detectBasicAnomalies,
  detectPublisherAnomalies,
  detectErrorAnomalies,
  finalizeAnomalies,
  countBySeverity,
  DEFAULT_DETECT_OPTIONS,
} from '../lib/publica/anomalyDetector.ts'
import type { BasicRow, PublisherRow, ErrorBreakdown, PublicaAnomaly } from '../lib/publica/types.ts'

// ── 헬퍼 ────────────────────────────────────────────────────
type BasicTuple = [string, number, number, number, number, number, number, number, number | null, number | null, number | null, number | null, number | null]

function basic(t: BasicTuple): BasicRow {
  const [date, bidRequests, bidResponses, bidErrors, bidTimeouts, bidWon, impressions, revenue, responseRate, timeoutRate, winRate, renderRate, avgImpEcpm] = t
  return { rawDate: `${date} 00:00:00+00:00`, date, bidRequests, bidResponses, bidErrors, bidTimeouts, bidWon, impressions, revenue, responseRate, timeoutRate, winRate, renderRate, avgImpEcpm }
}

/** 실제 수신 샘플 (2026-08-20~26 basic 리포트) 그대로. */
const SAMPLE_BASIC: BasicRow[] = ([
  ['2026-08-20', 18433074, 405072, 157184, 532,  58454, 53708, 137.7955, 0.02, 0.0, 0.14, 0.92, 2.57],
  ['2026-08-21', 19019239, 420397, 184305, 789,  63068, 57107, 143.4865, 0.02, 0.0, 0.15, 0.91, 2.51],
  ['2026-08-22', 21625496, 424805, 140961, 2877, 59571, 54720, 138.78,   0.02, 0.0, 0.14, 0.92, 2.54],
  ['2026-08-23', 20437481, 388609, 129865, 587,  53361, 49097, 127.4935, 0.02, 0.0, 0.14, 0.92, 2.60],
  ['2026-08-24', 18533588, 409813, 153374, 619,  59122, 54603, 138.6135, 0.02, 0.0, 0.14, 0.92, 2.54],
  ['2026-08-25', 17960745, 414496, 149790, 482,  58102, 53606, 140.0485, 0.02, 0.0, 0.14, 0.92, 2.61],
  ['2026-08-26', 18083925, 419642, 121489, 1264, 61436, 56792, 144.814,  0.02, 0.0, 0.15, 0.92, 2.55],
] as BasicTuple[]).map(basic)

function publisher(over: Partial<PublisherRow> = {}): PublisherRow {
  return {
    publisherId: '1', publisherName: 'Test',
    bidRequests: 1000, bidResponses: 100, bidErrors: 10, bidTimeouts: 0,
    bidWon: 50, impressions: 48, revenue: 12.5,
    responseRate: 0.1, timeoutRate: 0.0, winRate: 0.5, renderRate: 0.96, avgImpEcpm: 2.6,
    ...over,
  }
}

// ── 유틸 ────────────────────────────────────────────────────
test('median: 홀수·짝수·빈 배열', () => {
  assert.equal(median([3, 1, 2]), 2)
  assert.equal(median([4, 1, 3, 2]), 2.5)
  assert.equal(median([]), null)
})

test('fmtInt / fmtPct: 로케일 비의존 포맷', () => {
  assert.equal(fmtInt(1031799), '1,031,799')
  assert.equal(fmtInt(0), '0')
  assert.equal(fmtPct(0.1483), '14.8%')
})

// ── basic 리포트 ────────────────────────────────────────────
test('basic: 실제 정상 샘플에서는 이상 없음', () => {
  assert.deepEqual(detectBasicAnomalies(SAMPLE_BASIC), [])
})

test('basic: 최신일 매출 급락은 warning', () => {
  const rows = [...SAMPLE_BASIC]
  rows[rows.length - 1] = { ...rows[rows.length - 1], revenue: 50 } // 기준선 ~138 대비 64% 하락
  const found = detectBasicAnomalies(rows)
  const drop = found.find(a => a.kind === 'metric_drop')!
  assert.equal(drop.severity, 'warning')
  assert.equal(drop.source, 'basic')
  assert.match(drop.message, /매출/)
})

test('basic: 최신일 지표 0 은 critical', () => {
  const rows = [...SAMPLE_BASIC]
  rows[rows.length - 1] = { ...rows[rows.length - 1], impressions: 0 }
  const found = detectBasicAnomalies(rows)
  const drop = found.find(a => a.kind === 'metric_drop' && a.severity === 'critical')!
  assert.ok(drop)
  assert.match(drop.message, /노출 0/)
})

test('basic: 렌더율 기준 미달은 warning', () => {
  const rows = [...SAMPLE_BASIC]
  rows[rows.length - 1] = { ...rows[rows.length - 1], renderRate: 0.55 }
  const found = detectBasicAnomalies(rows)
  assert.equal(found.filter(a => a.kind === 'low_render_rate').length, 1)
})

test('basic: 타임아웃율 기준 초과는 warning', () => {
  const rows = [...SAMPLE_BASIC]
  rows[rows.length - 1] = { ...rows[rows.length - 1], timeoutRate: 0.08 }
  const found = detectBasicAnomalies(rows)
  assert.equal(found.filter(a => a.kind === 'timeout_spike').length, 1)
})

test('basic: 행이 1개뿐이면 기준선 비교를 건너뜀', () => {
  assert.deepEqual(detectBasicAnomalies([SAMPLE_BASIC[0]]), [])
})

test('basic: 빈 입력은 빈 결과', () => {
  assert.deepEqual(detectBasicAnomalies([]), [])
})

// ── publisher 리포트 ────────────────────────────────────────
test('publisher: 실제 LG전자 케이스 — 요청은 있는데 응답 0 → critical', () => {
  // 2026-08-20~26 publisher 리포트 실측값.
  const lg = publisher({
    publisherId: '1247', publisherName: 'LG Electronics',
    bidRequests: 20545752, bidResponses: 0, bidErrors: 5169, bidTimeouts: 3988,
    bidWon: 0, impressions: 0, revenue: 0,
    responseRate: 0.0, timeoutRate: 0.0, winRate: null, renderRate: null, avgImpEcpm: null,
  })
  const found = detectPublisherAnomalies([lg])
  assert.equal(found.length, 1)
  assert.equal(found[0].kind, 'no_bid_response')
  assert.equal(found[0].severity, 'critical')
  assert.equal(found[0].subject, 'LG Electronics')
  assert.match(found[0].message, /20,545,752/)
})

test('publisher: 실제 삼성 케이스 — 정상이므로 이상 없음', () => {
  const samsung = publisher({
    publisherId: '547', publisherName: 'Samsung Korea',
    bidRequests: 113547796, bidResponses: 2882834, bidErrors: 1031799, bidTimeouts: 3162,
    bidWon: 413114, impressions: 379633, revenue: 971.0315,
    responseRate: 0.03, timeoutRate: 0.0, winRate: 0.14, renderRate: 0.92, avgImpEcpm: 2.56,
  })
  assert.deepEqual(detectPublisherAnomalies([samsung]), [])
})

test('publisher: 퍼널은 끊긴 첫 지점만 보고 (중복 알림 방지)', () => {
  // 응답은 있으나 낙찰 0 → no_win 만. no_impression/no_revenue 는 발생하지 않아야 함.
  const row = publisher({ bidResponses: 500, bidWon: 0, impressions: 0, revenue: 0, renderRate: null })
  const kinds = detectPublisherAnomalies([row]).map(a => a.kind)
  assert.deepEqual(kinds, ['no_win'])
})

test('publisher: 낙찰은 있는데 노출 0 → critical', () => {
  const row = publisher({ bidWon: 100, impressions: 0, revenue: 0, renderRate: null })
  const found = detectPublisherAnomalies([row])
  assert.equal(found[0].kind, 'no_impression')
  assert.equal(found[0].severity, 'critical')
})

test('publisher: 노출은 있는데 매출 0 → warning', () => {
  const row = publisher({ impressions: 48, revenue: 0 })
  const found = detectPublisherAnomalies([row])
  assert.equal(found[0].kind, 'no_revenue')
  assert.equal(found[0].severity, 'warning')
})

test('publisher: 퍼널이 정상이어도 렌더율은 별도 점검', () => {
  const row = publisher({ renderRate: 0.5 })
  const kinds = detectPublisherAnomalies([row]).map(a => a.kind)
  assert.deepEqual(kinds, ['low_render_rate'])
})

test('publisher: 비율이 null(분모 0)이면 품질 규칙을 건너뜀', () => {
  const row = publisher({ bidRequests: 0, bidResponses: 0, bidWon: 0, impressions: 0, revenue: 0, renderRate: null, timeoutRate: null })
  assert.deepEqual(detectPublisherAnomalies([row]), [])
})

// ── error 리포트 ────────────────────────────────────────────
function breakdown(over: Partial<ErrorBreakdown> = {}): ErrorBreakdown {
  return {
    publisherId: '1', publisherName: 'Test', totalErrors: 100,
    byClass: { integration: 0, config: 0, expected: 100 },
    codes: [],
    ...over,
  }
}

test('error: 실제 삼성 케이스 — integration 14.8% → warning', () => {
  const bd = breakdown({
    publisherId: '547', publisherName: 'Samsung Korea', totalErrors: 1031799,
    byClass: { integration: 153032, config: 1240, expected: 877527 },
    codes: [
      { code: 22, name: 'BID_REJECTED_DUP_MEDIAFILE_URL', class: 'expected', count: 810796 },
      { code: 83, name: 'BID_CONNECTION_ERROR', class: 'integration', count: 121592 },
      { code: 23, name: 'BID_REJECTED_DUP_ADOMAIN', class: 'expected', count: 66731 },
      { code: 3,  name: 'BAD_SERVER_RESPONSE', class: 'integration', count: 31440 },
      { code: 37, name: 'NO_MEDIAFILE_SATISFY_ENDPOINT_MAX_BITRATE', class: 'config', count: 1240 },
    ],
  })
  const found = detectErrorAnomalies([bd])
  assert.equal(found.length, 1)
  assert.equal(found[0].kind, 'integration_errors')
  assert.equal(found[0].severity, 'warning')
  assert.match(found[0].message, /14\.8%/)
  assert.match(found[0].message, /BID_CONNECTION_ERROR/)
})

test('error: 실제 LG 케이스 — integration 100% → critical', () => {
  const bd = breakdown({
    publisherId: '1247', publisherName: 'LG Electronics', totalErrors: 5169,
    byClass: { integration: 5169, config: 0, expected: 0 },
    codes: [
      { code: 83, name: 'BID_CONNECTION_ERROR', class: 'integration', count: 3803 },
      { code: 3,  name: 'BAD_SERVER_RESPONSE', class: 'integration', count: 1366 },
    ],
  })
  const found = detectErrorAnomalies([bd])
  assert.equal(found[0].severity, 'critical')
  assert.match(found[0].message, /100\.0%/)
})

test('error: 정상 경매 결과만 있으면 이상 없음', () => {
  // 총 에러가 많아도 전부 expected 등급이면 대응 불필요.
  const bd = breakdown({ totalErrors: 900000, byClass: { integration: 0, config: 0, expected: 900000 } })
  assert.deepEqual(detectErrorAnomalies([bd]), [])
})

test('error: 미정의 코드는 별도 warning', () => {
  const bd = breakdown({
    totalErrors: 10, byClass: { integration: 10, config: 0, expected: 0 },
    codes: [{ code: 9999, name: '(미정의 코드)', class: 'integration', count: 10 }],
  })
  const kinds = detectErrorAnomalies([bd]).map(a => a.kind)
  assert.ok(kinds.includes('unknown_error_code'))
})

test('error: 총 에러 0 이면 0 나눗셈 없이 건너뜀', () => {
  const bd = breakdown({ totalErrors: 0, byClass: { integration: 0, config: 0, expected: 0 } })
  assert.deepEqual(detectErrorAnomalies([bd]), [])
})

// ── 종합 ────────────────────────────────────────────────────
test('finalizeAnomalies: critical 우선 정렬', () => {
  const list: PublicaAnomaly[] = [
    { kind: 'no_revenue', severity: 'warning', source: 'publisher', subject: 'B', message: '', evidence: {} },
    { kind: 'no_bid_response', severity: 'critical', source: 'publisher', subject: 'A', message: '', evidence: {} },
  ]
  const { anomalies, truncated } = finalizeAnomalies(list)
  assert.equal(anomalies[0].severity, 'critical')
  assert.equal(truncated, 0)
})

test('finalizeAnomalies: maxAnomalies 초과분은 truncated 로 보고', () => {
  const list: PublicaAnomaly[] = Array.from({ length: 5 }, (_, i) => ({
    kind: 'no_revenue' as const, severity: 'warning' as const, source: 'publisher' as const,
    subject: `P${i}`, message: '', evidence: {},
  }))
  const { anomalies, truncated } = finalizeAnomalies(list, { ...DEFAULT_DETECT_OPTIONS, maxAnomalies: 2 })
  assert.equal(anomalies.length, 2)
  assert.equal(truncated, 3)
})

test('countBySeverity: 심각도별 집계', () => {
  const counts = countBySeverity([
    { kind: 'no_bid_response', severity: 'critical', source: 'publisher', subject: 'A', message: '', evidence: {} },
    { kind: 'no_revenue', severity: 'warning', source: 'publisher', subject: 'B', message: '', evidence: {} },
    { kind: 'no_revenue', severity: 'warning', source: 'publisher', subject: 'C', message: '', evidence: {} },
  ])
  assert.deepEqual(counts, { critical: 1, warning: 2, info: 0 })
})
