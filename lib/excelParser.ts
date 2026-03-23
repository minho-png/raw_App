import * as XLSX from 'xlsx'
import type { MediaData, MediaType, MediaSummary, WeeklyRow, DemographicRow, CreativeRow } from './reportTypes'

// 컬럼명 정규화 (한/영 혼용 대응)
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/\s/g, '').replace(/_/g, '')
}

function findValue(row: Record<string, unknown>, ...candidates: string[]): number {
  const normalized = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [normalizeKey(k), v])
  )
  for (const c of candidates) {
    const val = normalized[normalizeKey(c)]
    if (val !== undefined && val !== null && val !== '') {
      const num = parseFloat(String(val).replace(/,/g, ''))
      if (!isNaN(num)) return num
    }
  }
  return 0
}

function findStringValue(row: Record<string, unknown>, ...candidates: string[]): string {
  const normalized = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [normalizeKey(k), v])
  )
  for (const c of candidates) {
    const val = normalized[normalizeKey(c)]
    if (val !== undefined && val !== null && val !== '') return String(val)
  }
  return ''
}

export async function parseExcelFile(file: File, media: MediaType): Promise<MediaData> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })

  // 첫 번째 시트 사용
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' })

  // 요약 집계
  let totalImpressions = 0
  let totalClicks = 0
  let totalCost = 0

  for (const row of rows) {
    totalImpressions += findValue(row, '노출수', '노출', 'impressions', 'impr', '도달수')
    totalClicks += findValue(row, '클릭수', '클릭', 'clicks', 'click')
    totalCost += findValue(row, '비용', '소진금액', '금액', 'cost', 'spend', '지출')
  }

  const totalCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0
  const totalCpc = totalClicks > 0 ? totalCost / totalClicks : 0

  const summary: MediaSummary = {
    impressions: Math.round(totalImpressions),
    clicks: Math.round(totalClicks),
    ctr: Math.round(totalCtr * 100) / 100,
    cost: Math.round(totalCost),
    cpc: Math.round(totalCpc),
  }

  // 주차별 데이터 (날짜 컬럼 있는 경우)
  const weeklyMap = new Map<string, { imp: number; clk: number; cost: number }>()
  for (const row of rows) {
    const dateStr = findStringValue(row, '날짜', '일자', 'date', '기간', '주차', 'week')
    if (!dateStr) continue
    const week = dateStr.slice(0, 7) // YYYY-MM 단위로 그룹핑 (없으면 행 자체)
    const existing = weeklyMap.get(week) ?? { imp: 0, clk: 0, cost: 0 }
    existing.imp += findValue(row, '노출수', '노출', 'impressions', 'impr')
    existing.clk += findValue(row, '클릭수', '클릭', 'clicks')
    existing.cost += findValue(row, '비용', '소진금액', '금액', 'cost', 'spend')
    weeklyMap.set(week, existing)
  }

  const weekly: WeeklyRow[] = Array.from(weeklyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, d]) => ({
      week,
      impressions: Math.round(d.imp),
      clicks: Math.round(d.clk),
      ctr: d.imp > 0 ? Math.round((d.clk / d.imp) * 10000) / 100 : 0,
      cost: Math.round(d.cost),
      cpc: d.clk > 0 ? Math.round(d.cost / d.clk) : 0,
    }))

  // 연령/성별 데이터
  const demoMap = new Map<string, { mClk: number; fClk: number; mImp: number; fImp: number }>()
  for (const row of rows) {
    const age = findStringValue(row, '연령', '연령대', 'age', '나이대')
    const gender = findStringValue(row, '성별', 'gender', '성')
    if (!age) continue
    const existing = demoMap.get(age) ?? { mClk: 0, fClk: 0, mImp: 0, fImp: 0 }
    const clk = findValue(row, '클릭수', '클릭', 'clicks')
    const imp = findValue(row, '노출수', '노출', 'impressions')
    if (gender.includes('남') || gender.toLowerCase().includes('male') || gender === 'M') {
      existing.mClk += clk
      existing.mImp += imp
    } else if (gender.includes('여') || gender.toLowerCase().includes('female') || gender === 'F') {
      existing.fClk += clk
      existing.fImp += imp
    }
    demoMap.set(age, existing)
  }

  const demographic: DemographicRow[] = Array.from(demoMap.entries()).map(([age, d]) => ({
    age,
    male_ctr: d.mImp > 0 ? Math.round((d.mClk / d.mImp) * 10000) / 100 : 0,
    female_ctr: d.fImp > 0 ? Math.round((d.fClk / d.fImp) * 10000) / 100 : 0,
    male_clicks: d.mClk,
    female_clicks: d.fClk,
  }))

  // 소재별 데이터
  const creativeMap = new Map<string, { imp: number; clk: number; cost: number }>()
  for (const row of rows) {
    const name = findStringValue(row, '소재명', '소재', '광고명', 'creative', 'ad name', 'ad_name', '캠페인')
    if (!name) continue
    const existing = creativeMap.get(name) ?? { imp: 0, clk: 0, cost: 0 }
    existing.imp += findValue(row, '노출수', '노출', 'impressions')
    existing.clk += findValue(row, '클릭수', '클릭', 'clicks')
    existing.cost += findValue(row, '비용', '소진금액', '금액', 'cost', 'spend')
    creativeMap.set(name, existing)
  }

  const creatives: CreativeRow[] = Array.from(creativeMap.entries())
    .map(([name, d]) => ({
      name,
      impressions: Math.round(d.imp),
      clicks: Math.round(d.clk),
      ctr: d.imp > 0 ? Math.round((d.clk / d.imp) * 10000) / 100 : 0,
      cost: Math.round(d.cost),
    }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 10)

  return {
    media,
    fileName: file.name,
    summary,
    weekly,
    demographic,
    creatives,
  }
}
