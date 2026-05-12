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
  cat: 'ctr' | 'spend' | 'profit' | 'vtr' | 'deadline'
  text: string
}

export const ALERT_CAT_LABEL: Record<AlertMsg['cat'], string> = {
  ctr: 'CTR',
  spend: '소진률',
  profit: '수익률',
  vtr: 'VTR',
  deadline: '기간 임박',
}
