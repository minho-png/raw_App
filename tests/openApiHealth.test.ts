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

test('mapHealthStatus: 그 외(500/504/네트워크) → error', () => {
  assert.equal(mapHealthStatus(500, 'INTERNAL'), 'error')
  assert.equal(mapHealthStatus(504, 'TIMEOUT'), 'error')
  assert.equal(mapHealthStatus(0, 'NETWORK'), 'error')
})
