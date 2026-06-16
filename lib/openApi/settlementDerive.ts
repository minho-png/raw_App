/**
 * Open API 매체비(cost) → 정산성 값 파생 (서버 전용).
 *
 * 사용자 결정 (2026-06-16, "파생 계산 포함"): Open API Phase 1 이 agency_fee/
 * data_fee/revenue 를 안 주므로 매체비×요율로 파생한다. 공식은
 * lib/calculationService.ts(deriveSettlementFromCost) 단일 소스 — 본 모듈은 그것을
 * 호출해 어댑터(legacyAdapter)에 넘길 SettlementValues 를 만든다.
 *
 * 어댑터(legacyAdapter)는 strip-only 단위 테스트가 import 하므로 런타임 relative
 * value import(calculationService)를 둘 수 없다. 그래서 calculationService 의존 계산은
 * 본 서버 전용 모듈(라우트만 import, 테스트 비대상)로 분리한다.
 *
 * ⚠️ 파생값은 추정치 — 실제 Motiv 청구액과 다를 수 있다. 정확 정산은 Phase 2
 *    `/settlements` 도입 후 raw 값으로 대체. 상세: docs/OPEN_API_ADVERTISER_AGENCY_COST_MAPPING.md
 */

import {
  detectDmpType,
  DMP_FEE_RATES_DECIMAL,
  deriveSettlementFromCost,
} from '../calculationService'
import type { InsightsMetrics } from './types'
import type { SettlementValues } from './legacyAdapter'

export interface DeriveConfig {
  /** 대행 요율 (소수, 예: 0.15). */
  agencyFeeRate?: number
}

const ZERO: SettlementValues = { revenue: 0, agency_fee: 0, data_fee: 0 }

/**
 * 환경변수 기반 기본 대행 요율 (opt-in). `OPEN_API_DEFAULT_AGENCY_FEE_RATE` 가
 * 설정되면 그 요율로 agency_fee 파생. 미설정 시 undefined → 대행료 0.
 * DMP data_fee 는 광고그룹 감지로 항상 자동 파생되므로 본 설정과 무관.
 * 캠페인별 정확 요율은 motiv_assignments.customAgencyFeeRate 로 소비부에서 override.
 */
export function defaultDeriveConfig(): DeriveConfig | undefined {
  const raw = process.env.OPEN_API_DEFAULT_AGENCY_FEE_RATE
  if (!raw) return undefined
  const rate = Number(raw)
  if (!Number.isFinite(rate) || rate <= 0) return undefined
  return { agencyFeeRate: rate }
}

/** metrics + (대행요율, DMP요율) → SettlementValues. 요율 전무 시 0. */
export function settlementFromMetrics(
  m: InsightsMetrics | undefined,
  cfg?: DeriveConfig,
  dmpFeeDecimal = 0,
): SettlementValues {
  const agencyFeeRate = cfg?.agencyFeeRate ?? 0
  if (agencyFeeRate === 0 && dmpFeeDecimal === 0) return ZERO
  const d = deriveSettlementFromCost(Number(m?.cost ?? 0), { agencyFeeRate, dmpFeeDecimal })
  return { revenue: d.revenue, agency_fee: d.agencyFeeTotal, data_fee: d.dataFee }
}

/**
 * 광고그룹: 이름에서 DMP 자동 감지 → targetingProductId(분류 키) + data_fee 파생.
 * DMP-fee 정산 페이지가 targeting_product_id + data_fee 를 직접 사용.
 */
export function adGroupSettlement(
  adGroupName: string | undefined,
  m: InsightsMetrics | undefined,
  cfg?: DeriveConfig,
): { targetingProductId: string; settlement: SettlementValues } {
  const dmpType = detectDmpType(adGroupName ?? '')
  const dmpFeeDecimal = DMP_FEE_RATES_DECIMAL[dmpType] ?? 0
  return { targetingProductId: dmpType, settlement: settlementFromMetrics(m, cfg, dmpFeeDecimal) }
}
