// Motiv (CrossTarget DSP) 외부 콘솔 링크 헬퍼.
// 매체 사이트의 캠페인/광고그룹 페이지로 직접 이동할 때 사용.
//
// 사용자 제공 샘플:
//   https://manage2.crosstarget.co.kr/dsp/ads/campaign/20131/adgroup
//     ?filter[tz]=+09:00&filter[start_dt]=2026-05-15&filter[end_dt]=2026-05-15

const BASE = 'https://manage2.crosstarget.co.kr'

export interface MotivConsoleLinkArgs {
  campaignId: number | string
  startDate?: string   // YYYY-MM-DD
  endDate?: string
}

/**
 * 캠페인 → 광고그룹 페이지 URL.
 * date range 가 주어지면 filter 쿼리에 포함.
 */
export function motivCampaignAdGroupUrl({
  campaignId, startDate, endDate,
}: MotivConsoleLinkArgs): string {
  const path = `/dsp/ads/campaign/${campaignId}/adgroup`
  const qs = new URLSearchParams()
  qs.set('filter[tz]', '+09:00')
  if (startDate) qs.set('filter[start_dt]', startDate)
  if (endDate)   qs.set('filter[end_dt]', endDate)
  return `${BASE}${path}?${qs.toString()}`
}
