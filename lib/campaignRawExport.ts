// 캠페인별 raw 데이터 export (TSV 복사 / xlsx 다운로드).
//
// 헤더 규격 — 사용자 첨부 RAW 엑셀(3건) 분석 결과 공통 컬럼:
//   날짜 / 요일 / 매체 / 캠페인 / 소재명 / 지면 / 노출 / 클릭 / 조회 / 집행 금액 / 집행 금액(NET)
//
// - 집행 금액      = RawRow.executionAmount (대시보드 셋팅금액 기준, 마크업 적용 전)
// - 집행 금액(NET) = RawRow.netAmount       (VAT/마크업 후 NET)
// - 조회           = RawRow.views (Google/Meta 만 채워짐, 그 외 빈값)

import type { RawRow } from "./rawDataParser"

export const RAW_EXPORT_HEADERS = [
  '날짜', '요일', '매체', '캠페인', '소재명', '지면',
  '노출', '클릭', '조회', '집행 금액', '집행 금액(NET)',
] as const

export function rowsToExportMatrix(rows: RawRow[]): (string | number)[][] {
  return rows.map(r => [
    r.date ?? '',
    r.dayOfWeek ?? '',
    r.media ?? '',
    r.campaignName ?? '',
    r.creativeName ?? '',
    r.dmpName ?? '',
    r.impressions ?? 0,
    r.clicks ?? 0,
    r.views ?? '',
    Math.round(r.executionAmount ?? 0),
    Math.round(r.netAmount ?? 0),
  ])
}

export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 60) || 'campaign'
}

/** TSV 클립보드 복사 — 엑셀에 직접 paste 가능 */
export async function copyRawToClipboard(rows: RawRow[]): Promise<boolean> {
  const matrix = rowsToExportMatrix(rows)
  const text = [
    RAW_EXPORT_HEADERS.join('\t'),
    ...matrix.map(r => r.join('\t')),
  ].join('\n')
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** xlsx 동적 import 후 .xlsx 파일 다운로드 */
export async function downloadRawXlsx(campaignName: string, rows: RawRow[]): Promise<void> {
  const XLSX = await import('xlsx')
  const aoa: (string | number)[][] = [[...RAW_EXPORT_HEADERS], ...rowsToExportMatrix(rows)]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  // 컬럼 너비 hint
  ws['!cols'] = [
    { wch: 12 }, { wch: 6 }, { wch: 12 }, { wch: 28 }, { wch: 24 }, { wch: 16 },
    { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 14 }, { wch: 14 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'RAW')
  XLSX.writeFile(wb, `${safeFileName(campaignName)}_RAW.xlsx`)
}
