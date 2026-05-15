// 분석 페이지(CT / CTV) 공통 타입.

export interface AnalysisSettings {
  ctrDiff: number
  spendRateDiff: number
  profitRateDiff: number
  displayProfitMin: number
  videoProfitMin: number
  videoVtrMin: number
  ctvVtrMin: number
}

export const DEFAULT_ANALYSIS_SETTINGS: AnalysisSettings = {
  ctrDiff: 0.5,
  spendRateDiff: 10,
  profitRateDiff: 5,
  displayProfitMin: 15,
  videoProfitMin: 15,
  videoVtrMin: 60,
  ctvVtrMin: 85,
}

export interface AlertMsg {
  kind: 'critical' | 'warn' | 'up'
  cat: 'ctr' | 'spend' | 'profit' | 'vtr' | 'deadline' | 'no-data'
  text: string
}

/**
 * 경고 + 캠페인 메타 묶음 — 첫 화면 경고 테이블 / 외부 링크용.
 * 분석 페이지에서 buildAlerts 를 돌릴 때 함께 만들어 page.tsx 에 전달.
 */
export interface AlertWithCampaign {
  motivId: number
  campaignName: string
  agencyName: string
  advertiserName: string
  product: 'CT' | 'CTV' | string
  uiType: 'display' | 'video' | 'partners' | 'ctv'
  startDate: string
  endDate: string
  alerts: AlertMsg[]
}

export const ALERT_CAT_LABEL: Record<AlertMsg['cat'], string> = {
  ctr: 'CTR',
  spend: '소진률',
  profit: '수익률',
  vtr: 'VTR',
  deadline: '기간 임박',
  'no-data': '데이터 없음',
}
