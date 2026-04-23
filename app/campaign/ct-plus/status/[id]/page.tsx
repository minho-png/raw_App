"use client"
import React, { useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from "recharts"
import { useMasterData } from "@/lib/hooks/useMasterData"
import { useRawData } from "@/lib/hooks/useRawData"
import { applyMarkupToRows } from "@/lib/markupService"
import { getCampaignTotals, getCampaignProgress } from "@/lib/campaignTypes"
import { fmt, spendRateStyle } from "@/app/campaign/ct-plus/components/ct-plus/statusUtils"

const MEDIA_COLORS: Record<string, string> = {
  "네이버 GFA": "#03C75A", "카카오모멘트": "#FEE500",
  "Google": "#4285F4", "META": "#1877F2",
}
const fallbackColor = "#94a3b8"
function mColor(m: string) { return MEDIA_COLORS[m] ?? fallbackColor }

function fmtAbbr(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`
  if (n >= 10_000) return `${(n / 10_000).toFixed(0)}만`
  return fmt(n)
}

type Tab = "daily" | "weekly" | "media"

export default function CampaignDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = typeof params?.id === "string" ? params.id : ""

  const { campaigns, operators, agencies, advertisers } = useMasterData()
  const { allRows: rawRows } = useRawData()
  const [tab, setTab] = useState<Tab>("daily")

  const campaign = useMemo(() => campaigns.find(c => c.id === id) ?? null, [campaigns, id])

  const campRows = useMemo(() => {
    if (!campaign) return []
    const computed = applyMarkupToRows(rawRows, campaigns)
    return computed.filter(r => r.matchedCampaignId === campaign.id)
  }, [rawRows, campaigns, campaign])

  // 일별 집계
  const dailyData = useMemo(() => {
    const map = new Map<string, { date: string; impressions: number; clicks: number; spend: number; netAmount: number }>()
    for (const r of campRows) {
      if (!r.date) continue
      const cur = map.get(r.date) ?? { date: r.date, impressions: 0, clicks: 0, spend: 0, netAmount: 0 }
      cur.impressions += r.impressions ?? 0
      cur.clicks      += r.clicks ?? 0
      cur.spend       += r.executionAmount ?? 0
      cur.netAmount   += r.netAmount ?? 0
      map.set(r.date, cur)
    }
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date)).map(d => ({
      ...d,
      dateLabel: d.date.slice(5),
      ctr: d.impressions > 0 ? Math.round((d.clicks / d.impressions) * 10000) / 100 : 0,
    }))
  }, [campRows])

  // 주간 집계
  const weeklyData = useMemo(() => {
    const map = new Map<string, { week: string; impressions: number; clicks: number; spend: number; netAmount: number }>()
    for (const d of dailyData) {
      const dt = new Date(d.date)
      const day = dt.getDay()
      const diff = dt.getDate() - day + (day === 0 ? -6 : 1)
      const mon = new Date(dt.setDate(diff))
      const week = `${mon.getFullYear()}-${String(mon.getMonth()+1).padStart(2,"0")}-${String(mon.getDate()).padStart(2,"0")}`
      const cur = map.get(week) ?? { week, impressions: 0, clicks: 0, spend: 0, netAmount: 0 }
      cur.impressions += d.impressions
      cur.clicks      += d.clicks
      cur.spend       += d.spend
      cur.netAmount   += d.netAmount
      map.set(week, cur)
    }
    return [...map.values()].sort((a, b) => a.week.localeCompare(b.week)).map(w => ({
      ...w,
      weekLabel: w.week.slice(5),
      ctr: w.impressions > 0 ? Math.round((w.clicks / w.impressions) * 10000) / 100 : 0,
    }))
  }, [dailyData])

  // 매체별 집계
  const mediaData = useMemo(() => {
    const map = new Map<string, { media: string; impressions: number; clicks: number; spend: number; netAmount: number; days: Set<string> }>()
    for (const r of campRows) {
      const cur = map.get(r.media) ?? { media: r.media, impressions: 0, clicks: 0, spend: 0, netAmount: 0, days: new Set() }
      cur.impressions += r.impressions ?? 0
      cur.clicks      += r.clicks ?? 0
      cur.spend       += r.executionAmount ?? 0
      cur.netAmount   += r.netAmount ?? 0
      if (r.date) cur.days.add(r.date)
      map.set(r.media, cur)
    }
    return [...map.values()].map(m => ({
      ...m,
      activeDays: m.days.size,
      ctr: m.impressions > 0 ? Math.round((m.clicks / m.impressions) * 10000) / 100 : 0,
      cpm: m.impressions > 0 ? Math.round((m.spend / m.impressions) * 1000) : 0,
    }))
  }, [campRows])

  // 매체별 일별 추이 (LineChart)
  const mediaNames = useMemo(() => [...new Set(campRows.map(r => r.media))].sort(), [campRows])
  const dailyByMedia = useMemo(() => {
    const map = new Map<string, Record<string, number>>()
    for (const r of campRows) {
      if (!r.date) continue
      const cur = map.get(r.date) ?? {}
      cur[r.media] = (cur[r.media] ?? 0) + (r.netAmount ?? 0)
      map.set(r.date, cur)
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({ date: date.slice(5), ...vals }))
  }, [campRows])

  if (!campaign) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-gray-500">캔페인을 찾을 수 없습니다.</p>
          <button onClick={() => router.back()} className="mt-3 text-xs text-blue-600 hover:underline">돌아가기</button>
        </div>
      </div>
    )
  }

  const totals   = getCampaignTotals(campaign)
  const progress = getCampaignProgress(campaign.startDate, campaign.endDate)
  const rawNetTotal = campRows.reduce((s, r) => s + (r.netAmount ?? 0), 0)
  const rawSpendRate = totals.totalSettingCost > 0
    ? Math.round((rawNetTotal / totals.totalSettingCost) * 1000) / 10 : 0
  const sc = spendRateStyle(rawSpendRate)
  const totalImpressions = campRows.reduce((s, r) => s + (r.impressions ?? 0), 0)
  const totalClicks      = campRows.reduce((s, r) => s + (r.clicks ?? 0), 0)
  const totalCtr         = totalImpressions > 0 ? Math.round((totalClicks / totalImpressions) * 10000) / 100 : 0
  const opName  = operators.find(o => o.id === campaign.managerId)?.name ?? "-"
  const agN     = agencies.find(a => a.id === campaign.agencyId)?.name ?? "-"
  const advN    = advertisers.find(a => a.id === campaign.advertiserId)?.name ?? "-"

  const tabs: { key: Tab; label: string }[] = [
    { key: "daily",  label: "일별" },
    { key: "weekly", label: "주간" },
    { key: "media",  label: "매체별" },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/campaign/ct-plus/status")}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <div className="flex items-center gap-2">
              {campaign.campaignType && (
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-purple-100 text-purple-700">
                  {campaign.campaignType}
                </span>
              )}
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                campaign.status === "집행 중" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"
              }`}>{campaign.status}</span>
            </div>
            <h1 className="text-base font-semibold text-gray-900 mt-0.5">{campaign.campaignName}</h1>
            <p className="text-xs text-gray-500">{advN} · {agN} · 담당: {opName}</p>
          </div>
        </div>
      </header>

      <main className="p-6 space-y-4 max-w-5xl mx-auto">
        {/* KPI 요약 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "세팅 금액", value: fmtAbbr(totals.totalSettingCost) + "원", color: "" },
            { label: "집행 금액 (CSV)", value: fmtAbbr(rawNetTotal) + "원", color: rawSpendRate > 100 ? "text-red-600" : "text-blue-600" },
            { label: "소진율", value: `${rawSpendRate.toFixed(1)}%`, color: sc.text },
            { label: "진행률", value: `${progress}%`, color: "text-blue-600" },
            { label: "노출 합계", value: fmt(totalImpressions), color: "" },
            { label: "클릭 합계", value: fmt(totalClicks), color: "" },
            { label: "평균 CTR", value: `${totalCtr}%`, color: totalCtr > 1 ? "text-green-600" : "" },
            { label: "연결 데이터", value: `${campRows.length}행`, color: campRows.length > 0 ? "text-purple-600" : "text-gray-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
              <p className="text-[11px] text-gray-500 font-medium">{label}</p>
              <p className={`text-sm font-semibold mt-1 ${color || "text-gray-900"}`}>{value}</p>
            </div>
          ))}
        </div>

        {campRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
            <p className="text-sm text-gray-400">연결된 실적 데이터가 없습니다.</p>
            <p className="text-xs text-gray-300 mt-1">데이터 업로드에서 CSV를 업로드하면 자동 연결됩니다.</p>
          </div>
        ) : (
          <>
            {/* 탭 */}
            <div className="flex gap-1 border-b border-gray-200">
              {tabs.map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                    tab === t.key
                      ? "border-blue-500 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >{t.label}</button>
              ))}
            </div>

            {/* 일별 탭 */}
            {tab === "daily" && (
              <div className="space-y-4">
                {/* 순금액 추이 */}
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">일별 순금액 추이</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={dailyByMedia} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#9ca3af" }} />
                      <YAxis tickFormatter={(v: number) => fmtAbbr(v)} tick={{ fontSize: 9, fill: "#9ca3af" }} width={44} />
                      <Tooltip formatter={(v: unknown) => [fmt(v as number) + "원", ""]} contentStyle={{ fontSize: 10, borderRadius: 6 }} />
                      <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10 }} />
                      {mediaNames.map(media => (
                        <Line key={media} type="monotone" dataKey={media} name={media}
                          stroke={mColor(media)} strokeWidth={2} dot={dailyByMedia.length <= 31} connectNulls />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                {/* CTR 추이 */}
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">일별 CTR (%)</h3>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={dailyData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="dateLabel" tick={{ fontSize: 9, fill: "#9ca3af" }} />
                      <YAxis tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 9, fill: "#9ca3af" }} width={36} />
                      <Tooltip formatter={(v: unknown) => [`${v}%`, "CTR"]} contentStyle={{ fontSize: 10, borderRadius: 6 }} />
                      <Bar dataKey="ctr" fill="#a78bfa" radius={[2, 2, 0, 0]} name="CTR" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {/* 일별 상세 테이블 */}
                <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                    <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">일별 상세</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                          <th className="px-3 py-2 text-left text-gray-500 font-medium">날짜</th>
                          <th className="px-3 py-2 text-right text-gray-500 font-medium">노출</th>
                          <th className="px-3 py-2 text-right text-gray-500 font-medium">클릭</th>
                          <th className="px-3 py-2 text-right text-gray-500 font-medium">CTR</th>
                          <th className="px-3 py-2 text-right text-gray-500 font-medium">집행금액</th>
                          <th className="px-3 py-2 text-right text-gray-500 font-medium">순금액</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {dailyData.map(d => (
                          <tr key={d.date} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-medium text-gray-700 tabular-nums">{d.date}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-600">{fmt(d.impressions)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-600">{fmt(d.clicks)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-purple-600 font-medium">{d.ctr}%</td>
                            <td className="px-3 py-2 text-right tabular-nums text-blue-700 font-medium">{fmtAbbr(d.spend)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-600">{fmtAbbr(d.netAmount)}</td>
                          </tr>
                        ))}
                        <tr className="bg-gray-50 font-semibold">
                          <td className="px-3 py-2 text-gray-700">합계</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmt(totalImpressions)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmt(totalClicks)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-purple-700">{totalCtr}%</td>
                          <td className="px-3 py-2 text-right tabular-nums text-blue-700">{fmtAbbr(campRows.reduce((s, r) => s + (r.executionAmount ?? 0), 0))}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmtAbbr(rawNetTotal)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* 주간 탭 */}
            {tab === "weekly" && (
              <div className="space-y-4">
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">주간별 순금액</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={weeklyData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="weekLabel" tick={{ fontSize: 10, fill: "#9ca3af" }} />
                      <YAxis tickFormatter={(v: number) => fmtAbbr(v)} tick={{ fontSize: 9, fill: "#9ca3af" }} width={44} />
                      <Tooltip formatter={(v: unknown) => [fmt(v as number) + "원", ""]} contentStyle={{ fontSize: 10, borderRadius: 6 }} />
                      <Bar dataKey="netAmount" fill="#3b82f6" radius={[3, 3, 0, 0]} name="순금액" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                    <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">주간별 상세</h3>
                  </div>
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="px-3 py-2 text-left text-gray-500 font-medium">주차 (월요일)</th>
                        <th className="px-3 py-2 text-right text-gray-500 font-medium">노출</th>
                        <th className="px-3 py-2 text-right text-gray-500 font-medium">클릭</th>
                        <th className="px-3 py-2 text-right text-gray-500 font-medium">CTR</th>
                        <th className="px-3 py-2 text-right text-gray-500 font-medium">집행금액</th>
                        <th className="px-3 py-2 text-right text-gray-500 font-medium">순금액</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {weeklyData.map(w => (
                        <tr key={w.week} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium text-gray-700 tabular-nums">{w.week}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-600">{fmt(w.impressions)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-600">{fmt(w.clicks)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-purple-600 font-medium">{w.ctr}%</td>
                          <td className="px-3 py-2 text-right tabular-nums text-blue-700 font-medium">{fmtAbbr(w.spend)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-600">{fmtAbbr(w.netAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 매체별 탭 */}
            {tab === "media" && (
              <div className="space-y-4">
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">매체별 집행금액</h3>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={mediaData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="media" tick={{ fontSize: 10, fill: "#9ca3af" }} />
                      <YAxis tickFormatter={(v: number) => fmtAbbr(v)} tick={{ fontSize: 9, fill: "#9ca3af" }} width={44} />
                      <Tooltip formatter={(v: unknown) => [fmt(v as number) + "원", ""]} contentStyle={{ fontSize: 10, borderRadius: 6 }} />
                      <Bar dataKey="netAmount" name="순금액" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="spend" name="집행금액" fill="#93c5fd" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                    <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">매체별 통계</h3>
                  </div>
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="px-3 py-2 text-left text-gray-500 font-medium">매체</th>
                        <th className="px-3 py-2 text-right text-gray-500 font-medium">집행일</th>
                        <th className="px-3 py-2 text-right text-gray-500 font-medium">노출</th>
                        <th className="px-3 py-2 text-right text-gray-500 font-medium">클릭</th>
                        <th className="px-3 py-2 text-right text-gray-500 font-medium">CTR</th>
                        <th className="px-3 py-2 text-right text-gray-500 font-medium">CPM</th>
                        <th className="px-3 py-2 text-right text-gray-500 font-medium">순금액</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {mediaData.map(m => (
                        <tr key={m.media} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium text-gray-700">{m.media}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-600">{m.activeDays}일</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-600">{fmt(m.impressions)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-600">{fmt(m.clicks)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-purple-600 font-medium">{m.ctr}%</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-500">{fmt(m.cpm)}원</td>
                          <td className="px-3 py-2 text-right tabular-nums text-blue-700 font-medium">{fmtAbbr(m.netAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
