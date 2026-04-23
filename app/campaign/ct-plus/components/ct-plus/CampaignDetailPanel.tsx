"use client"
import React, { useMemo } from "react"
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from "recharts"
import {
  Campaign, Operator, Agency, Advertiser,
  getMediaTotals, getCampaignTotals, getCampaignProgress, getDday,
} from "@/lib/campaignTypes"
import type { RawRow } from "@/lib/rawDataParser"
import { fmt, spendRateStyle, getDailySuggestion } from "./statusUtils"

// ── 매체 색상 ─────────────────────────────────────────
const MEDIA_COLORS: Record<string, string> = {
  "네이버 GFA": "#03C75A", "카카오모먼트": "#FEE500",
  "Google": "#4285F4", "META": "#1877F2",
}
const fallbackColor = "#94a3b8"
function mColor(m: string) { return MEDIA_COLORS[m] ?? fallbackColor }

function fmtAbbr(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`
  if (n >= 10_000)      return `${(n / 10_000).toFixed(0)}만`
  return fmt(n)
}

function DetailKPICard({ label, value, color }: {
  label: string; value: string; color?: "red" | "blue" | "green"
}) {
  const cls = color === "red" ? "text-red-600" : color === "green" ? "text-green-600"
    : color === "blue" ? "text-blue-600" : "text-gray-900"
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
      <p className="text-[11px] text-gray-500 font-medium">{label}</p>
      <p className={`text-sm font-semibold mt-1 ${cls}`}>{value}</p>
    </div>
  )
}

export function CampaignDetailPanel({
  campaign, operators, agencies, advertisers, rawRows, onClose, onEdit,
}: {
  campaign: Campaign
  operators: Operator[]
  agencies: Agency[]
  advertisers: Advertiser[]
  rawRows: RawRow[]
  onClose: () => void
  onEdit: (c: Campaign) => void
}) {
  // ── 이 캠페인에 매핑된 raw rows ─────────────────────
  const campRows = useMemo(
    () => rawRows.filter(r => r.matchedCampaignId === campaign.id),
    [rawRows, campaign.id]
  )

  // ── 매체별 집계 ──────────────────────────────────────
  const byMedia = useMemo(() => {
    const map = new Map<string, { rows: number; impressions: number; clicks: number; executionAmount: number; netAmount: number }>()
    for (const r of campRows) {
      const cur = map.get(r.media) ?? { rows: 0, impressions: 0, clicks: 0, executionAmount: 0, netAmount: 0 }
      cur.rows++
      cur.impressions    += r.impressions
      cur.clicks         += r.clicks
      cur.executionAmount += r.executionAmount ?? 0
      cur.netAmount      += r.netAmount ?? 0
      map.set(r.media, cur)
    }
    return map
  }, [campRows])

  // ── 일자별 × 매체별 LineChart 데이터 ───────────────
  const dailyTrend = useMemo(() => {
    const map = new Map<string, Record<string, number>>()
    for (const r of campRows) {
      if (!r.date) continue
      const entry = map.get(r.date) ?? {}
      entry[r.media] = (entry[r.media] ?? 0) + (r.netAmount ?? 0)
      map.set(r.date, entry)
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({ date: date.slice(5), ...vals }))
  }, [campRows])

  const trendMedias = useMemo(() => [...new Set(campRows.map(r => r.media))].sort(), [campRows])

  // ── 예산 차트 데이터 ──────────────────────────────
  const budgetChart = campaign.mediaBudgets.map(mb => {
    const t = getMediaTotals(mb)
    return { name: mb.media, "부킹": t.totalBudget, "세팅": t.totalSettingCost, "집행": t.totalSpend }
  })

  const totals   = getCampaignTotals(campaign)
  const progress = getCampaignProgress(campaign.startDate, campaign.endDate)
  const dday     = getDday(campaign.endDate)
  const sc       = spendRateStyle(totals.spendRate)
  const lag      = progress - totals.spendRate

  const opName  = operators.find(o => o.id === campaign.managerId)?.name    ?? "-"
  const agN     = agencies.find(a => a.id === campaign.agencyId)?.name      ?? "-"
  const advN    = advertisers.find(a => a.id === campaign.advertiserId)?.name ?? "-"

  const byMediaArr = [...byMedia.entries()]

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-[520px] bg-white shadow-2xl border-l border-gray-200 z-50 flex flex-col overflow-hidden">

        {/* 헤더 */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {campaign.campaignType && (
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-purple-100 text-purple-700">
                  {campaign.campaignType}
                </span>
              )}
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                campaign.status === "집행 중" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"
              }`}>{campaign.status}</span>
              {dday.label && (
                <span className={`text-xs font-medium ${
                  dday.urgent ? "text-red-600" : dday.expired ? "text-gray-400" : "text-gray-500"
                }`}>{dday.label}</span>
              )}
            </div>
            <h2 className="text-base font-semibold text-gray-900 truncate">{campaign.campaignName}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{advN} · {agN} · 담당: {opName}</p>
          </div>
          <button onClick={onClose} className="ml-3 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition-colors flex-shrink-0">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* KPI 카드 */}
          <div className="grid grid-cols-2 gap-2.5">
            <DetailKPICard label="부킹 금액"  value={fmt(totals.totalBudget) + "원"} />
            <DetailKPICard label="세팅 금액"  value={fmt(totals.totalSettingCost) + "원"} />
            <DetailKPICard label="집행 금액"  value={fmt(totals.totalSpend) + "원"}
              color={totals.spendRate > 100 ? "red" : "blue"} />
            <DetailKPICard label="미소진 잔액"
              value={fmt(Math.max(0, totals.totalSettingCost - totals.totalSpend)) + "원"} />
          </div>

          {/* 진행률 vs 소진율 */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
            <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">진행률 vs 소진율</h3>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-gray-600">진행률</span>
                <span className="text-xs font-semibold text-blue-600">{progress}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-gray-200">
                <div className="h-full rounded-full bg-blue-400 transition-all" style={{ width: `${Math.min(progress, 100)}%` }} />
              </div>
              <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                <span>{campaign.startDate.slice(5)}</span>
                <span>{campaign.endDate.slice(5)}</span>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-gray-600">소진율</span>
                <span className={`text-xs font-semibold ${sc.text}`}>{totals.spendRate}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-gray-200">
                <div className={`h-full rounded-full transition-all ${sc.bar}`}
                  style={{ width: `${Math.min(totals.spendRate, 100)}%` }} />
              </div>
            </div>
            {Math.abs(lag) >= 5 && (
              <div className={`rounded-lg px-3 py-2 text-xs font-medium ${
                lag >= 15 ? "bg-yellow-50 text-yellow-700 border border-yellow-200"
                  : lag > 0 ? "bg-orange-50 text-orange-700"
                  : "bg-green-50 text-green-700"
              }`}>
                {lag > 0
                  ? `⚠ 집행 속도 ${lag.toFixed(1)}%p 지연`
                  : `▲ 집행 속도 ${Math.abs(lag).toFixed(1)}%p 빠름`}
              </div>
            )}
          </div>

          {/* 일자별 순금액 추이 (raw data 기반) */}
          {dailyTrend.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">
                일자별 순금액 추이 ({campRows.length}행)
              </h3>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={dailyTrend} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#9ca3af" }} />
                  <YAxis tickFormatter={(v: number) => fmtAbbr(v)} tick={{ fontSize: 9, fill: "#9ca3af" }} width={40} />
                  <Tooltip
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(v: any) => [`${fmt(Math.round(Number(v ?? 0)))}원`, ""] as [string, string]}
                    contentStyle={{ fontSize: 10, borderRadius: 6 }}
                  />
                  <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10 }} />
                  {trendMedias.map(media => (
                    <Line
                      key={media}
                      type="monotone"
                      dataKey={media}
                      name={media}
                      stroke={mColor(media)}
                      strokeWidth={2}
                      dot={dailyTrend.length <= 31}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* 매체별 예산 차트 */}
          {budgetChart.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">매체별 예산 현황</h3>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={budgetChart} barCategoryGap="35%" barGap={2}
                  margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v: number) => fmtAbbr(v)} tick={{ fontSize: 9 }}
                    axisLine={false} tickLine={false} width={36} />
                  <Tooltip formatter={(v: unknown) => [fmt(v as number) + "원", ""]} />
                  <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="부킹" fill="#e2e8f0" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="세팅" fill="#93c5fd" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="집행" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* raw data 기반 매체별 집계 */}
          {byMediaArr.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
                <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">실적 데이터 집계</h3>
                <span className="text-[10px] text-gray-400">{campRows.length}행</span>
              </div>
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-gray-500 font-medium">매체</th>
                    <th className="px-3 py-2 text-right text-gray-500 font-medium">노출</th>
                    <th className="px-3 py-2 text-right text-gray-500 font-medium">클릭</th>
                    <th className="px-3 py-2 text-right text-gray-500 font-medium">집행금액</th>
                    <th className="px-3 py-2 text-right text-gray-500 font-medium">순금액</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {byMediaArr.map(([media, agg]) => (
                    <tr key={media} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-700">{media}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-600">{fmt(agg.impressions)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-600">{fmt(agg.clicks)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium text-blue-700">{fmt(agg.executionAmount)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-600">{fmt(agg.netAmount)}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-semibold">
                    <td className="px-3 py-2 text-gray-700">합계</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmt(campRows.reduce((s, r) => s + r.impressions, 0))}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmt(campRows.reduce((s, r) => s + r.clicks, 0))}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-blue-700">{fmt(campRows.reduce((s, r) => s + (r.executionAmount ?? 0), 0))}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmt(campRows.reduce((s, r) => s + (r.netAmount ?? 0), 0))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {campRows.length === 0 && (
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-6 text-center">
              <p className="text-xs text-gray-400">실적 데이터 없음</p>
              <p className="text-[10px] text-gray-300 mt-1">데이터 업로드에서 CSV를 추가하면 자동 연결됩니다</p>
            </div>
          )}

          {/* 일일 예산 제안 */}
          {campaign.status === "집행 중" && (
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
              <h3 className="text-[11px] font-semibold text-blue-600 mb-1">일일 예산 제안</h3>
              <p className="text-xs text-blue-800">{getDailySuggestion(campaign)}</p>
            </div>
          )}

          {/* 연결 CSV */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">연결 데이터</h3>
            {campaign.csvNames && campaign.csvNames.length > 0 ? (
              <div className="space-y-1.5">
                {campaign.csvNames.map(n => (
                  <div key={n} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full flex-shrink-0 bg-green-500" />
                    <span className="text-xs text-gray-700 truncate">{n}</span>
                  </div>
                ))}
                <p className="mt-1 text-[11px] text-green-600">{campaign.csvNames.length}개 CSV 캠페인명 매핑</p>
              </div>
            ) : (
              <p className="text-xs text-gray-400">연결된 데이터 없음 — 캠페인 수정에서 CSV명을 연결하세요</p>
            )}
          </div>

          {/* 특이사항 */}
          {campaign.memo && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <h3 className="text-[11px] font-semibold text-amber-700 mb-1">특이사항</h3>
              <p className="text-xs text-amber-900 whitespace-pre-wrap">{campaign.memo}</p>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="border-t border-gray-100 px-5 py-3 flex justify-end">
          <button
            onClick={() => onEdit(campaign)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            캠페인 수정
          </button>
        </div>
      </div>
    </>
  )
}
