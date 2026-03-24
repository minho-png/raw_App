/**
 * DMP별 수수료율 (넷가 기준)
 * fee = net_amount × DMP_FEE_RATES[dmp_type]
 */
export const DMP_FEE_RATES: Record<string, number> = {
  SKP:   0.10,
  KB:    0.10,
  LOTTE: 0.08,
  TG360: 0.10,
  BC:    0,
  SH:    0,
  WIFI:  0.10,
  DIRECT: 0,
  'N/A':  0,
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
