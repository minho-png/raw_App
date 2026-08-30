// Publica 에러코드 사전·집계 단위 테스트 — dependency-free (node:test + type stripping)
// 실행: node --experimental-strip-types --test tests/*.test.ts  (npm run verify 통합)
//
// errorCodes.ts 는 types.ts 를 'import type' 으로만 참조하므로 type stripping 후
// 런타임 의존이 없어 node_modules 없이도 격리 실행된다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  lookupErrorCode,
  classifyErrorCode,
  formatErrorCode,
  buildErrorBreakdowns,
  PUBLICA_ERROR_CODES,
} from '../lib/publica/errorCodes.ts'
import type { ErrorRow } from '../lib/publica/types.ts'

// ── 사전 무결성 ─────────────────────────────────────────────
test('사전: 코드 중복 없음', () => {
  const codes = PUBLICA_ERROR_CODES.map(c => c.code)
  assert.equal(new Set(codes).size, codes.length)
})

test('사전: 문서에 정의된 코드 조회', () => {
  assert.equal(lookupErrorCode(83)?.name, 'BID_CONNECTION_ERROR')
  assert.equal(lookupErrorCode(3)?.name, 'BAD_SERVER_RESPONSE')
  assert.equal(lookupErrorCode(22)?.name, 'BID_REJECTED_DUP_MEDIAFILE_URL')
  assert.equal(lookupErrorCode(13)?.name, 'NO_FILL_ERROR')
})

test('사전: 미정의 코드는 null', () => {
  assert.equal(lookupErrorCode(9999), null)
})

// ── 등급 분류 ───────────────────────────────────────────────
test('분류: 연동 장애 코드는 integration', () => {
  assert.equal(classifyErrorCode(83), 'integration') // 비더 서버 연결 종료
  assert.equal(classifyErrorCode(3), 'integration')  // 비더 서버 오류 응답
  assert.equal(classifyErrorCode(8), 'integration')  // 응답·오류 모두 없음
})

test('분류: 정상 경매 결과는 expected', () => {
  assert.equal(classifyErrorCode(22), 'expected') // 미디어파일 중복 제거
  assert.equal(classifyErrorCode(23), 'expected') // Adomain 중복 제거
  assert.equal(classifyErrorCode(13), 'expected') // No fill
  assert.equal(classifyErrorCode(26), 'expected') // 더 높은 CPM 에 낙찰 실패
})

test('분류: 설정·소재 문제는 config', () => {
  assert.equal(classifyErrorCode(37), 'config') // max_bitrate 초과
  assert.equal(classifyErrorCode(60), 'config') // 소재 URL 404
})

test('분류: 미정의 코드는 조사 대상이므로 integration', () => {
  assert.equal(classifyErrorCode(9999), 'integration')
})

test('formatErrorCode: 사람이 읽는 라벨', () => {
  assert.equal(formatErrorCode(83), '83 BID_CONNECTION_ERROR')
  assert.equal(formatErrorCode(9999), '9999 (미정의 코드)')
})

// ── buildErrorBreakdowns ────────────────────────────────────
// 실제 수신 샘플 (2026-08-20~26 error 리포트) 그대로 사용.
const SAMPLE: ErrorRow[] = [
  { publisherId: '547',  publisherName: 'Samsung Korea',   errorCode: 22, bidErrors: 810796 },
  { publisherId: '547',  publisherName: 'Samsung Korea',   errorCode: 83, bidErrors: 121592 },
  { publisherId: '547',  publisherName: 'Samsung Korea',   errorCode: 23, bidErrors: 66731 },
  { publisherId: '547',  publisherName: 'Samsung Korea',   errorCode: 3,  bidErrors: 31440 },
  { publisherId: '1247', publisherName: 'LG Electronics',  errorCode: 83, bidErrors: 3803 },
  { publisherId: '1247', publisherName: 'LG Electronics',  errorCode: 3,  bidErrors: 1366 },
  { publisherId: '547',  publisherName: 'Samsung Korea',   errorCode: 37, bidErrors: 1240 },
  { publisherId: '547',  publisherName: 'Samsung Korea',   errorCode: null, bidErrors: 0 },
  { publisherId: '1247', publisherName: 'LG Electronics',  errorCode: null, bidErrors: 0 },
]

test('집계: 퍼블리셔별 합계가 publisher 리포트 bid_errors 와 일치', () => {
  const bds = buildErrorBreakdowns(SAMPLE)
  const samsung = bds.find(b => b.publisherId === '547')!
  const lg = bds.find(b => b.publisherId === '1247')!
  // publisher 리포트상 Samsung 1031799 / LG 5169 와 동일해야 정합.
  assert.equal(samsung.totalErrors, 1031799)
  assert.equal(lg.totalErrors, 5169)
})

test('집계: 등급별 분해', () => {
  const samsung = buildErrorBreakdowns(SAMPLE).find(b => b.publisherId === '547')!
  assert.equal(samsung.byClass.integration, 121592 + 31440) // 83 + 3
  assert.equal(samsung.byClass.expected, 810796 + 66731)    // 22 + 23
  assert.equal(samsung.byClass.config, 1240)                // 37
})

test('집계: 코드는 건수 내림차순 정렬', () => {
  const samsung = buildErrorBreakdowns(SAMPLE).find(b => b.publisherId === '547')!
  assert.deepEqual(samsung.codes.map(c => c.code), [22, 83, 23, 3, 37])
})

test('집계: 퍼블리셔는 총 에러 내림차순 정렬', () => {
  const bds = buildErrorBreakdowns(SAMPLE)
  assert.deepEqual(bds.map(b => b.publisherId), ['547', '1247'])
})

test('집계: error_code 빈 값 + 0건 패딩 행은 제외', () => {
  const bds = buildErrorBreakdowns(SAMPLE)
  assert.ok(bds.every(b => b.codes.every(c => c.code !== null)))
})

test('집계: 미정의 코드는 이름과 등급이 표시됨', () => {
  const bds = buildErrorBreakdowns([
    { publisherId: '9', publisherName: 'Test', errorCode: 9999, bidErrors: 5 },
  ])
  assert.equal(bds[0].codes[0].name, '(미정의 코드)')
  assert.equal(bds[0].codes[0].class, 'integration')
})
