// 계산 정합 단위 테스트 — dependency-free (Node 내장 node:test + type stripping)
// 실행: node --experimental-strip-types --test tests/*.test.ts  (npm run verify 에 통합)
//
// lib/calculationService.ts 는 rawDataParser 를 'import type' 으로만 참조하므로
// type stripping 후 런타임 의존이 없어 node_modules 없이도 격리 실행된다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  roundWon,
  distributeRounding,
  calcCosts,
  calcDmpSettlement,
  deriveSettlementFromCost,
  detectDmpType,
  DMP_FEE_RATES_DECIMAL,
  fmtMargin,
} from '../lib/calculationService.ts'

// ── fmtMargin: 명세 단위 미확정 휴리스틱 (소수/퍼센트/basis point) ─────
test('fmtMargin: 소수(<1) → ×100 후 %', () => {
  assert.equal(fmtMargin(0.15), '15.00%')
  assert.equal(fmtMargin(0.075), '7.50%')
  assert.equal(fmtMargin(0), '0.00%')
})

test('fmtMargin: 퍼센트(1~999) → .toFixed(1)+%', () => {
  assert.equal(fmtMargin(15), '15.0%')
  assert.equal(fmtMargin(99.5), '99.5%')
})

test('fmtMargin: basis point (≥1000) → 정수+천단위', () => {
  assert.equal(fmtMargin(1500), '1,500')
})

test('fmtMargin: NaN/Infinity/null → 대시', () => {
  assert.equal(fmtMargin(NaN), '—')
  assert.equal(fmtMargin(Infinity), '—')
  assert.equal(fmtMargin(null), '—')
  assert.equal(fmtMargin(undefined), '—')
})

// ── deriveSettlementFromCost: 매체비 → 정산성 파생 (Open API Phase 1 갭 보완) ──
test('deriveSettlementFromCost: 요율 없으면 전부 0 (기존 동작 유지)', () => {
  const d = deriveSettlementFromCost(1_000_000)
  assert.equal(d.mediaCost, 1_000_000)
  assert.equal(d.pureAgencyFee, 0)
  assert.equal(d.dataFee, 0)
  assert.equal(d.agencyFeeTotal, 0)
  assert.equal(d.revenue, 1_000_000)
})

test('deriveSettlementFromCost: 대행 15% 파생', () => {
  const d = deriveSettlementFromCost(1_000_000, { agencyFeeRate: 0.15 })
  assert.equal(d.pureAgencyFee, 150_000)
  assert.equal(d.dataFee, 0)
  assert.equal(d.agencyFeeTotal, 150_000)
  assert.equal(d.revenue, 1_150_000)
})

test('deriveSettlementFromCost: DMP 10% data_fee 파생', () => {
  const d = deriveSettlementFromCost(1_000_000, { dmpFeeDecimal: 0.10 })
  assert.equal(d.dataFee, 100_000)
  assert.equal(d.agencyFeeTotal, 100_000)  // 순수대행 0 + DMP 10만
  assert.equal(d.revenue, 1_100_000)
})

test('deriveSettlementFromCost: 대행+DMP 합산 (Motiv 관례 agency_fee = 대행+DMP)', () => {
  const d = deriveSettlementFromCost(1_000_000, { agencyFeeRate: 0.15, dmpFeeDecimal: 0.10 })
  assert.equal(d.pureAgencyFee, 150_000)
  assert.equal(d.dataFee, 100_000)
  assert.equal(d.agencyFeeTotal, 250_000)
  assert.equal(d.revenue, 1_250_000)
})

test('deriveSettlementFromCost: NaN/음수 cost 안전', () => {
  assert.equal(deriveSettlementFromCost(NaN, { agencyFeeRate: 0.15 }).mediaCost, 0)
  assert.equal(deriveSettlementFromCost(NaN, { agencyFeeRate: 0.15 }).revenue, 0)
})

test('deriveSettlementFromCost: SKP 광고그룹 요율로 data_fee 일관', () => {
  // detectDmpType('SKP_리타겟') = SKP, 요율 0.10 → data_fee = cost × 0.10
  const dmp = detectDmpType('SKP_리타겟')
  const d = deriveSettlementFromCost(500_000, { dmpFeeDecimal: DMP_FEE_RATES_DECIMAL[dmp] })
  assert.equal(dmp, 'SKP')
  assert.equal(d.dataFee, 50_000)
})

// ── roundWon: IEEE754 표현 오차 방어 ──────────────────────────
test('roundWon: 0.1 곱 / 1.1 나눗셈 오차가 있어도 안정적 반올림', () => {
  assert.equal(roundWon(1234 * 0.1), 123)        // 123.4 (float 오차 무관)
  assert.equal(roundWon(2090 / 1.1), 1900)       // 1900.0000000002 → 1900
  assert.equal(roundWon(1100 / 1.1), 1000)       // 999.9999... → 1000
  assert.equal(roundWon(0.5), 1)                 // round-half-up 유지
  assert.equal(roundWon(2.5), 3)
})

test('roundWon: 비유한값은 0', () => {
  assert.equal(roundWon(NaN), 0)
  assert.equal(roundWon(Infinity), 0)
  assert.equal(roundWon(-Infinity), 0)
})

// ── distributeRounding: Σ = total 정합 보장 ──────────────────
test('distributeRounding: 합이 정확값 반올림 총액과 일치 (누적오차 제거)', () => {
  // 1000/1.1 = 909.09... 10행. 행별 round=909 → 합 9090.
  // 정확합 9090.90.. → 9091. distribute 가 9091 로 정합을 맞춰야 함.
  const exact = Array(10).fill(1000 / 1.1)
  const out = distributeRounding(exact)
  const sum = out.reduce((a, b) => a + b, 0)
  assert.equal(sum, roundWon(exact.reduce((a, b) => a + b, 0)))
  assert.equal(sum, 9091)
  // 행별 단순 반올림(909*10=9090)과 1원 차이를 배분으로 흡수
  assert.notEqual(sum, exact.map(v => Math.round(v)).reduce((a, b) => a + b, 0))
})

test('distributeRounding: 큰 소수부 행부터 +1 배분 (결정적)', () => {
  // 합 = 2.0 → target 2. floor=[0,0,0,0] rem=2 → 소수부 큰 2행(0.9, 0.7) +1.
  assert.deepEqual(distributeRounding([0.9, 0.7, 0.4, 0.0]), [1, 1, 0, 0])
})

test('distributeRounding: total 명시 시 그 값에 정합', () => {
  assert.deepEqual(distributeRounding([10.4, 10.4, 10.4], 30), [10, 10, 10])
  assert.equal(distributeRounding([10.4, 10.4, 10.4], 31).reduce((a, b) => a + b, 0), 31)
})

test('distributeRounding: 음수(환불) 행도 합 정합', () => {
  const vals = [-10.5, -10.5, -10.5]
  const out = distributeRounding(vals)
  assert.equal(out.reduce((a, b) => a + b, 0), roundWon(vals.reduce((a, b) => a + b, 0)))
})

test('distributeRounding: 경계 — 빈/단일/NaN', () => {
  assert.deepEqual(distributeRounding([]), [])
  assert.deepEqual(distributeRounding([5.6]), [6])
  // NaN 은 0 으로 간주하되 total 정합은 유지
  const out = distributeRounding([NaN, 10.5, 10.5])
  assert.equal(out.length, 3)
  assert.equal(out.reduce((a, b) => a + b, 0), roundWon(21))
})

test('distributeRounding: total 이 극단값이어도 합 정합만은 보장', () => {
  assert.equal(distributeRounding([1.1, 1.1], 100).reduce((a, b) => a + b, 0), 100)
})

// ── calcCosts: 기존 공식 회귀 ─────────────────────────────────
test('calcCosts: 네이버 VAT 공급가', () => {
  const c = calcCosts(2090, true, 0)
  assert.equal(c.netAmount, 1900)
  assert.equal(c.executionAmount, 1900)
})

test('calcCosts: 수수료 역산 (10%)', () => {
  const c = calcCosts(900, false, 0.1)
  assert.equal(c.netAmount, 900)
  assert.equal(c.executionAmount, 1000)
})

test('calcCosts: feeDecimal>=1 이면 집행=순액', () => {
  assert.equal(calcCosts(1000, false, 1).executionAmount, 1000)
})

// ── calcDmpSettlement: 그룹 합 정합 ──────────────────────────
test('calcDmpSettlement: totalFee = Σ 행 feeAmount (정수합 정합)', () => {
  const rows = [
    { dmpType: 'SKP' as const, executionAmount: 1000, netAmount: 909 },
    { dmpType: 'SKP' as const, executionAmount: 1000, netAmount: 909 },
    { dmpType: 'KB' as const, executionAmount: 500, netAmount: 455 },
  ]
  const s = calcDmpSettlement(rows)
  const feeSum = s.rows.reduce((a, r) => a + r.feeAmount, 0)
  assert.equal(s.totalFee, feeSum)
})
