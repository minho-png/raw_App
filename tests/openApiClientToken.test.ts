// Open API 토큰 sanitize 단위 테스트 — dependency-free (node:test + type stripping)
// 실행: node --experimental-strip-types --test tests/*.test.ts  (npm run verify 통합)
//
// sanitizeApiToken/isHeaderSafeToken 은 lib/openApi/validation.ts 에 위치 (순수 함수,
// 런타임 의존 없음). client.ts 는 OpenApiError 의 parameter property 때문에 strip-only
// 모드에서 import 불가라 검증 로직을 validation.ts 로 분리했다.
//
// 회귀 방어 (2026-06-15 "Open API NETWORK: Headers.append invalid header value"):
//   OPEN_API_TOKEN 값 앞뒤에 개행/공백이 섞이면 `Authorization: Bearer \n9|...` 헤더가
//   만들어져 fetch 가 throw → 모든 Open API 호출이 NETWORK 실패했다.
//   sanitizeApiToken 이 모든 whitespace 를 제거해 헤더 안전 문자열만 남겨야 함을 잠근다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeApiToken, isHeaderSafeToken } from '../lib/openApi/validation.ts'

test('sanitizeApiToken: 선행 개행 제거 (실제 장애 케이스)', () => {
  assert.equal(
    sanitizeApiToken('\n9|U5t88AWFFSwHpRLp5fTLS6JyupEgql9FpWtr8ZKW6aff2b2b'),
    '9|U5t88AWFFSwHpRLp5fTLS6JyupEgql9FpWtr8ZKW6aff2b2b',
  )
})

test('sanitizeApiToken: 후행 개행·공백 제거', () => {
  assert.equal(sanitizeApiToken('9|abcDEF\n'), '9|abcDEF')
  assert.equal(sanitizeApiToken('  9|abcDEF  '), '9|abcDEF')
  assert.equal(sanitizeApiToken('9|abcDEF\r\n'), '9|abcDEF')
})

test('sanitizeApiToken: 내부 공백/탭/개행도 제거 (줄바꿈 붙여넣기)', () => {
  assert.equal(sanitizeApiToken('9|abc\nDEF'), '9|abcDEF')
  assert.equal(sanitizeApiToken('9|abc\tDEF'), '9|abcDEF')
  assert.equal(sanitizeApiToken('9| abc DEF '), '9|abcDEF')
})

test('sanitizeApiToken: 정상 토큰은 그대로', () => {
  const t = '9|U5t88AWFFSwHpRLp5fTLS6JyupEgql9FpWtr8ZKW6aff2b2b'
  assert.equal(sanitizeApiToken(t), t)
})

test('sanitizeApiToken: null/undefined/공백전용 → 빈 문자열', () => {
  assert.equal(sanitizeApiToken(null), '')
  assert.equal(sanitizeApiToken(undefined), '')
  assert.equal(sanitizeApiToken('   \n\t '), '')
})

test('sanitizeApiToken: 결과는 헤더 안전(printable ASCII)', () => {
  const cleaned = sanitizeApiToken('\n9|U5t88AWFF\t')
  assert.equal(isHeaderSafeToken(cleaned), true)
})

test('isHeaderSafeToken: 제어문자 포함 시 false', () => {
  assert.equal(isHeaderSafeToken('9|abcDEF'), true)
  assert.equal(isHeaderSafeToken('9|abc\x7fDEF'), false)
  assert.equal(isHeaderSafeToken(''), false)
})
