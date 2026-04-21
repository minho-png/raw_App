import type { MediaType } from './reportTypes'
import { MEDIA_CONFIG } from './reportTypes'
import type { Campaign } from './campaignTypes'

// RAW_APP에서 지원하는 DMP 타입 (BC, SH 포함)
export type DmpType = 'SKP' | 'KB' | 'LOTTE' | 'TG360' | 'BC' | 'SH' | 'WIFI' | 'HyperLocal' | 'MEDIA_TARGETING' | 'DIRECT'

export interface RawRow {
  date: string        // YYYY-MM-DD
  dayOfWeek: string   // 월화수목금토일
  media: string       // 매체 표시명
  campaignName: string   // CSV 캠페인명 (원본)
  accountName: string    // CSV 계정명 (원본)
  creativeName: string
  dmpName: string     // 광고그룹명 원본
  dmpType: DmpType    // 자동 감지된 DMP 타입
  impressions: number
  clicks: number
  views: number | null  // Google=TrueView조회수, META=결과, 그외 null
  grossCost: number     // 집행 금액 (마크업 역산, execution_amount)
  netCost: number       // 집행 금액(NET) = VAT 제외 공급가액
  executionAmount: number  // 실제 집행 금액 (= grossCost)
  netAmount: number        // 순 금액 (Naver: 공급가/1.1, 기타: 공급가)
  supplyValue: number      // 파일 원본 비용 (공급가액)
  /** 계정명에서 추출한 광고주 후보명 (Google 제외, null = 매칭 불가) */
  advertiserHint: string | null
  /** csvNames 역매칭으로 확정된 캠페인 ID (없으면 undefined = 미매칭) */
  matchedCampaignId?: string
}

/** 캠페인에 해당 매체가 설정돼 있는지 확인 */
export function hasCampaignMedia(media: MediaType, campaign: Campaign | null): boolean {
  if (!campaign) return false
  const label = MEDIA_CONFIG[media].label
  return campaign.mediaBudgets.some(mb => mb.media === label)
}
