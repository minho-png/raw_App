"use client"

import { useState } from "react"
import type { RawRow } from "@/lib/rawDataParser"
import type { MediaType } from "@/lib/reportTypes"

interface Props {
  rows: RawRow[]
  media: MediaType
}

function fmt(n: number) { return n.toLocaleString('ko-KR') }

/** Google/META만 조회 컬럼 표시 */
const MEDIA_WITH_VIEWS: MediaType[] = ['google', 'meta']

export default function DailyDataTable({ rows, media }: Props) {
  const [copied, setCopied] = useState(false)
  const showViews = MEDIA_WITH_VIEWS.includes(media)

  const headers = ['날짜', '요일', '매체', '소재명', 'DMP명', '노출', '클릭',
    ...(showViews ? ['조회'] : []),
    '집행 금액', '집행 금액(NET)']

  // ── 합계 ────────────────────────────────────────────────
  const totals = rows.reduce((acc, r) => ({
    impressions: acc.impressions + r.impressions,
    clicks: acc.clicks + r.clicks,
    views: acc.views + (r.views ?? 0),
    grossCost: acc.grossCost + r.grossCost,
    netCost: acc.netCost + r.netCost,
  }), { impressions: 0, clicks: 0, views: 0, grossCost: 0, netCost: 0 })

  // ── TSV 복사 ─────────────────────────────────────────────
  function copyAsText() {
    const dataRows = rows.map(r => {
      const cells: (string | number)[] = [
        r.date, r.dayOfWeek, r.media, r.creativeName, r.dmpName,
        r.impressions, r.clicks,
      ]
      if (showViews) cells.push(r.views ?? 0)
      cells.push(r.grossCost, r.netCost)
      return cells.join('\t')
    })
    const text = [headers.join('\t'), ...dataRows].join('\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-6 py-12 text-center text-sm text-gray-400">
        데이터가 없습니다.
      </div>
    )
  }

  const thCls = "whitespace-nowrap border-b border-gray-200 px-3 py-2.5 text-left text-[11px] font-semibold text-gray-500 bg-gray-50"
  const tdCls = "border-b border-gray-100 px-3 py-2 text-xs text-gray-700"
  const tdR = `${tdCls} text-right tabular-nums`

  return (
    <div className="space-y-3">
      {/* 상단 바 */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          <span className="font-medium text-gray-700">{fmt(rows.length)}</span>개 행
        </p>
        <button
          onClick={copyAsText}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-medium transition-colors ${
            copied
              ? 'bg-green-500 text-white'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {copied ? '✓ 복사됨!' : '📋 표 복사'}
        </button>
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        <table className="w-full text-xs">
          <thead>
            <tr>
              {headers.map(h => (
                <th key={h} className={thCls}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
                <td className={tdCls}>{row.date}</td>
                <td className={`${tdCls} text-gray-400`}>{row.dayOfWeek}</td>
                <td className={`${tdCls} font-medium`}>{row.media}</td>
                <td className={tdCls} title={row.creativeName}>
                  <span className="inline-block max-w-[180px] truncate">{row.creativeName || '—'}</span>
                </td>
                <td className={tdCls} title={row.dmpName}>
                  <span className="inline-block max-w-[140px] truncate">{row.dmpName || '—'}</span>
                </td>
                <td className={tdR}>{fmt(row.impressions)}</td>
                <td className={tdR}>{fmt(row.clicks)}</td>
                {showViews && (
                  <td className={tdR}>{row.views !== null ? fmt(row.views) : '—'}</td>
                )}
                <td className={tdR}>{fmt(row.grossCost)}</td>
                <td className={tdR}>{fmt(row.netCost)}</td>
              </tr>
            ))}
          </tbody>
          {/* 합계 행 */}
          <tfoot>
            <tr className="bg-gray-100 font-semibold">
              <td colSpan={5} className="border-t border-gray-200 px-3 py-2.5 text-xs text-gray-600">합계</td>
              <td className={`border-t border-gray-200 px-3 py-2.5 text-right text-xs tabular-nums`}>{fmt(totals.impressions)}</td>
              <td className={`border-t border-gray-200 px-3 py-2.5 text-right text-xs tabular-nums`}>{fmt(totals.clicks)}</td>
              {showViews && (
                <td className={`border-t border-gray-200 px-3 py-2.5 text-right text-xs tabular-nums`}>{fmt(totals.views)}</td>
              )}
              <td className={`border-t border-gray-200 px-3 py-2.5 text-right text-xs tabular-nums`}>{fmt(totals.grossCost)}</td>
              <td className={`border-t border-gray-200 px-3 py-2.5 text-right text-xs tabular-nums`}>{fmt(totals.netCost)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
