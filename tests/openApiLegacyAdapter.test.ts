// Open API → Motiv 호환 어댑터 단위 테스트 — dependency-free (node:test + type stripping)
// 실행: node --experimental-strip-types --test tests/*.test.ts  (npm run verify 통합)
//
// lib/openApi/legacyAdapter.ts 는 './types' · '../motivApi/types' 를 'import type'
// 으로만 참조하므로 런타임 의존이 없어 node_modules 없이 격리 실행된다.
//
// 회귀 방어 (2026-06-15 "Motiv VIDEO 500"):
//   업스트림이 빈 결과(예: VIDEO 캠페인 0건) 에서 paging/summary 를 생략한 200 을
//   주면, 어댑터/route 가 paging 필드 접근에서 TypeError → 500(INTERNAL) 이 됐다.
//   pagingToMotivMeta 와 metrics 변환이 undefined 입력에 안전해야 함을 잠근다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  pagingToMotivMeta,
  metricsToMotivStats,
  openStatusToMotiv,
  motivStatusToOpen,
  adGroupInsightToMotivAdGroup,
} from '../lib/openApi/legacyAdapter.ts'

// ── adGroup 정산성 주입 (광고주/대행사/비용 작업 2026-06-16) ─────
// DMP 감지·파생 계산은 settlementDerive(서버 전용)가 수행하고, 어댑터는 주입값만 할당.
test('adGroupInsightToMotivAdGroup: targetingProductId + settlement 주입 할당', () => {
  const ag = adGroupInsightToMotivAdGroup({
    dimensions: { adGroupId: '5', adGroupName: 'CT_SKP_리타겟', campaignId: '10', status: 'ACTIVE' },
    metrics: { impressions: 1000, clicks: 10, ctr: 1, cost: 1_000_000, currency: 'KRW', cpc: 0, cpm: 0 },
  }, { targetingProductId: 'SKP', settlement: { revenue: 1_100_000, agency_fee: 100_000, data_fee: 100_000 } })
  assert.equal(ag.targeting_product_id, 'SKP')
  assert.equal(ag.stats?.data_fee, 100_000)
  assert.equal(ag.stats?.cost, 1_000_000)
})

test('adGroupInsightToMotivAdGroup: 주입 없으면 분류 undefined + 정산성 0', () => {
  const ag = adGroupInsightToMotivAdGroup({
    dimensions: { adGroupId: '6', adGroupName: '일반 광고그룹', campaignId: '10', status: 'ACTIVE' },
    metrics: { impressions: 500, clicks: 5, ctr: 1, cost: 500_000, currency: 'KRW', cpc: 0, cpm: 0 },
  })
  assert.equal(ag.targeting_product_id, undefined)
  assert.equal(ag.stats?.data_fee, 0)
})

// ── metricsToMotivStats 정산성 주입 ─────────────────────────────
test('metricsToMotivStats: settlement 없으면 정산성 필드 0', () => {
  const s = metricsToMotivStats({ impressions: 0, clicks: 0, ctr: 0, cost: 1_000_000, currency: 'KRW', cpc: 0, cpm: 0 })
  assert.equal(s.cost, 1_000_000)
  assert.equal(s.agency_fee, 0)
  assert.equal(s.data_fee, 0)
  assert.equal(s.revenue, 0)
})

test('metricsToMotivStats: settlement 주입 → 그대로 할당', () => {
  const s = metricsToMotivStats(
    { impressions: 0, clicks: 0, ctr: 0, cost: 1_000_000, currency: 'KRW', cpc: 0, cpm: 0 },
    { revenue: 1_200_000, agency_fee: 200_000, data_fee: 0 },
  )
  assert.equal(s.agency_fee, 200_000)
  assert.equal(s.revenue, 1_200_000)
})

// ── pagingToMotivMeta: 누락 paging 방어 (VIDEO 500 근본 원인) ──────
test('pagingToMotivMeta: undefined paging 도 안전 (단일 페이지 합성)', () => {
  const meta = pagingToMotivMeta(undefined, 200)
  assert.equal(meta.current_page, 1)
  assert.equal(meta.last_page, 1)
  assert.equal(meta.total, 0)
  assert.equal(meta.from, null)
  assert.equal(meta.to, null)
  assert.equal(meta.per_page, 200)
})

test('pagingToMotivMeta: null paging 도 throw 하지 않음', () => {
  assert.doesNotThrow(() => pagingToMotivMeta(null))
})

test('pagingToMotivMeta: 정상 paging 매핑', () => {
  const meta = pagingToMotivMeta({ page: 2, limit: 50, totalCount: 120, totalPages: 3 })
  assert.equal(meta.current_page, 2)
  assert.equal(meta.last_page, 3)
  assert.equal(meta.total, 120)
  assert.equal(meta.per_page, 50)
  assert.equal(meta.from, 51)
  assert.equal(meta.to, 100)
})

test('pagingToMotivMeta: totalPages 누락 시 totalCount/perPage 로 산출', () => {
  const meta = pagingToMotivMeta({ page: 1, limit: 200, totalCount: 350, totalPages: 0 }, 200)
  assert.equal(meta.last_page, 2) // ceil(350/200)
})

// ── metricsToMotivStats: 누락 metrics 방어 ────────────────────────
test('metricsToMotivStats: undefined metrics → 0 채움 (throw 없음)', () => {
  const s = metricsToMotivStats(undefined)
  assert.equal(s.cost, 0)
  assert.equal(s.win, 0)
  assert.equal(s.v_impression, 0)
  assert.equal(s.revenue, 0)     // Open API 미제공 — 항상 0
  assert.equal(s.agency_fee, 0)  // Open API 미제공 — 항상 0
})

test('metricsToMotivStats: impressions/clicks/cost 매핑 + noclick 산출', () => {
  const s = metricsToMotivStats({
    impressions: 1000, clicks: 30, ctr: 3, cost: 50000, currency: 'KRW', cpc: 1666, cpm: 50,
    videoCompletions: 800,
  })
  assert.equal(s.win, 1000)
  assert.equal(s.v_impression, 1000)
  assert.equal(s.click, 30)
  assert.equal(s.noclick, 970)
  assert.equal(s.cost, 50000)
  assert.equal(s.v_play100, 800)
})

// ── status 매핑 ───────────────────────────────────────────────────
test('status 매핑: ACTIVE↔Y, PAUSED↔N', () => {
  assert.equal(openStatusToMotiv('ACTIVE'), 'Y')
  assert.equal(openStatusToMotiv('PAUSED'), 'N')
  assert.equal(openStatusToMotiv(undefined), 'N')
  assert.equal(motivStatusToOpen('Y'), 'ACTIVE')
  assert.equal(motivStatusToOpen('N'), 'PAUSED')
})
