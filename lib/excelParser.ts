import { read as xlsxRead, utils as xlsxUtils } from 'xlsx'
import type { MediaData, MediaType, MediaSummary, WeeklyRow, DemographicRow, CreativeRow } from './reportTypes'

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[\s_\-()（）]/g, '')
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
    if (val !== undefined && val !== null && val !== '') return String(val).trim()
  }
  return ''
}

// 합계/소계 행 감지 — 이런 행은 집계 시 제외
function isSummaryRow(row: Record<string, unknown>): boolean {
  const vals = Object.values(row).map(v => String(v ?? '').trim().toLowerCase())
  const keys = Object.keys(row).map(k => k.toLowerCase())
  const summaryKeywords = ['합계', '총계', '소계', '전체합계', 'total', 'subtotal', 'grand total', '총합']
  return (
    vals.some(v => summaryKeywords.some(kw => v === kw || v.startsWith(kw))) ||
    keys.some(k => summaryKeywords.some(kw => k.includes(kw)))
  )
}

// 실질적 데이터가 없는 빈 행 감지
function isEmptyRow(row: Record<string, unknown>): boolean {
  return Object.values(row).every(v => v === '' || v === null || v === undefined)
}

export async function parseExcelFile(file: File, media: MediaType): Promise<MediaData> {
  const buffer = await file.arrayBuffer()
  const workbook = xlsxRead(buffer, { type: 'array' })

  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const allRows: Record<string, unknown>[] = xlsxUtils.sheet_to_json(sheet, { defval: '' })

  // 합계행·빈행 제외한 순수 데이터 행만 사용
  const rows = allRows.filter(row => !isSummaryRow(row) && !isEmptyRow(row))

  // ── 요약 집계 ──────────────────────────────────────────────
  let totalImpressions = 0
  let totalClicks = 0
  let totalCost = 0

  for (const row of rows) {
    totalImpressions += findValue(row,
      '노출수', '노출', 'impressions', 'impr', 'impression', '도달수', '노출량'
    )
    totalClicks += findValue(row,
      '클릭수', '클릭', 'clicks', 'click', '클릭량'
    )
    totalCost += findValue(row,
      '비용', '소진금액', '금액', '집행금액', '소진', 'cost', 'spend', '지출', '청구금액'
    )
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

  // ── 주차별 데이터 ───────────────────────────────────────────
  const weeklyMap = new Map<string, { imp: number; clk: number; cost: number }>()
  for (const row of rows) {
    const dateStr = findStringValue(row,
      '날짜', '일자', 'date', '기간', '주차', 'week', '일', '기준일'
    )
    if (!dateStr) continue

    // YYYY-MM-DD → YYYY-WW 주차 단위로 그룹핑
    let weekKey = dateStr.slice(0, 10) // 기본: 날짜 문자열
    const dateObj = new Date(dateStr)
    if (!isNaN(dateObj.getTime())) {
      const jan1 = new Date(dateObj.getFullYear(), 0, 1)
      const weekNum = Math.ceil(((dateObj.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7)
      weekKey = `${dateObj.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
    }

    const existing = weeklyMap.get(weekKey) ?? { imp: 0, clk: 0, cost: 0 }
    existing.imp += findValue(row, '노출수', '노출', 'impressions', 'impr', '노출량')
    existing.clk += findValue(row, '클릭수', '클릭', 'clicks', 'click')
    existing.cost += findValue(row, '비용', '소진금액', '금액', '집행금액', 'cost', 'spend', '지출')
    weeklyMap.set(weekKey, existing)
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

  // ── 연령/성별 데이터 ─────────────────────────────────────────
  const demoMap = new Map<string, { mClk: number; fClk: number; mImp: number; fImp: number }>()
  for (const row of rows) {
    const age = findStringValue(row, '연령', '연령대', 'age', '나이대', '연령그룹')
    const gender = findStringValue(row, '성별', 'gender', '성', 'sex')
    if (!age) continue
    const existing = demoMap.get(age) ?? { mClk: 0, fClk: 0, mImp: 0, fImp: 0 }
    const clk = findValue(row, '클릭수', '클릭', 'clicks', 'click')
    const imp = findValue(row, '노출수', '노출', 'impressions', 'impr', '노출량')
    if (gender.includes('남') || gender.toLowerCase().includes('male') || gender.toUpperCase() === 'M') {
      existing.mClk += clk; existing.mImp += imp
    } else if (gender.includes('여') || gender.toLowerCase().includes('female') || gender.toUpperCase() === 'F') {
      existing.fClk += clk; existing.fImp += imp
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

  // ── 소재별 데이터 ────────────────────────────────────────────
  const creativeMap = new Map<string, { imp: number; clk: number; cost: number }>()
  for (const row of rows) {
    const name = findStringValue(row,
      '소재명', '소재', '광고명', '소재ID', 'creative', 'ad name', 'ad_name',
      '캠페인명', '광고그룹명', '광고소재'
    )
    if (!name) continue
    const existing = creativeMap.get(name) ?? { imp: 0, clk: 0, cost: 0 }
    existing.imp += findValue(row, '노출수', '노출', 'impressions', 'impr', '노출량')
    existing.clk += findValue(row, '클릭수', '클릭', 'clicks', 'click')
    existing.cost += findValue(row, '비용', '소진금액', '금액', 'cost', 'spend', '지출')
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

  return { media, fileName: file.name, summary, weekly, demographic, creatives }
}
