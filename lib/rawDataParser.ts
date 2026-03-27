import type { MediaType } from './reportTypes'
import { MEDIA_CONFIG } from './reportTypes'
import type { Campaign } from './campaignTypes'

export interface RawRow {
  date: string        // YYYY-MM-DD
  dayOfWeek: string   // 월화수목금토일
  media: string       // 매체 표시명
  creativeName: string
  dmpName: string
  impressions: number
  clicks: number
  views: number | null  // Google=TrueView조회수, META=결과, 그외 null
  grossCost: number   // 집행 금액 (마크업 역산)
  netCost: number     // 집행 금액(NET) = 파일 원본 비용
}

/** 캠페인에 해당 매체가 설정돼 있는지 확인 */
export function hasCampaignMedia(media: MediaType, campaign: Campaign | null): boolean {
  if (!campaign) return false
  const label = MEDIA_CONFIG[media].label
  return campaign.mediaBudgets.some(mb => mb.media === label)
}
