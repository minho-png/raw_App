/**
 * DMP별 수수료율 (넷가 기준)
 * fee = net_amount × DMP_FEE_RATES[dmp_type]
 *
 * 수수료율 확정 기준: 광고주/운영팀 직접 확인 (2026-03-24)
 * "DMP 기존 명시한 항목 제외 수수료 없음" — PM 정훈 확인
 */
export const DMP_FEE_RATES: Record<string, number> = {
  SKP:    0.10, // 수수료 있음 (10%)
  KB:     0.10, // 수수료 있음 (10%)
  LOTTE:  0.08, // 수수료 있음 (8%)
  TG360:  0.10, // 수수료 있음 (10%)
  BC:     0,    // 수수료 없음 — 계약 확정값, 변경 금지
  SH:     0,    // 수수료 없음 — 계약 확정값, 변경 금지
  WIFI:   0.10, // 수수료 있음 (10%)
  DIRECT: 0,    // 수수료 없음
  'N/A':  0,    // 수수료 없음
};

/** 요율을 % 문자열로 표현 (예: 0.10 → '10%') */
export function formatFeeRate(dmpType: string): string {
  const rate = DMP_FEE_RATES[dmpType] ?? 0;
  return rate === 0 ? '—' : `${(rate * 100).toFixed(0)}%`;
}

/** net_amount 기준 DMP 수수료 계산 */
export function calcDmpFee(dmpType: string, netAmount: number): number {
  return Math.round(netAmount * (DMP_FEE_RATES[dmpType] ?? 0));
}
