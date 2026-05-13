// MOTIV 캠페인 운영 상태(집행 중) 판정 + 기간 검사 공통 헬퍼.
//
// 이전엔 useZeroSpendMotivCampaigns.ts 내부에 todayInRange 가 closure 로 정의돼
// 다른 페이지(메인 도메인 카드 등)에서 재사용 불가능했음. 본 파일로 추출.

import type { MotivCampaign } from './types'

/**
 * 오늘 (또는 now 시점) 이 캠페인 운영 기간 안에 포함되는지.
 *   - start_date 와 end_date 모두 없으면 false
 *   - end_date 는 그 날의 23:59:59 까지 포함
 */
export function todayInRange(
  start: string | null | undefined,
  end:   string | null | undefined,
  now: Date,
): boolean {
  if (!start && !end) return false
  const cs = start ? new Date(start) : new Date(0)
  const ce = end   ? new Date(end)   : new Date(9e13)
  ce.setHours(23, 59, 59, 999)
  return now >= cs && now <= ce
}

/**
 * MOTIV 캠페인의 "집행 중" 판정.
 *   status === 'Y' AND 오늘이 운영 기간 안에 포함.
 *
 * 단순 status === 'Y' 만으로는 종료된(end_date 지난) 캠페인도 포함될 수 있어
 * 메인 대시보드처럼 "지금 운영 중인 것" 만 보여줘야 하는 경우 본 헬퍼 사용.
 */
export function isActiveMotivCampaign(
  c: MotivCampaign,
  now: Date = new Date(),
): boolean {
  if (c.status !== 'Y') return false
  return todayInRange(c.start_date, c.end_date, now)
}

/**
 * MOTIV 캠페인의 "현재 집행률" — 누적 소진 / 총 예산.
 *   stats.cost 는 month 미지정 시 누적값일 수 있어 의미가 모호함.
 *   대신 campaign.total_spent / total_budget 사용 (서버측 집계 필드).
 *   total_budget 이 0 이거나 없으면 0.
 */
export function motivLifeSpendRate(c: MotivCampaign): number {
  const budget = c.total_budget ?? 0
  const spent  = c.total_spent ?? 0
  if (budget <= 0) return 0
  return Math.round((spent / budget) * 1000) / 10  // 소수 1자리
}
