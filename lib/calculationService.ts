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
    ? Math.round(supplyValue / 1.1)
    : supplyValue

  const executionAmount = feeDecimal >= 1
    ? netAmount
    : Math.round(netAmount / (1 - feeDecimal))

  return { supplyValue, netAmount, executionAmount }
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
    const feeAmount = Math.round(net * feeDecimal)
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
