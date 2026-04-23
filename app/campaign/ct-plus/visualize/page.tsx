"use client"

import { useState, useMemo, Suspense } from "react"
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts"
import { useRawData } from "@/lib/hooks/useRawData"
import { useMasterData } from "@/lib/hooks/useMasterData"
import type { RawRow } from "@/lib/rawDataParser"

// ── 유틸 ──────────────────────────────────────────────
function fmt(n: number) { return n.toLocaleString("ko-KR") }
function fmtShort(n: number) {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`
  if (n >= 10_000)      return `${(n / 10_000).toFixed(0)}만`
  return n.toLocaleString("ko-KR")
}

// ── 매체 색상 ─────────────────────────────────────────
const MEDIA_COLORS: Record<string, string> = {
  "네이버 GFA":  "#03C75A",
  "카카오모먼트": "#FEE500",
  "Google":      "#4285F4",
  "META":        "#1877F2",
}
const DEFAULT_COLOR = "#94a3b8"
function mediaColor(media: string) { return MEDIA_COLORS[media] ?? DEFAULT_COLOR }

// suppress unused-import warning for RawRow type
type _RR = RawRow

export default function VisualizePageWrapper() {
  return <Suspense><VisualizePage /></Suspense>
}

function VisualizePage() {
  const { allRows, loading: rawLoading }    = useRawData()
  const { campaigns, loading: masterLoading } = useMasterData()
  const loading = rawLoading || masterLoading

  const [campaignId, setCampaignId] = useState("")
  const [mediaSet, setMediaSet]     = useState<Set<string>>(new Set())
  const [dateFrom, setDateFrom]     = useState("")
  const [dateTo,   setDateTo]       = useState("")

  // 전체 매체 목록
  const allMedias = useMemo(() => [...new Set(allRows.map(r => r.media))].sort(), [allRows])

  // 데이터 날짜 범위
  const dateRange = useMemo(() => {
    if (allRows.length === 0) return { min: "", max: "" }
    const dates = allRows.map(r => r.date).filter(Boolean)
    return {
      min: dates.reduce((a, b) => a < b ? a : b, dates[0] ?? ""),
      max: dates.reduce((a, b) => a > b ? a : b, dates[0] ?? ""),
    }
  }, [allRows])

  // 필터 적용
  const filtered = useMemo(() => allRows.filter(r => {
    if (campaignId && r.matchedCampaignId !== campaignId) return false
    if (mediaSet.size > 0 && !mediaSet.has(r.media)) return false
    if (dateFrom && r.date < dateFrom) return false
    if (dateTo   && r.date > dateTo)   return false
    return true
  }), [allRows, campaignId, mediaSet, dateFrom, dateTo])

  // 일자별 LineChart 데이터
  const dailyData = useMemo(() => {
    const map = new Map<string, Record<string, number>>()
    for (const r of filtered) {
      if (!r.date) continue
      const entry = map.get(r.date) ?? {}
      entry[r.media] = (entry[r.media] ?? 0) + r.netCost
      map.set(r.date, entry)
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, values]) => ({ date, ...values }))
  }, [filtered])

  // 매체별 BarChart 데이터
  const mediaData = useMemo(() => {
    const map = new Map<string, { netCost: number; grossCost: number; impressions: number; clicks: number }>()
    for (const r of filtered) {
      const prev = map.get(r.media) ?? { netCost: 0, grossCost: 0, impressions: 0, clicks: 0 }
      map.set(r.media, {
        netCost:     prev.netCost     + r.netCost,
        grossCost:   prev.grossCost   + r.grossCost,
        impressions: prev.impressions + r.impressions,
        clicks:      prev.clicks      + r.clicks,
      })
    }
    return [...map.entries()].map(([media, v]) => ({
      media,
      netCost:     Math.round(v.netCost),
      grossCost:   Math.round(v.grossCost),
      impressions: v.impressions,
      clicks:      v.clicks,
      ctr: v.impressions > 0 ? Math.round((v.clicks / v.impressions) * 10000) / 100 : 0,
    })).sort((a, b) => b.netCost - a.netCost)
  }, [filtered])

  const totals = useMemo(() => ({
    netCost:     mediaData.reduce((s, r) => s + r.netCost, 0),
    grossCost:   mediaData.reduce((s, r) => s + r.grossCost, 0),
    impressions: mediaData.reduce((s, r) => s + r.impressions, 0),
    clicks:      mediaData.reduce((s, r) => s + r.clicks, 0),
  }), [mediaData])

  const chartMedias = useMemo(() => [...new Set(filtered.map(r => r.media))].sort(), [filtered])

  const toggleMedia = (media: string) => {
    setMediaSet(prev => {
      const next = new Set(prev)
      if (next.has(media)) next.delete(media)
      else next.add(media)
      return next
    })
  }

  const resetFilters = () => { setCampaignId(""); setMediaSet(new Set()); setDateFrom(""); setDateTo("") }
  const isFiltered = !!(campaignId || mediaSet.size > 0 || dateFrom || dateTo)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-base font-semibold text-gray-900">데이터 시각화</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          캠페인·매체·날짜 기준으로 raw 집행 데이터를 시각화합니다
          {!loading && allRows.length > 0 && (
            <span className="ml-2 text-blue-600 font-medium">전체 {fmt(allRows.length)}행</span>
          )}
        </p>
      </header>

      <main className="p-6 space-y-5">
        {/* 필터 패널 */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">필터</h2>
            {isFiltered && (
              <button onClick={resetFilters} className="text-xs text-blue-600 hover:underline">초기화</button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* 캠페인 */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">캠페인</label>
              {loading ? (
                <p className="text-xs text-gray-400">로딩 중...</p>
              ) : (
                <select
                  value={campaignId}
                  onChange={e => setCampaignId(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <option value="">전체 캠페인</option>
                  {campaigns.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.campaignName} ({c.settlementMonth})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* 시작일 */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">
                시작일{dateRange.min && <span className="ml-1 text-gray-400">({dateRange.min} ~)</span>}
              </label>
              <input
                type="date"
                value={dateFrom}
                min={dateRange.min}
                max={dateTo || dateRange.max}
                onChange={e => setDateFrom(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            {/* 종료일 */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">
                종료일{dateRange.max && <span className="ml-1 text-gray-400">(~ {dateRange.max})</span>}
              </label>
              <input
                type="date"
                value={dateTo}
                min={dateFrom || dateRange.min}
                max={dateRange.max}
                onChange={e => setDateTo(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>

          {/* 매체 체크박스 */}
          {allMedias.length > 0 && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">매체</label>
              <div className="flex flex-wrap gap-2">
                {allMedias.map(media => (
                  <button
                    key={media}
                    onClick={() => toggleMedia(media)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      mediaSet.has(media)
                        ? "border-transparent text-white"
                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                    }`}
                    style={mediaSet.has(media) ? { backgroundColor: mediaColor(media), borderColor: mediaColor(media) } : {}}
                  >
                    <span
                      className="h-2 w-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: mediaSet.has(media) ? "rgba(255,255,255,0.7)" : mediaColor(media) }}
                    />
                    {media}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 로딩 */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent mb-4" />
            <p className="text-sm text-gray-500">데이터 로딩 중...</p>
          </div>
        )}

        {/* 데이터 없음 */}
        {!loading && allRows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="rounded-full bg-gray-100 p-6 mb-4">
              <svg className="h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500">업로드된 데이터가 없습니다</p>
            <p className="text-xs text-gray-400 mt-1">데이터 업로드 메뉴에서 CSV를 먼저 추가하세요</p>
          </div>
        )}

        {!loading && allRows.length > 0 && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm font-medium text-gray-500">필터 조건에 해당하는 데이터가 없습니다</p>
            <button onClick={resetFilters} className="mt-2 text-xs text-blue-600 hover:underline">필터 초기화</button>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <>
            {/* 요약 카드 */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "순 집행금액 (NET)",   value: `${fmtShort(totals.netCost)}원` },
                { label: "총 집행금액 (GROSS)",  value: `${fmtShort(totals.grossCost)}원` },
                { label: "노출 수",              value: fmtShort(totals.impressions) },
                { label: "클릭 수",              value: fmtShort(totals.clicks) },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg border border-gray-200 bg-white p-3 text-center shadow-sm">
                  <p className="text-[10px] text-gray-500 mb-0.5">{label}</p>
                  <p className="text-sm font-bold text-gray-900">{value}</p>
                </div>
              ))}
            </div>

            {/* 일자별 LineChart */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">일자별 순 집행금액 추이</h2>
              {dailyData.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-8">날짜 데이터가 없습니다</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={dailyData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "#9ca3af" }}
                      tickFormatter={(v: string) => v.slice(5)}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#9ca3af" }}
                      tickFormatter={(v: number) => fmtShort(v)}
                      width={55}
                    />
                    <Tooltip
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={(v: any) => [`${fmt(Math.round(Number(v ?? 0)))}원`, ""] as [string,string]}
                      labelStyle={{ fontSize: 11 }}
                      contentStyle={{ fontSize: 11, borderRadius: 8 }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                    {chartMedias.map(media => (
                      <Line
                        key={media}
                        type="monotone"
                        dataKey={media}
                        name={media}
                        stroke={mediaColor(media)}
                        strokeWidth={2}
                        dot={dailyData.length <= 31}
                        activeDot={{ r: 4 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* 매체별 BarChart */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">매체별 집행금액</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={mediaData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="media" tick={{ fontSize: 11, fill: "#6b7280" }} />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    tickFormatter={(v: number) => fmtShort(v)}
                    width={55}
                  />
                  <Tooltip
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(v: any, name: any) => {
                      const n = Math.round(Number(v ?? 0))
                      const val = (name === "netCost" || name === "grossCost") ? `${fmt(n)}원` : fmt(n)
                      const lbl = name === "netCost" ? "NET" : name === "grossCost" ? "GROSS" : name
                      return [val, lbl] as [string, string]
                    }}
                    contentStyle={{ fontSize: 11, borderRadius: 8 }}
                  />
                  <Legend
                    formatter={(v: string) => v === "netCost" ? "NET 금액" : "GROSS 금액"}
                    wrapperStyle={{ fontSize: 11 }}
                  />
                  <Bar dataKey="grossCost" name="grossCost" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="netCost"   name="netCost"   fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* 매체별 요약 테이블 */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-900">매체별 요약</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      {["매체", "NET 금액", "GROSS 금액", "노출", "클릭", "CTR"].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left font-medium text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {mediaData.map(row => (
                      <tr key={row.media} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-800">
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: mediaColor(row.media) }} />
                            {row.media}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-blue-700 font-medium">{fmt(row.netCost)}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{fmt(row.grossCost)}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{fmt(row.impressions)}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{fmt(row.clicks)}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{row.ctr.toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                    <tr>
                      <td className="px-4 py-3 font-semibold text-gray-900">합계</td>
                      <td className="px-4 py-3 text-right font-semibold text-blue-700">{fmt(totals.netCost)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-700">{fmt(totals.grossCost)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-700">{fmt(totals.impressions)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-700">{fmt(totals.clicks)}</td>
                      <td className="px-4 py-3 text-right text-gray-400">—</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
