/**
 * calculationService.ts
 * RAW_APP(GFA RAW MASTER PRO)의 계산 로직을 KIM 프로젝트에 이식
 * - DMP 자동 감지 (광고그룹명 기반)
 * - VAT 처리 (Naver GFA: 공급가 ÷ 1.1)
 * - 집행 금액 / 순 금액 / 공급가 계산
 */

import type { DmpType } from './rawDataParser'

// ── DMP 수수료율 (RAW_APP 기준, 소수) ──────────────────────────
export const DMP_FEE_RATES_DECIMAL: Record<DmpType, number> = {
  SKP:              0.10,
  KB:               0.10,
  LOTTE:            0.09,  // KIM 기준 9%
  TG360:            0.10,
  BC:               0,     // 계약 확정 0%
  SH:               0,     // 계약 확정 0%
  WIFI:             0.10,
  HyperLocal:       0,
  MEDIA_TARGETING:  0,     // _N 접미사 — 매체 타게팅 (DMP 수수료 없음)
  DIRECT:           0,
}

// KIM 기존 DMP_FEE_RATES와 동기화 (% 단위)
export const DMP_FEE_RATES_PERCENT: Record<DmpType, number> = {
  SKP:              10,
  KB:               10,
  LOTTE:            9,
  TG360:            10,
  BC:               0,
  SH:               0,
  WIFI:             10,
  HyperLocal:       0,
  MEDIA_TARGETING:  0,
  DIRECT:           0,
}

// ── DMP 키워드 감지 테이블 ────────────────────────────────────
// 순서 중요: 더 구체적인 것을 먼저
interface DmpKeyword {
  dmp: DmpType
  keywords: string[]
}

const DMP_KEYWORD_TABLE: DmpKeyword[] = [
  { dmp: 'SKP',        keywords: ['SKP', 'SK플래닛', 'SK Planet', 'SK PLANET', 'SKPLANET'] },
  { dmp: 'KB',         keywords: ['KB', '국민카드', 'KB DMP', 'KBDMP'] },
  { dmp: 'LOTTE',      keywords: ['LOTTE', '롯데', 'LOTTEDMP', '롯데딥애드', 'DEEPAD'] },
  { dmp: 'TG360',      keywords: ['TG360', 'TG 360', '티지360'] },
  { dmp: 'BC',         keywords: ['BC', 'BC카드', 'BCCARD'] },
  { dmp: 'SH',         keywords: ['SH', '신한', 'SHINHAN'] },
  { dmp: 'WIFI',       keywords: ['WIFI', 'WI-FI', '와이파이', 'WIFI타겟', '로플랫', 'ROPLAT'] },
  { dmp: 'HyperLocal', keywords: ['HYPERLOCAL', 'HYPER LOCAL', '하이퍼로컬', '실내위치', '실내 위치', 'INDOOR'] },
]

/**
 * 광고그룹명에서 DMP 타입 자동 감지
 * RAW_APP의 detectDmp() 로직과 동일
 */
export function detectDmpType(adGroupName: string): DmpType {
  if (!adGroupName || !adGroupName.trim()) return 'DIRECT'

  // ── 최우선: _N 토큰 → 매체 타게팅 (DMP 수수료 0%) ───────────
  // "_N"이 토큰 끝(문자열 끝 or 다음 구분자 _ 앞)에 있으면 매체 타게팅으로 분류.
  // 예: "SKP_N", "KB_N_리타겟", "광고그룹_SKP_N"  → MEDIA_TARGETING
  // 예외: "_NEW", "_NAVER" 등 _N 뒤에 알파벳이 이어지는 경우는 제외.
  if (/_N(_|$)/i.test(adGroupName)) {
    return 'MEDIA_TARGETING'
  }

  const upper = adGroupName.toUpperCase()
  for (const { dmp, keywords } of DMP_KEYWORD_TABLE) {
    if (keywords.some(k => upper.includes(k))) return dmp
  }
  return 'DIRECT'
}

/**
 * DMP 타입이 실제 DMP인지 여부 (DIRECT 제외)
 */
export function isDmp(dmpType: DmpType): boolean {
  return dmpType !== 'DIRECT'
}

// ── 금액 반올림 정합 유틸 ─────────────────────────────────────
//
// 정산 금액은 1원 단위 정수로 표시·정산된다. 두 종류의 부동소수점 오차를 다룬다:
//  (1) IEEE754 표현 오차 — net * 0.1 이 ...0000001 / ...9999999 로 나와
//      반올림이 한쪽으로 튀는 현상. roundWon() 이 양자화로 방어한다.
//  (2) 행별 반올림 누적 — 각 행을 Math.round 한 뒤 더하면 그 합이 '정확값을
//      한 번 반올림한 총액' 과 행 수만큼 벌어진다(최대 수십 원). 표시 그룹
//      단위로 distributeRounding() 을 적용하면 'Σ행 = 그룹 총액' 을 보장한다.

/**
 * 원 단위 반올림 (round-half-up, 음수 대칭은 Math.round 동작 유지).
 * 곱셈/나눗셈 결과의 이진 표현 오차를 6자리에서 양자화해 제거한 뒤 반올림하므로
 * `roundWon(net * 0.1)` 같은 식이 항상 안정적으로 같은 정수를 낸다.
 */
export function roundWon(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(Math.round(value * 1e6) / 1e6)
}

/**
 * 최대 잔여 배분(largest remainder method).
 * 각 정확값(float)을 정수로 만들되, 정수 배열의 합이 `total`(미지정 시 정확값
 * 합을 roundWon 한 값)과 **정확히 일치**하도록 잔여 ±1원을 소수부가 큰(잉여) /
 * 작은(부족) 행부터 배분한다. 반환 배열의 합 === target 을 항상 보장.
 *
 * 용도: 한 표시 그룹(광고주 행의 DMP사별 셀, 캠페인의 매체별 행 등)에서
 * 개별 정수 셀들의 합이 그룹 합계 정수와 어긋나지 않도록 정합을 맞춘다.
 *
 * - 빈 배열이면 [] 반환.
 * - NaN/Infinity 입력은 0 으로 간주.
 * - 동률 소수부는 원래 순서(앞쪽)를 우선해 결정적(deterministic)으로 동작.
 */
export function distributeRounding(values: number[], total?: number): number[] {
  const n = values.length
  if (n === 0) return []

  const sanitized = values.map(v => (Number.isFinite(v) ? v : 0))
  const target = total !== undefined
    ? roundWon(total)
    : roundWon(sanitized.reduce((s, v) => s + v, 0))

  const result = sanitized.map(v => Math.floor(v))
  let remainder = target - result.reduce((s, v) => s + v, 0)

  // 소수부 큰 순 (동률은 인덱스 오름차순) → 결정적 배분 순서
  const order = sanitized
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)

  if (remainder > 0) {
    for (let k = 0; k < order.length && remainder > 0; k++, remainder--) {
      result[order[k].i] += 1
    }
  } else if (remainder < 0) {
    for (let k = order.length - 1; k >= 0 && remainder < 0; k--, remainder++) {
      result[order[k].i] -= 1
    }
  }

  // total 을 임의 지정해 |잔여| > 행수인 극단 케이스: 합 정합만 첫 행에 보정.
  if (remainder !== 0) result[0] += remainder
  return result
}

// ── 집행 금액 계산 (RAW_APP 공식) ────────────────────────────
export interface CostCalculation {
  supplyValue: number     // 파일 원본 금액
  netAmount: number       // 순 금액 (Naver: supplyValue/1.1, 기타: supplyValue)
  executionAmount: number // 집행 금액 = netAmount / (1 - feeRate)
}

/**
 * RAW_APP calculationService 공식:
 * - Naver GFA: baseValue = supplyValue / 1.1 (VAT 포함 → 공급가)
 * - 기타 매체: baseValue = supplyValue
 * - executionAmount = baseValue / (1 - feeDecimal)  (feeDecimal < 1인 경우)
 * - feeDecimal = 1이면 executionAmount = baseValue (100% fee = 에이전시 직접 운영)
 */
export function calcCosts(
  supplyValue: number,
  isNaver: boolean,
  feeDecimal: number,   // 0~1 범위 (예: 10% → 0.10)
): CostCalculation {
  const netAmount = isNaver
    ? roundWon(supplyValue / 1.1)
    : supplyValue

  const executionAmount = feeDecimal >= 1
    ? netAmount
    : roundWon(netAmount / (1 - feeDecimal))

  return { supplyValue, netAmount, executionAmount }
}

/**
 * 행 그룹에 대해 sum-then-round 패턴으로 총 집행금액 산출.
 * 사용자 QA v4 V4-INFO-03 — row 단위 calcCosts() 의 누적 round 오차(±10~50원) 제거.
 *
 * 그룹화 키: (media, appliedFeeDecimal) — 동일 매체·동일 fee 묶음에 한해 sum-then-round.
 *   매체가 다르면 Naver ÷1.1 정책, fee 가 다르면 ÷(1-fee) 정책이 달라 분리 필수.
 *
 * fee 정보 부재 row 는 별도 fallback (호출부에서 row.executionAmount 합 누적).
 */
export function sumExecutionGrouped(
  rows: ReadonlyArray<{ supplyValue: number; media: string; appliedFeeDecimal: number }>,
  naverLabel: string,
): number {
  const groups = new Map<string, { supplySum: number; isNaver: boolean; fee: number }>()
  for (const r of rows) {
    const k = `${r.media}|${r.appliedFeeDecimal.toFixed(6)}`
    const g = groups.get(k) ?? { supplySum: 0, isNaver: r.media === naverLabel, fee: r.appliedFeeDecimal }
    g.supplySum += r.supplyValue
    groups.set(k, g)
  }
  let total = 0
  for (const g of groups.values()) {
    const net = g.isNaver ? g.supplySum / 1.1 : g.supplySum
    total += g.fee >= 1 ? roundWon(net) : roundWon(net / (1 - g.fee))
  }
  return total
}

// ── DMP 정산 집계 ────────────────────────────────────────────
export interface DmpSettlementRow {
  dmpType: DmpType
  totalExecution: number  // 집행 금액 합계
  totalNet: number        // 순 금액 합계
  feeAmount: number       // 정산 수수료 = totalNet × feeRate
  feeRate: number         // 수수료율 (%)
  rowCount: number
}

export interface DmpSettlement {
  rows: DmpSettlementRow[]
  totalExecution: number
  totalNet: number
  totalFee: number
  verificationStatus: 'valid' | 'warning'
  diffPercentage: number  // 집행 합계 vs 예산 차이 (%)
}

/**
 * RawRow 배열에서 DMP별 정산 집계
 */
export function calcDmpSettlement(
  rows: Array<{ dmpType: DmpType; executionAmount: number; netAmount: number }>,
  budget?: number,
): DmpSettlement {
  const map = new Map<DmpType, { execution: number; net: number; count: number }>()

  for (const row of rows) {
    const cur = map.get(row.dmpType) ?? { execution: 0, net: 0, count: 0 }
    cur.execution += row.executionAmount
    cur.net += row.netAmount
    cur.count += 1
    map.set(row.dmpType, cur)
  }

  const settlementRows: DmpSettlementRow[] = []
  let totalExecution = 0
  let totalNet = 0
  let totalFee = 0

  for (const [dmpType, { execution, net, count }] of map.entries()) {
    const feeRate = DMP_FEE_RATES_PERCENT[dmpType] ?? 0
    const feeDecimal = DMP_FEE_RATES_DECIMAL[dmpType] ?? 0
    const feeAmount = roundWon(net * feeDecimal)
    settlementRows.push({ dmpType, totalExecution: execution, totalNet: net, feeAmount, feeRate, rowCount: count })
    totalExecution += execution
    totalNet += net
    totalFee += feeAmount
  }

  // 예산 차이 검증 (RAW_APP: 1% 초과 시 warning)
  let diffPercentage = 0
  let verificationStatus: 'valid' | 'warning' = 'valid'
  if (budget && budget > 0) {
    diffPercentage = Math.abs(totalExecution - budget) / budget * 100
    if (diffPercentage >= 1) verificationStatus = 'warning'
  }

  // DMP 타입 순서 정렬
  const DMP_ORDER: DmpType[] = ['SKP', 'KB', 'LOTTE', 'TG360', 'BC', 'SH', 'WIFI', 'HyperLocal', 'MEDIA_TARGETING', 'DIRECT']
  settlementRows.sort((a, b) => DMP_ORDER.indexOf(a.dmpType) - DMP_ORDER.indexOf(b.dmpType))

  return { rows: settlementRows, totalExecution, totalNet, totalFee, verificationStatus, diffPercentage }
}

// ── 퍼포먼스 지표 계산 ───────────────────────────────────────
export function calcCtr(clicks: number, impressions: number): number {
  if (impressions <= 0) return 0
  return Math.round((clicks / impressions) * 10000) / 100  // % 2자리
}

export function calcCpc(cost: number, clicks: number): number {
  if (clicks <= 0) return 0
  return Math.round(cost / clicks)
}
