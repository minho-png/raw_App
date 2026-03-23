export type MediaType = 'google' | 'naver' | 'kakao' | 'meta'

export interface MediaSummary {
  impressions: number
  clicks: number
  ctr: number
  cost: number
  cpc: number
}

export interface WeeklyRow {
  week: string
  impressions: number
  clicks: number
  ctr: number
  cost: number
  cpc: number
}

export interface DemographicRow {
  age: string
  male_ctr: number
  female_ctr: number
  male_clicks: number
  female_clicks: number
}

export interface CreativeRow {
  name: string
  impressions: number
  clicks: number
  ctr: number
  cost: number
}

export interface MediaData {
  media: MediaType
  fileName: string
  summary: MediaSummary
  weekly: WeeklyRow[]
  demographic: DemographicRow[]
  creatives: CreativeRow[]
}

export type ReportSection =
  | 'summary_kpi'
  | 'weekly_trend'
  | 'media_comparison'
  | 'demographic'
  | 'creative'
  | 'insights'

export const REPORT_SECTIONS: { id: ReportSection; label: string; description: string }[] = [
  { id: 'summary_kpi', label: '전체 요약 KPI', description: '노출수, 클릭수, CTR, 소진금액 합산' },
  { id: 'weekly_trend', label: '주차별 성과 추이', description: 'CPC·CTR 주간 변화 차트' },
  { id: 'media_comparison', label: '매체별 비중 비교', description: '노출·클릭 매체별 점유율' },
  { id: 'demographic', label: '성별/연령별 성과', description: '연령대·성별 CTR 분석' },
  { id: 'creative', label: '소재별 성과', description: '소재별 노출·클릭·CTR 비교' },
  { id: 'insights', label: '종합 인사이트', description: '자동 요약 및 다음 단계 제안' },
]

export const MEDIA_CONFIG: Record<MediaType, { label: string; color: string; bgColor: string; borderColor: string }> = {
  google: { label: 'Google', color: '#4285F4', bgColor: '#EFF6FF', borderColor: '#BFDBFE' },
  naver: { label: '네이버 GFA', color: '#03C75A', bgColor: '#F0FDF4', borderColor: '#BBF7D0' },
  kakao: { label: '카카오모먼트', color: '#FAE100', bgColor: '#FEFCE8', borderColor: '#FEF08A' },
  meta: { label: 'META', color: '#0866FF', bgColor: '#EFF6FF', borderColor: '#BFDBFE' },
}
