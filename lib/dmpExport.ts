/**
 * dmpExport.ts
 * DMP별 정산 내역서 Excel 내보내기
 * - 각 DMP사의 실제 정산서 형식에 맞춰 생성
 * - xlsx 라이브러리 사용 (SheetJS)
 */

import * as XLSX from 'xlsx'
import type { RawRow, DmpType } from './rawDataParser'
import { DMP_FEE_RATES_DECIMAL } from './calculationService'

// ── 매체명 정규화 (export용) ───────────────────────────────────
function normalizeMedia(media: string): string {
  const m = media.toLowerCase()
  if (m.includes('naver') || m.includes('네이버') || m.includes('gfa')) return '네이버'
  if (m.includes('kakao') || m.includes('카카오')) return '카카오'
  if (m.includes('google') || m.includes('구글')) return '구글'
  if (m.includes('meta') || m.includes('메타')) return '메타'
  return media
}

// ── 기간 포맷 (YYYY-MM-DD → YY/MM/DD) ───────────────────────
function toShortDate(iso: string): string {
  return iso.slice(2).replace(/-/g, '/')
}

export function buildPeriodLabel(dateFrom: string, dateTo: string): string {
  if (!dateFrom && !dateTo) return ''
  const f = dateFrom ? toShortDate(dateFrom) : '?'
  const t = dateTo   ? toShortDate(dateTo)   : '?'
  return `${f}~${t}`
}

// ── 연월 추출 ────────────────────────────────────────────────
function getYearMonthLabel(rows: RawRow[]): string {
  const dates = rows.map(r => r.date).filter(Boolean).sort()
  if (!dates.length) {
    const now = new Date()
    return `${now.getFullYear()}년 ${now.getMonth() + 1}월`
  }
  const d = new Date(dates[0])
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`
}

function getMonthLabel(rows: RawRow[]): string {
  const dates = rows.map(r => r.date).filter(Boolean).sort()
  if (!dates.length) return `${new Date().getMonth() + 1}월`
  return `${new Date(dates[0]).getMonth() + 1}월`
}

// ── 집계: DMP타입별 (매체, 캠페인명) 기준 합산 ─────────────────
interface AggRow {
  media: string
  campaignName: string
  netAmount: number      // 집행금액 VAT 별도
  impressions: number
  clicks: number
}

export function aggregateDmpRows(rows: RawRow[], dmpType: DmpType): AggRow[] {
  const map = new Map<string, AggRow>()
  for (const row of rows) {
    if (row.dmpType !== dmpType) continue
    const key = `${row.media}⌁${row.campaignName}`
    const cur = map.get(key) ?? {
      media: normalizeMedia(row.media),
      campaignName: row.campaignName,
      netAmount: 0,
      impressions: 0,
      clicks: 0,
    }
    cur.netAmount    += row.netAmount || row.netCost || 0
    cur.impressions  += row.impressions || 0
    cur.clicks       += row.clicks || 0
    map.set(key, cur)
  }
  return Array.from(map.values())
}

// ── xlsx 다운로드 트리거 ──────────────────────────────────────
function downloadWorkbook(wb: XLSX.WorkBook, filename: string) {
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([buf], { type: 'application/octet-stream' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── 공통: 컬럼 너비 자동 설정 ────────────────────────────────
function autoColWidths(ws: XLSX.WorkSheet, data: (string | number)[][]): void {
  const colWidths: number[] = []
  for (const row of data) {
    row.forEach((cell, ci) => {
      const len = String(cell ?? '').length
      if (!colWidths[ci] || colWidths[ci] < len) colWidths[ci] = len
    })
  }
  ws['!cols'] = colWidths.map(w => ({ wch: Math.max(w + 2, 12) }))
}

// ────────────────────────────────────────────────────────────────────
// TG360 정산서
// 형식: 광고 플랫폼 | 광고주 및 캠페인명 | 캠페인 기간 | 청구월 |
//       광고 소진금액(vat미포함) | 데이터 사용료(vat미포함) | 증빙방법
// ────────────────────────────────────────────────────────────────────
export function exportTG360(allRows: RawRow[], periodLabel: string, companyName = '모티브인텔리전스') {
  const rows = aggregateDmpRows(allRows, 'TG360')
  if (!rows.length) return

  const feeRate  = DMP_FEE_RATES_DECIMAL.TG360  // 0.10
  const dmpRows  = allRows.filter(r => r.dmpType === 'TG360')
  const month    = getMonthLabel(dmpRows)

  const data: (string | number)[][] = [
    [],
    [`TG360 DMP 데이터 공급 내역서`, '', '', '', '', '', ''],
    [],
    ['■캠페인 집행 정보', '', '', '', '', '', ''],
    ['광고 플랫폼', '광고주 및 캠페인명', '캠페인 기간', '청구월',
     '광고 소진금액(vat미포함)', '데이터 사용료(vat미포함)', '증빙방법'],
  ]

  let totalSpend = 0
  let totalFee   = 0
  for (const r of rows) {
    const spend = Math.round(r.netAmount)
    const fee   = Math.round(r.netAmount * feeRate * 100) / 100
    data.push([r.media, r.campaignName, periodLabel, month, spend, fee, '리포트 스크린샷 (별첨)'])
    totalSpend += spend
    totalFee   += fee
  }
  data.push(['합계', '', '', '', totalSpend, Math.round(totalFee * 100) / 100, ''])

  const ws = XLSX.utils.aoa_to_sheet(data)
  autoColWidths(ws, data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'TG360')
  downloadWorkbook(wb, `(${companyName}) TG360 DMP 정산 내역서.xlsx`)
}

// ────────────────────────────────────────────────────────────────────
// 롯데 딥애드 정산서
// 형식: 집행 매체 | 캠페인 명 | 광고료(VAT별도) | 정산금액 | 증빙
// ────────────────────────────────────────────────────────────────────
export function exportLOTTE(allRows: RawRow[], companyName = '모티브인텔리전스') {
  const rows = aggregateDmpRows(allRows, 'LOTTE')
  if (!rows.length) return

  const feeRate   = DMP_FEE_RATES_DECIMAL.LOTTE  // 0.09
  const dmpRows   = allRows.filter(r => r.dmpType === 'LOTTE')
  const ymLabel   = getYearMonthLabel(dmpRows)

  const data: (string | number)[][] = [
    [],
    [`${companyName}_${ymLabel}`, '', '', '', '', '', '', ''],
    ['집행 매체', '캠페인 명', '광고료(VAT별도)', '정산금액', '증빙', '', '', ''],
  ]

  for (const r of rows) {
    const adFee     = Math.round(r.netAmount)
    const settlement = Math.round(r.netAmount * feeRate * 100000) / 100000
    data.push([r.media, r.campaignName, adFee, settlement, 'O', '', '', ''])
  }

  const ws = XLSX.utils.aoa_to_sheet(data)
  autoColWidths(ws, data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '정산')
  downloadWorkbook(wb, `(${companyName}) 롯데 딥애드 DMP 정산 내역서.xlsx`)
}

// ────────────────────────────────────────────────────────────────────
// KB DMP 정산서
// 형식: 집행 매체 | 광고주 | 기간 | 집행금액(vat별도) | 수수료(10%)
// ────────────────────────────────────────────────────────────────────
export function exportKB(allRows: RawRow[], periodLabel: string, companyName = '모티브인텔리전스') {
  const rows = aggregateDmpRows(allRows, 'KB')
  if (!rows.length) return

  const feeRate = DMP_FEE_RATES_DECIMAL.KB  // 0.10

  const data: (string | number)[][] = [
    ['집행 매체', '광고주', '기간', '집행금액 (vat별도)', '수수료 (10%)'],
  ]

  let totalExec = 0
  let totalFee  = 0
  for (const r of rows) {
    const exec = Math.round(r.netAmount)
    const fee  = Math.round(r.netAmount * feeRate * 100) / 100
    data.push([r.media, r.campaignName, periodLabel, exec, fee])
    totalExec += exec
    totalFee  += fee
  }
  data.push(['합계', '', '', totalExec, Math.round(totalFee * 100) / 100])

  const ws = XLSX.utils.aoa_to_sheet(data)
  autoColWidths(ws, data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  downloadWorkbook(wb, `(${companyName}) 케이비 DMP 정산 내역서.xlsx`)
}

// ────────────────────────────────────────────────────────────────────
// SK플래닛 정산서
// 형식: (CrossTarget Plus) | 캠페인 명 | 광고주 | 집행 매체 |
//       기간 | Agent(담당자) | 집행금액(vat별도) | SKP 수수료(10%) | 증빙
// ────────────────────────────────────────────────────────────────────
export function exportSKP(allRows: RawRow[], periodLabel: string, companyName = '모티브-크로스타겟 플러스') {
  const rows = aggregateDmpRows(allRows, 'SKP')
  if (!rows.length) return

  const feeRate = DMP_FEE_RATES_DECIMAL.SKP  // 0.10

  const data: (string | number)[][] = [
    ['', '캠페인 명', '광고주', '집행 매체', '기간', 'Agent (담당자)',
     '집행금액 (vat별도)', 'SKP 수수료 (10%)', '증빙'],
  ]

  let totalExec = 0
  let totalFee  = 0
  for (let i = 0; i < rows.length; i++) {
    const r    = rows[i]
    const exec = Math.round(r.netAmount)
    const fee  = Math.round(r.netAmount * feeRate * 100) / 100
    data.push([
      i === 0 ? 'CrossTarget\r\nPlus' : '',
      r.campaignName,
      r.campaignName,   // 광고주명 = 캠페인명 (별도 데이터 없음)
      r.media,
      periodLabel,
      '',               // Agent 미상
      exec,
      fee,
      'ㅇ',
    ])
    totalExec += exec
    totalFee  += fee
  }
  data.push(['합계', '', '', '', '', '', totalExec, Math.round(totalFee * 100) / 100, ''])

  const ws = XLSX.utils.aoa_to_sheet(data)
  autoColWidths(ws, data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '정산')
  downloadWorkbook(wb, `(${companyName}) SK플래닛 DMP 정산 내역서.xlsx`)
}

// ────────────────────────────────────────────────────────────────────
// 로플랫(WIFI) 정산서
// 형식: 매체 | 광고주 | 노출수 | 클릭수 | 전환 목적 | 광고료 |
//       정산 금액(10%) | 최종정산금액
// WIFI = 10% (로플랫 계약)
// HyperLocal (0% 수수료)은 외부 정산 형식이 없으므로 export 미지원
// ────────────────────────────────────────────────────────────────────
export function exportRoplat(
  allRows: RawRow[],
  companyName = '모티브인텔리전스',
) {
  const rows = aggregateDmpRows(allRows, 'WIFI')
  if (!rows.length) return

  // WIFI 실제 계약 수수료: 10%
  const feeRate = DMP_FEE_RATES_DECIMAL.WIFI
  const dmpRows = allRows.filter(r => r.dmpType === 'WIFI')
  const ymLabel = getYearMonthLabel(dmpRows)

  const data: (string | number)[][] = [
    [ymLabel, '', '', '', '', '', '', ''],
    ['매체', '광고주', '노출수', '클릭수',
     '전환 목적(도달, 웹페이지 방문, 구매 등)', '광고료', '정산 금액', '최종정산금액'],
  ]

  let totalImp  = 0
  let totalClk  = 0
  let totalFee2  = 0
  let totalAdFee = 0
  for (const r of rows) {
    const adFee     = Math.round(r.netAmount)
    const settlement = Math.round(r.netAmount * feeRate * 100000) / 100000
    data.push([r.media, r.campaignName, r.impressions, r.clicks, '', adFee, settlement, ''])
    totalImp   += r.impressions
    totalClk   += r.clicks
    totalAdFee += adFee
    totalFee2  += settlement
  }
  const grandTotal = Math.round(totalFee2 * 100000) / 100000
  data.push(['Total', '', totalImp, totalClk, '', totalAdFee, totalFee2, grandTotal])

  const ws = XLSX.utils.aoa_to_sheet(data)
  autoColWidths(ws, data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '정산서')
  downloadWorkbook(wb, `(${companyName}) 로플랫(WIFI) 정산 내역서.xlsx`)
}

// ── DMP 타입별 내보내기 디스패처 ─────────────────────────────
export function exportByDmpType(
  dmpType: DmpType,
  allRows: RawRow[],
  periodLabel: string,
  companyName?: string,
) {
  switch (dmpType) {
    case 'TG360':      return exportTG360(allRows, periodLabel, companyName)
    case 'LOTTE':      return exportLOTTE(allRows, companyName)
    case 'KB':         return exportKB(allRows, periodLabel, companyName)
    case 'SKP':        return exportSKP(allRows, periodLabel, companyName)
    case 'WIFI':       return exportRoplat(allRows, companyName)
    // HyperLocal은 0% 수수료로 외부 정산 형식이 없으므로 export 미지원
    default:
      console.warn('정산서 형식 미지원 DMP:', dmpType)
  }
}

// ── 현재 시스템에서 지원하는 DMP 정산서 포맷 목록 ────────────
export const SUPPORTED_EXPORT_DMPS: { dmpType: DmpType; label: string; feeLabel: string }[] = [
  { dmpType: 'SKP',        label: 'SK플래닛',      feeLabel: '10%' },
  { dmpType: 'KB',         label: 'KB',             feeLabel: '10%' },
  { dmpType: 'LOTTE',      label: '롯데 딥애드',    feeLabel: '9%'  },
  { dmpType: 'TG360',      label: 'TG360',          feeLabel: '10%' },
  { dmpType: 'WIFI',       label: '로플랫(WIFI)',   feeLabel: '10%' },
]
