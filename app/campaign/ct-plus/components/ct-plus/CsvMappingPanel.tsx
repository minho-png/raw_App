
"use client"
import React from "react"
import type { RawRow } from "@/lib/rawDataParser"

export function CsvMappingPanel({
  rawRows,
  csvNames,
  csvSearch,
  csvMediaFilter,
  takenCsvNames = [],
  onCsvSearchChange,
  onCsvMediaFilterChange,
  onCsvNamesChange,
}: {
  rawRows: RawRow[]
  csvNames: string[]
  csvSearch: string
  csvMediaFilter: string
  takenCsvNames?: string[]
  onCsvSearchChange: (search: string) => void
  onCsvMediaFilterChange: (filter: string) => void
  onCsvNamesChange: (names: string[]) => void
}) {
  // 각 캠페인명 → 연관 매체 메타 계산
  const reportNameMeta = React.useMemo(() => {
    const meta = new Map<string, { media: Set<string> }>()
    for (const row of rawRows) {
      const name = row.campaignName
      if (!name) continue
      if (!meta.has(name)) meta.set(name, { media: new Set() })
      meta.get(name)!.media.add(row.media)
    }
    return meta
  }, [rawRows])

  const allReportCampaignNames = React.useMemo(
    () => Array.from(reportNameMeta.keys()).sort(),
    [reportNameMeta]
  )

  // 모든 매체 목록 수집
  const allMedia = React.useMemo(
    () => Array.from(new Set(
      allReportCampaignNames.flatMap(n => Array.from(reportNameMeta.get(n)?.media ?? []))
    )).sort(),
    [allReportCampaignNames, reportNameMeta]
  )

  // 검색 + 매체 필터 적용
  const filtered = React.useMemo(() => {
    return allReportCampaignNames.filter(name => {
      if (csvSearch && !name.toLowerCase().includes(csvSearch.toLowerCase())) return false
      if (csvMediaFilter) {
        const meta = reportNameMeta.get(name)
        if (!meta?.media.has(csvMediaFilter)) return false
      }
      return true
    })
  }, [allReportCampaignNames, csvSearch, csvMediaFilter, reportNameMeta])

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-2">DB 데이터 연결</label>
      <p className="text-[11px] text-gray-500 mb-2">업로드된 데이터 중 이 캠페인에 해당하는 항목을 선택하세요.</p>

      {/* 검색 + 매체 필터 */}
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={csvSearch}
          onChange={e => onCsvSearchChange(e.target.value)}
          placeholder="캠페인명 검색..."
          className="flex-1 rounded-md border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <select
          value={csvMediaFilter}
          onChange={e => onCsvMediaFilterChange(e.target.value)}
          className="rounded-md border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
        >
          <option value="">전체 매체</option>
          {allMedia.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 p-2 space-y-1">
        {filtered.length === 0 && (
          <p className="text-[11px] text-gray-400 text-center py-2">검색 결과 없음</p>
        )}
        {filtered.map(name => {
          const checked = csvNames.includes(name)
          const meta = reportNameMeta.get(name)
          const mediaTags = meta ? Array.from(meta.media) : []
          const isTaken = takenCsvNames.includes(name)

          return (
            <label key={name} className={`flex items-start gap-2 rounded-md px-2 py-1.5 cursor-${isTaken && !checked ? 'not-allowed' : 'pointer'} transition-colors ${
              isTaken && !checked
                ? 'bg-gray-100'
                : checked
                ? "bg-blue-50"
                : "hover:bg-gray-50"
            }`}>
              <input
                type="checkbox"
                checked={checked}
                disabled={isTaken && !checked}
                onChange={e => {
                  if (e.target.checked) onCsvNamesChange([...csvNames, name])
                  else onCsvNamesChange(csvNames.filter(n => n !== name))
                }}
                className="rounded mt-0.5 flex-shrink-0"
              />
              <div className="min-w-0">
                <span className={`text-xs block truncate ${isTaken && !checked ? 'text-gray-400' : checked ? "text-blue-700 font-medium" : "text-gray-700"}`}>
                  {name}
                  {isTaken && !checked && ' (사용 중)'}
                </span>
                {mediaTags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {mediaTags.map(t => (
                      <span key={t} className="inline-block rounded px-1 py-0 text-[10px] bg-gray-100 text-gray-500">{t}</span>
                    ))}
                  </div>
                )}
              </div>
            </label>
          )
        })}
      </div>
      {csvNames.length > 0 && (
        <p className="mt-1.5 text-[11px] text-blue-600">{csvNames.length}개 선택됨</p>
      )}
    </div>
  )
}
