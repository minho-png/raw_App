// Open API 헬스 상태 매핑 단위 테스트 — dependency-free (node:test + type stripping)
// 실행: node --experimental-strip-types --test tests/*.test.ts
//
// lib/openApi/health.ts 는 import 없는 순수 함수 — useOpenApiHealth hook 의
// 상태 분기 로직을 React 의존 없이 검증한다. (QA 리뷰 ⑥ #5)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapHealthStatus } from '../lib/openApi/health.ts'

test('mapHealthStatus: 503 또는 TOKEN_MISSING → token_missing', () => {
  assert.equal(mapHealthStatus(503, 'TOKEN_MISSING'), 'token_missing')
  assert.equal(mapHealthStatus(503, undefined), 'token_missing')
  // status 가 503 이 아니어도 code 가 TOKEN_MISSING 이면 우선
  assert.equal(mapHealthStatus(500, 'TOKEN_MISSING'), 'token_missing')
})

test('mapHealthStatus: 401 → unauthorized', () => {
  assert.equal(mapHealthStatus(401, 'HTTP_401'), 'unauthorized')
  assert.equal(mapHealthStatus(401, undefined), 'unauthorized')
})

test('mapHealthStatus: 403 → forbidden', () => {
  assert.equal(mapHealthStatus(403, undefined), 'forbidden')
})

// ── 'error' 세분화 (정확한 원인) ─────────────────────────────────
test('mapHealthStatus: 404 → not_found (엔드포인트 미배포/경로오류)', () => {
  assert.equal(mapHealthStatus(404, 'HTTP_404'), 'not_found')
  assert.equal(mapHealthStatus(404, undefined), 'not_found')
})

test('mapHealthStatus: TIMEOUT code → timeout (504 라도 code 우선)', () => {
  assert.equal(mapHealthStatus(504, 'TIMEOUT'), 'timeout')
})

test('mapHealthStatus: NETWORK code → network', () => {
  assert.equal(mapHealthStatus(504, 'NETWORK'), 'network')
  assert.equal(mapHealthStatus(0, 'NETWORK'), 'network')
})

test('mapHealthStatus: timeout/network 는 같은 504 라도 code 로 구별', () => {
  assert.notEqual(mapHealthStatus(504, 'TIMEOUT'), mapHealthStatus(504, 'NETWORK'))
})

test('mapHealthStatus: 5xx(≠503) → server_error', () => {
  assert.equal(mapHealthStatus(500, 'INTERNAL'), 'server_error')
  assert.equal(mapHealthStatus(502, 'HTTP_502'), 'server_error')
})

test('mapHealthStatus: 503 은 server_error 가 아니라 token_missing 우선', () => {
  assert.equal(mapHealthStatus(503, undefined), 'token_missing')
})

test('mapHealthStatus: 분류 불가(예상 외 4xx) → error', () => {
  assert.equal(mapHealthStatus(418, 'HTTP_418'), 'error')
})
