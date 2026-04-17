"use client"

import { useState } from "react"
import type { RawRow } from "@/lib/rawDataParser"
import type { MediaType } from "@/lib/reportTypes"

interface Props {
  rows: RawRow[]
  media: MediaType
  onRowUpdate?: (rowIndex: number, field: string, value: number) => void
}

function fmt(n: number) { return n.toLocaleString('ko-KR') }

/** Editable numeric cell component */
function EditableCell({
  value,
  onUpdate,
  disabled = false,
}: {
  value: number
  onUpdate: (newValue: number) => void
  disabled?: boolean
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [inputValue, setInputValue] = useState(String(value))

  const handleBlur = () => {
    const num = parseInt(inputValue.replace(/,/g, ''), 10)
    if (!isNaN(num)) {
      onUpdate(num)
    }
    setIsEditing(false)
    setInputValue(String(value))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleBlur()
    } else if (e.key === 'Escape') {
      setIsEditing(false)
      setInputValue(String(value))
    }
  }

  if (!isEditing && disabled) {
    return <span>{fmt(value)}</span>
  }

  return isEditing ? (
    <input
      type="number"
      value={inputValue}
      onChange={(e) => setInputValue(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      autoFocus
      className="w-full border-0 bg-transparent px-0 py-1 text-right text-xs text-gray-700 tabular-nums outline-none ring-1 ring-blue-400 rounded"
      style={{ fontSize: 'inherit' }}
    />
  ) : (
    <span
      onClick={() => !disabled && setIsEditing(true)}
      className={!disabled ? 'cursor-text hover:bg-blue-50 rounded px-1' : ''}
    >
      {fmt(value)}
    </span>
  )
}

/** Google/META만 조회 컬럼 표시 */
const MEDIA_WITH_VIEWS: MediaType[] = ['google', 'meta']

const DMP_BADGE_COLORS: Record<string, string> = {
  SKP:              'bg-blue-100 text-blue-700 border-blue-200',
  KB:               'bg-yellow-100 text-yellow-700 border-yellow-200',
  LOTTE:            'bg-red-100 text-red-700 border-red-200',
  TG360:            'bg-orange-100 text-orange-700 border-orange-200',
  BC:               'bg-gray-100 text-gray-600 border-gray-200',
  SH:               'bg-slate-100 text-slate-600 border-slate-200',
  WIFI:             'bg-teal-100 text-teal-700 border-teal-200',
  HyperLocal:       'bg-purple-100 text-purple-700 border-purple-200',
  MEDIA_TARGETING:  'bg-green-100 text-green-700 border-green-200',
  DIRECT:           'bg-gray-50 text-gray-400 border-gray-100',
}

const DMP_LABELS: Record<string, string> = {
  MEDIA_TARGETING: '매체 타게팅',
}

export default function DailyDataTable({ rows, media, onRowUpdate }: Props) {
  const [copied, setCopied] = useState(false)
  const showViews = MEDIA_WITH_VIEWS.includes(media)

  const headers = [
    '날짜', '요일', '매체', '소재명', '광고그룹', 'DMP',
    '노출', '클릭',
    ...(showViews ? ['조회'] : []),
    '집행 금액', '집행 금액(NET)', '순 금액', '공급가',
  ]

  // ── 합계 ──────────────────────────────────────────────────
  const totals = rows.reduce((acc, r) => ({
    impressions:     acc.impressions + r.impressions,
    clicks:          acc.clicks + r.clicks,
    views:           acc.views + (r.views ?? 0),
    grossCost:       acc.grossCost + r.grossCost,
    netCost:         acc.netCost + r.netCost,
    executionAmount: acc.executionAmount + (r.executionAmount ?? r.grossCost),
    netAmount:       acc.netAmount + (r.netAmount ?? r.netCost),
    supplyValue:     acc.supplyValue + (r.supplyValue ?? r.netCost),
  }), { impressions: 0, clicks: 0, views: 0, grossCost: 0, netCost: 0, executionAmount: 0, netAmount: 0, supplyValue: 0 })

  // ── TSV 복사 ──────────────────────────────────────────────
  function copyAsText() {
    const dataRows = rows.map(r => {
      const cells: (string | number)[] = [
        r.date, r.dayOfWeek, r.media, r.creativeName, r.dmpName, r.dmpType ?? '',
        r.impressions, r.clicks,
      ]
      if (showViews) cells.push(r.views ?? 0)
      cells.push(r.grossCost, r.netCost, r.executionAmount ?? r.grossCost, r.netAmount ?? r.netCost, r.supplyValue ?? r.netCost)
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

  // DMP 요약
  const dmpSummary = rows.reduce((acc, r) => {
    const key = r.dmpType ?? 'DIRECT'
    acc[key] = (acc[key] ?? 0) + (r.executionAmount ?? r.grossCost)
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="space-y-3">
      {/* 상단 바 */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-xs text-gray-500">
            <span className="font-medium text-gray-700">{fmt(rows.length)}</span>개 행
          </p>
          {/* DMP 요약 배지 */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {Object.entries(dmpSummary)
              .filter(([, v]) => v > 0)
              .sort(([, a], [, b]) => b - a)
              .map(([dmp, total]) => (
                <span
                  key={dmp}
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${DMP_BADGE_COLORS[dmp] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}
                  title={`집행 ${fmt(total)}원`}
                >
                  {dmp} {fmt(total)}원
                </span>
              ))}
          </div>
        </div>
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
                  <span className="inline-block max-w-[160px] truncate">{row.creativeName || '—'}</span>
                </td>
                <td className={tdCls} title={row.dmpName}>
                  <span className="inline-block max-w-[120px] truncate">{row.dmpName || '—'}</span>
                </td>
                <td className={tdCls}>
                  {row.dmpType ? (
                    <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${DMP_BADGE_COLORS[row.dmpType] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                      {DMP_LABELS[row.dmpType] ?? row.dmpType}
                    </span>
                  ) : '—'}
                </td>
                <td className={tdR}>
                  <EditableCell
                    value={row.impressions}
                    onUpdate={(val) => onRowUpdate?.(i, 'impressions', val)}
                    disabled={!onRowUpdate}
                  />
                </td>
                <td className={tdR}>
                  <EditableCell
                    value={row.clicks}
                    onUpdate={(val) => onRowUpdate?.(i, 'clicks', val)}
                    disabled={!onRowUpdate}
                  />
                </td>
                {showViews && (
                  <td className={tdR}>
                    {row.views !== null ? (
                      <EditableCell
                        value={row.views}
                        onUpdate={(val) => onRowUpdate?.(i, 'views', val)}
                        disabled={!onRowUpdate}
                      />
                    ) : (
                      '—'
                    )}
                  </td>
                )}
                <td className={tdR}>
                  <EditableCell
                    value={row.grossCost}
                    onUpdate={(val) => onRowUpdate?.(i, 'grossCost', val)}
                    disabled={!onRowUpdate}
                  />
                </td>
                <td className={tdR}>
                  <EditableCell
                    value={row.netCost}
                    onUpdate={(val) => onRowUpdate?.(i, 'netCost', val)}
                    disabled={!onRowUpdate}
                  />
                </td>
                <td className={`${tdR} text-blue-700`}>
                  <EditableCell
                    value={row.executionAmount ?? row.grossCost}
                    onUpdate={(val) => onRowUpdate?.(i, 'executionAmount', val)}
                    disabled={!onRowUpdate}
                  />
                </td>
                <td className={tdR}>
                  <EditableCell
                    value={row.netAmount ?? row.netCost}
                    onUpdate={(val) => onRowUpdate?.(i, 'netAmount', val)}
                    disabled={!onRowUpdate}
                  />
                </td>
                <td className={`${tdR} text-gray-400`}>
                  <EditableCell
                    value={row.supplyValue ?? row.netCost}
                    onUpdate={(val) => onRowUpdate?.(i, 'supplyValue', val)}
                    disabled={!onRowUpdate}
                  />
                </td>
              </tr>
            ))}
          </tbody>
          {/* 합계 행 */}
          <tfoot>
            <tr className="bg-gray-100 font-semibold">
              <td colSpan={6} className="border-t border-gray-200 px-3 py-2.5 text-xs text-gray-600">합계</td>
              <td className="border-t border-gray-200 px-3 py-2.5 text-right text-xs tabular-nums">{fmt(totals.impressions)}</td>
              <td className="border-t border-gray-200 px-3 py-2.5 text-right text-xs tabular-nums">{fmt(totals.clicks)}</td>
              {showViews && (
                <td className="border-t border-gray-200 px-3 py-2.5 text-right text-xs tabular-nums">{fmt(totals.views)}</td>
              )}
              <td className="border-t border-gray-200 px-3 py-2.5 text-right text-xs tabular-nums">{fmt(totals.grossCost)}</td>
              <td className="border-t border-gray-200 px-3 py-2.5 text-right text-xs tabular-nums">{fmt(totals.netCost)}</td>
              <td className="border-t border-gray-200 px-3 py-2.5 text-right text-xs tabular-nums text-blue-700">{fmt(totals.executionAmount)}</td>
              <td className="border-t border-gray-200 px-3 py-2.5 text-right text-xs tabular-nums">{fmt(totals.netAmount)}</td>
              <td className="border-t border-gray-200 px-3 py-2.5 text-right text-xs tabular-nums text-gray-400">{fmt(totals.supplyValue)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
