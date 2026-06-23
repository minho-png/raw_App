/**
 * Open API 정산 스냅샷 → Excel 다운로드 유틸.
 *
 * 사용자 결정 (2026-06-23) — 레거시 Sales/Purchase Excel 을 대체.
 * dimension 컬럼 + metric 컬럼 펼친 평면 시트. effectiveMetrics 적용 후 export.
 */

import * as XLSX from 'xlsx'
import type { SnapshotRow } from '@/lib/hooks/useOpenApiSettlementSnapshot'

const METRIC_LABEL: Record<string, string> = {
  revenue: '매출(revenue)',
  mediaCost: '매체비(mediaCost)',
  grossProfit: '매출총이익(grossProfit)',
  margin: '마진(margin)',
  dataFee: 'DMP비용(dataFee)',
  agencyFee: '대행수수료(agencyFee)',
  cost: '소진(cost)',
}

interface DimNode { type?: string; id?: string; name?: string; date?: string }

/**
 * SnapshotRow[] → 평면 record 배열 (시트용).
 * dimension 의 각 노드는 "타입_id" 와 "타입_name" 으로 펼쳐짐.
 */
export function snapshotRowsToSheet(
  rows: { _key?: string; dimension: unknown[]; metrics: Record<string, number> }[],
  effective?: (row: { dimension: unknown[]; metrics: Record<string, number> }) => Record<string, number>,
): Record<string, string | number>[] {
  return rows.map(r => {
    const out: Record<string, string | number> = {}
    for (const node of r.dimension) {
      const n = node as DimNode
      const t = n.type ?? 'dim'
      if (n.name) out[`${t}_name`] = n.name
      if (n.id) out[`${t}_id`] = n.id
      if (n.date) out[`${t}_date`] = n.date
    }
    const m = effective ? effective(r) : r.metrics
    for (const [k, v] of Object.entries(m)) {
      out[METRIC_LABEL[k] ?? k] = Math.round(v)
    }
    return out
  })
}

export function downloadSnapshotExcel(
  rows: { _key?: string; dimension: unknown[]; metrics: Record<string, number> }[],
  filename: string,
  effective?: (row: { dimension: unknown[]; metrics: Record<string, number> }) => Record<string, number>,
): void {
  const sheet = snapshotRowsToSheet(rows, effective)
  if (sheet.length === 0) {
    alert('내보낼 행이 없습니다.')
    return
  }
  const ws = XLSX.utils.json_to_sheet(sheet)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'snapshot')
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`)
}
