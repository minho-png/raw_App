"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { generateDailyHtmlReport, downloadHtml } from "@/lib/htmlReportGenerator"
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts"
import type { RawRow, DmpType } from "@/lib/rawDataParser"
import type { MediaType } from "@/lib/reportTypes"
import { MEDIA_CONFIG } from "@/lib/reportTypes"
import type { Campaign } from "@/lib/campaignTypes"
import { calcDmpSettlement, calcCtr, calcCpc, DMP_FEE_RATES_PERCENT } from "@/lib/calculationService"
import { useMasterData } from "@/lib/hooks/useMasterData"
import { useReports } from "@/lib/hooks/useReports"
import type { SavedReport } from "@/lib/hooks/useReports"

const DMP_COLORS: Record<string, string> = {
  SKP: '#3B82F6', KB: '#EAB308', LOTTE: '#EF4444', TG360: '#F97316',
  BC: '#6B7280', SH: '#64748B', WIFI: '#14B8A6', HyperLocal: '#A855F7', DIRECT: '#9CA3AF',
}
const MEDIA_CHART_COLORS: Record<string, string> = {
  'Google': '#4285F4', '네이버 GFA': '#03C75A', '카카오모먼트': '#FAE100', 'META': '#0866FF',
}

function fmt(n: number) { return n.toLocaleString('ko-KR') }
function fmtPct(n: number) { return n.toFixed(2) + '%' }

export default function CtPlusReportPage() {
  const { campaigns } = useMasterData()
  const { reports: savedReports } = useReports()
  const [selectedReportIds, setSelectedReportIds] = useState<Set<string>>(new Set())
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [activeSection, setActiveSection] = useState<'summary' | 'daily' | 'dmp' | 'media' | 'creative' | 'video' | 'campaign'>('summary')
  const [printing, setPrinting] = useState(false)

  // savedReports가 로드되면 전체 선택으로 초기화
  useEffect(() => {
    if (savedReports.length > 0 && selectedReportIds.size === 0) {
      setSelectedReportIds(new Set(savedReports.map(r => r.id)))
    }
  }, [savedReports])

  // ── 선택된 리포트의 모든 RawRow 수집 ────────────────────────
  const allRows = useMemo<RawRow[]>(() => {
    const rows: RawRow[] = []
    for (const report of savedReports) {
      if (!selectedReportIds.has(report.id)) continue
      for (const mediaRows of Object.values(report.rowsByMedia)) {
        if (!mediaRows) continue
        for (const row of mediaRows) {
          if (dateFrom && row.date < dateFrom) continue
          if (dateTo   && row.date > dateTo)   continue
          rows.push(row)
        }
      }
    }
    return rows
  }, [savedReports, selectedReportIds, dateFrom, dateTo])

  // ── 전체 요약 KPI ─────────────────────────────────────────
  const summary = useMemo(() => {
    const totalImpressions = allRows.reduce((s, r) => s + r.impressions, 0)
    const totalClicks      = allRows.reduce((s, r) => s + r.clicks, 0)
    const totalCost        = allRows.reduce((s, r) => s + (r.executionAmount || r.grossCost), 0)
    const totalNet         = allRows.reduce((s, r) => s + (r.netAmount || r.netCost), 0)
    return {
      impressions: totalImpressions,
      clicks: totalClicks,
      ctr: calcCtr(totalClicks, totalImpressions),
      cpc: calcCpc(totalCost, totalClicks),
      cost: totalCost,
      net: totalNet,
    }
  }, [allRows])

  // ── 날짜별 일별 추이 ─────────────────────────────────────
  const dailyData = useMemo(() => {
    const map = new Map<string, { impressions: number; clicks: number; cost: number }>()
    for (const row of allRows) {
      const cur = map.get(row.date) ?? { impressions: 0, clicks: 0, cost: 0 }
      cur.impressions += row.impressions
      cur.clicks      += row.clicks
      cur.cost        += row.executionAmount || row.grossCost
      map.set(row.date, cur)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date: date.slice(5),  // MM-DD
        impressions: v.impressions,
        clicks: v.clicks,
        cost: v.cost,
        ctr: calcCtr(v.clicks, v.impressions),
        cpc: calcCpc(v.cost, v.clicks),
      }))
  }, [allRows])

  // ── DMP 정산 ────────────────────────────────────────────
  const dmpSettlement = useMemo(() => {
    return calcDmpSettlement(
      allRows.map(r => ({
        dmpType: (r.dmpType as DmpType) || 'DIRECT',
        executionAmount: r.executionAmount || r.grossCost,
        netAmount: r.netAmount || r.netCost,
      }))
    )
  }, [allRows])

  // ── 매체별 집계 ─────────────────────────────────────────
  const mediaData = useMemo(() => {
    const map = new Map<string, { impressions: number; clicks: number; cost: number }>()
    for (const row of allRows) {
      const cur = map.get(row.media) ?? { impressions: 0, clicks: 0, cost: 0 }
      cur.impressions += row.impressions
      cur.clicks      += row.clicks
      cur.cost        += row.executionAmount || row.grossCost
      map.set(row.media, cur)
    }
    return Array.from(map.entries()).map(([media, v]) => ({
      media,
      impressions: v.impressions,
      clicks: v.clicks,
      cost: v.cost,
      ctr: calcCtr(v.clicks, v.impressions),
      cpc: calcCpc(v.cost, v.clicks),
    }))
  }, [allRows])

  // ── 소재별 Top 10 ────────────────────────────────────────
  const creativeData = useMemo(() => {
    const map = new Map<string, { impressions: number; clicks: number; cost: number }>()
    for (const row of allRows) {
      if (!row.creativeName) continue
      const cur = map.get(row.creativeName) ?? { impressions: 0, clicks: 0, cost: 0 }
      cur.impressions += row.impressions
      cur.clicks      += row.clicks
      cur.cost        += row.executionAmount || row.grossCost
      map.set(row.creativeName, cur)
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({
        name,
        impressions: v.impressions,
        clicks: v.clicks,
        cost: v.cost,
        ctr: calcCtr(v.clicks, v.impressions),
        cpc: calcCpc(v.cost, v.clicks),
      }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10)
  }, [allRows])

  // ── 영상 성과 (views > 0인 행만) ────────────────────────────────
  const videoData = useMemo(() => {
    const map = new Map<string, { views: number; impressions: number; cost: number }>()
    for (const row of allRows) {
      if (!row.views) continue
      const cur = map.get(row.date) ?? { views: 0, impressions: 0, cost: 0 }
      cur.views       += row.views
      cur.impressions += row.impressions
      cur.cost        += row.executionAmount || row.grossCost
      map.set(row.date, cur)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date: date.slice(5),
        views: v.views,
        impressions: v.impressions,
        cost: v.cost,
        vtr: v.impressions > 0 ? (v.views / v.impressions) * 100 : 0,
        cpv: v.views > 0 ? Math.round(v.cost / v.views) : 0,
      }))
  }, [allRows])

  // ── CSV 캠페인별 집계 ────────────────────────────────────────────
  const campaignData = useMemo(() => {
    const map = new Map<string, { impressions: number; clicks: number; cost: number }>()
    for (const row of allRows) {
      const key = row.campaignName || '(미분류)'
      const cur = map.get(key) ?? { impressions: 0, clicks: 0, cost: 0 }
      cur.impressions += row.impressions
      cur.clicks      += row.clicks
      cur.cost        += row.executionAmount || row.grossCost
      map.set(key, cur)
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({
        name,
        impressions: v.impressions,
        clicks: v.clicks,
        cost: v.cost,
        ctr: calcCtr(v.clicks, v.impressions),
        cpc: calcCpc(v.cost, v.clicks),
      }))
      .sort((a, b) => b.cost - a.cost)
  }, [allRows])

  // ── CSV 계정별 집계 ──────────────────────────────────────────────
  const accountData = useMemo(() => {
    const map = new Map<string, { impressions: number; clicks: number; cost: number }>()
    for (const row of allRows) {
      const key = row.accountName || '(미분류)'
      const cur = map.get(key) ?? { impressions: 0, clicks: 0, cost: 0 }
      cur.impressions += row.impressions
      cur.clicks      += row.clicks
      cur.cost        += row.executionAmount || row.grossCost
      map.set(key, cur)
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({
        name,
        impressions: v.impressions,
        clicks: v.clicks,
        cost: v.cost,
        ctr: calcCtr(v.clicks, v.impressions),
        cpc: calcCpc(v.cost, v.clicks),
      }))
      .sort((a, b) => b.cost - a.cost)
  }, [allRows])

  function handlePrint() {
    setPrinting(true)
    setTimeout(() => {
      window.print()
      setPrinting(false)
    }, 200)
  }

  function handleHtmlDownload() {
    const selected = savedReports.filter(r => selectedReportIds.has(r.id))
    const campaignName = selected.length === 1 ? selected[0].campaignName : null
    const allDates = dailyData.map(d => d.date)
    const dateRange = allDates.length
      ? `${allDates[0]} ~ ${allDates[allDates.length - 1]}`
      : (dateFrom && dateTo ? `${dateFrom} ~ ${dateTo}` : "전체 기간")
    const html = generateDailyHtmlReport({
      dateRange,
      campaignName,
      summary: { ...summary, views: videoData.reduce((s, r) => s + r.views, 0) },
      dailyData: dailyData.map(d => ({ ...d, date: d.date })),
      dmpSettlement,
      mediaData,
      creativeData,
      videoData: videoData.length > 0 ? videoData : undefined,
      campaignBreakdown: campaignData.length > 0 ? campaignData : undefined,
      accountBreakdown: accountData.length > 0 ? accountData : undefined,
    })
    const name = `CT+_통합리포트_${new Date().toISOString().slice(0, 10)}.html`
    downloadHtml(html, name)
  }

  const SECTIONS = [
    { id: 'summary'  as const, label: '전체 KPI' },
    { id: 'daily'    as const, label: '일별 추이' },
    { id: 'dmp'      as const, label: 'DMP 정산' },
    { id: 'media'    as const, label: '매체별' },
    { id: 'creative' as const, label: '소재별' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      {/* 헤더 */}
      <header className="border-b border-gray-200 bg-white px-6 py-4 print:hidden">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-gray-900">통합 리포트</h1>
            <p className="text-xs text-gray-400 mt-0.5">캠페인 리포트 · CT+ · 통합 분석</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleHtmlDownload}
              disabled={allRows.length === 0}
              className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-40"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              HTML 다운로드
            </button>
            <button
              onClick={handlePrint}
              disabled={printing}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              인쇄 / PDF
            </button>
          </div>
        </div>
      </header>

      <div className="flex print:block">
        {/* 사이드 필터 */}
        <aside className="w-64 shrink-0 border-r border-gray-200 bg-white p-4 print:hidden min-h-screen">
          <div className="space-y-5">

            {/* 날짜 필터 */}
            <div>
              <p className="mb-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">기간 필터</p>
              <div className="space-y-2">
                <div>
                  <label className="text-[11px] text-gray-400">시작일</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={e => setDateFrom(e.target.value)}
                    className="mt-0.5 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-gray-400">종료일</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={e => setDateTo(e.target.value)}
                    className="mt-0.5 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {(dateFrom || dateTo) && (
                  <button
                    onClick={() => { setDateFrom(''); setDateTo('') }}
                    className="text-[11px] text-blue-600 hover:text-blue-700"
                  >
                    초기화
                  </button>
                )}
              </div>
            </div>

            {/* 리포트 선택 */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">리포트 선택</p>
                <div className="flex gap-1.5 text-[11px] text-blue-600">
                  <button onClick={() => setSelectedReportIds(new Set(savedReports.map(r => r.id)))}>전체</button>
                  <span className="text-gray-300">|</span>
                  <button onClick={() => setSelectedReportIds(new Set())}>해제</button>
                </div>
              </div>
              <div className="space-y-1">
                {savedReports.length === 0 ? (
                  <p className="text-xs text-gray-400">저장된 리포트 없음</p>
                ) : (
                  savedReports.map(r => (
                    <label key={r.id} className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedReportIds.has(r.id)}
                        onChange={e => {
                          const next = new Set(selectedReportIds)
                          if (e.target.checked) next.add(r.id)
                          else next.delete(r.id)
                          setSelectedReportIds(next)
                        }}
                        className="mt-0.5 h-3 w-3 rounded border-gray-300 text-blue-600"
                      />
                      <span className="text-[11px] text-gray-600 leading-tight">{r.label}</span>
                    </label>
                  ))
                )}
              </div>
            </div>

            {/* 섹션 네비 */}
            <div>
              <p className="mb-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">섹션</p>
              <nav className="space-y-0.5">
                {SECTIONS.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setActiveSection(s.id)}
                    className={`w-full rounded-lg px-3 py-1.5 text-left text-xs font-medium transition-colors ${
                      activeSection === s.id
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
                <button onClick={() => setActiveSection('video')}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors ${activeSection === 'video' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}>
                  영상 성과
                  {videoData.length > 0 && <span className="ml-1 text-[10px] text-green-600">({videoData.reduce((s,r)=>s+r.views,0).toLocaleString()}회)</span>}
                </button>
                <button onClick={() => setActiveSection('campaign')}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors ${activeSection === 'campaign' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}>
                  캠페인별
                  {campaignData.length > 0 && <span className="ml-1 text-[10px] text-gray-400">({campaignData.length})</span>}
                </button>
              </nav>
            </div>
          </div>
        </aside>

        {/* 본문 */}
        <main className="flex-1 p-6 space-y-6 print:p-0">
          {allRows.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white py-20 text-center">
              <svg className="mx-auto mb-3 h-10 w-10 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <p className="text-sm font-medium text-gray-500">아직 데이터가 없습니다</p>
              <p className="mt-1 text-xs text-gray-400">데일리 리포트를 입력하면 통합 분석 결과를 확인할 수 있습니다</p>
              <Link href="/campaign/ct-plus/daily" className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700">
                데일리 데이터 입력하기
              </Link>
            </div>
          ) : (
            <>
              {/* ── 1. 전체 요약 KPI ─────────────────────────── */}
              {(activeSection === 'summary') && (
                <section>
                  <h2 className="mb-4 text-sm font-semibold text-gray-800">전체 요약 KPI</h2>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                    {[
                      { label: '총 노출수',   value: fmt(summary.impressions),  sub: '' },
                      { label: '총 클릭수',   value: fmt(summary.clicks),       sub: '' },
                      { label: 'CTR',         value: fmtPct(summary.ctr),       sub: '' },
                      { label: 'CPC',         value: `${fmt(summary.cpc)}원`,   sub: '' },
                      { label: '집행 금액',   value: `${fmt(summary.cost)}원`,  sub: '마크업 포함' },
                      { label: '순 금액(NET)',value: `${fmt(summary.net)}원`,   sub: 'VAT 제외' },
                    ].map(card => (
                      <div key={card.label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                        <p className="text-xs text-gray-500">{card.label}</p>
                        <p className="mt-1 text-lg font-bold text-gray-900">{card.value}</p>
                        {card.sub && <p className="text-[11px] text-gray-400">{card.sub}</p>}
                      </div>
                    ))}
                  </div>

                  {/* 매체별 KPI 미니 표 */}
                  <div className="mt-6 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                    <div className="border-b border-gray-100 px-5 py-3">
                      <h3 className="text-sm font-semibold text-gray-700">매체별 요약</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-gray-100 bg-gray-50 text-gray-500">
                            <th className="px-4 py-2.5 text-left font-medium">매체</th>
                            <th className="px-4 py-2.5 text-right font-medium">노출</th>
                            <th className="px-4 py-2.5 text-right font-medium">클릭</th>
                            <th className="px-4 py-2.5 text-right font-medium">CTR</th>
                            <th className="px-4 py-2.5 text-right font-medium">CPC</th>
                            <th className="px-4 py-2.5 text-right font-medium">집행금액</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {mediaData.map(m => (
                            <tr key={m.media} className="hover:bg-gray-50">
                              <td className="px-4 py-2.5">
                                <span className="flex items-center gap-1.5">
                                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: MEDIA_CHART_COLORS[m.media] ?? '#6B7280' }} />
                                  <span className="font-medium text-gray-700">{m.media}</span>
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-right text-gray-600 tabular-nums">{fmt(m.impressions)}</td>
                              <td className="px-4 py-2.5 text-right text-gray-600 tabular-nums">{fmt(m.clicks)}</td>
                              <td className="px-4 py-2.5 text-right text-gray-600">{fmtPct(m.ctr)}</td>
                              <td className="px-4 py-2.5 text-right text-gray-600 tabular-nums">{fmt(m.cpc)}원</td>
                              <td className="px-4 py-2.5 text-right font-medium text-gray-800 tabular-nums">{fmt(m.cost)}원</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </section>
              )}

              {/* ── 2. 일별 추이 ─────────────────────────────── */}
              {activeSection === 'daily' && (
                <section>
                  <h2 className="mb-4 text-sm font-semibold text-gray-800">일별 성과 추이</h2>
                  <div className="grid gap-4 lg:grid-cols-2">
                    {/* 집행 금액 추이 */}
                    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                      <h3 className="mb-4 text-xs font-semibold text-gray-600">일별 집행 금액 (원)</h3>
                      <ResponsiveContainer width="100%" height={220}>
                        <LineChart data={dailyData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v/10000).toFixed(0)}만`} />
                          <Tooltip formatter={(v: unknown) => [`${fmt(Number(v))}원`, '집행금액']} />
                          <Line type="monotone" dataKey="cost" stroke="#3B82F6" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    {/* CTR / CPC 추이 */}
                    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                      <h3 className="mb-4 text-xs font-semibold text-gray-600">일별 CTR (%) / CPC (원)</h3>
                      <ResponsiveContainer width="100%" height={220}>
                        <LineChart data={dailyData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                          <YAxis yAxisId="ctr" tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
                          <YAxis yAxisId="cpc" orientation="right" tick={{ fontSize: 10 }} tickFormatter={v => `${(v/100).toFixed(0)}백`} />
                          <Tooltip />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Line yAxisId="ctr" type="monotone" dataKey="ctr" stroke="#10B981" strokeWidth={2} dot={false} name="CTR (%)" />
                          <Line yAxisId="cpc" type="monotone" dataKey="cpc" stroke="#F59E0B" strokeWidth={2} dot={false} name="CPC (원)" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    {/* 노출 / 클릭 */}
                    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-2">
                      <h3 className="mb-4 text-xs font-semibold text-gray-600">일별 노출수 / 클릭수</h3>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={dailyData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v/10000).toFixed(0)}만`} />
                          <Tooltip formatter={(v: unknown, name: unknown) => [fmt(Number(v)), name === 'impressions' ? '노출' : '클릭']} />
                          <Legend wrapperStyle={{ fontSize: 11 }} formatter={v => v === 'impressions' ? '노출' : '클릭'} />
                          <Bar dataKey="impressions" fill="#BFDBFE" radius={[2,2,0,0]} />
                          <Bar dataKey="clicks" fill="#3B82F6" radius={[2,2,0,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </section>
              )}

              {/* ── 3. DMP 정산 ──────────────────────────────── */}
              {activeSection === 'dmp' && (
                <section>
                  <h2 className="mb-4 text-sm font-semibold text-gray-800">DMP 정산 분석</h2>

                  {/* 경고 배너 */}
                  {dmpSettlement.verificationStatus === 'warning' && (
                    <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-700">
                      ⚠ 예산 대비 집행 금액 차이가 {dmpSettlement.diffPercentage.toFixed(1)}%입니다. 검토가 필요합니다.
                    </div>
                  )}

                  <div className="grid gap-4 lg:grid-cols-2">
                    {/* DMP 파이차트 */}
                    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                      <h3 className="mb-4 text-xs font-semibold text-gray-600">DMP별 집행 금액 비중</h3>
                      {dmpSettlement.rows.length === 0 ? (
                        <p className="text-center text-sm text-gray-400 py-10">DMP 데이터 없음</p>
                      ) : (
                        <ResponsiveContainer width="100%" height={240}>
                          <PieChart>
                            <Pie
                              data={dmpSettlement.rows.filter(r => r.totalExecution > 0)}
                              dataKey="totalExecution"
                              nameKey="dmpType"
                              cx="50%"
                              cy="50%"
                              outerRadius={90}
                              innerRadius={50}
                              label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(1)}%`}
                              labelLine={false}
                            >
                              {dmpSettlement.rows.filter(r => r.totalExecution > 0).map(r => (
                                <Cell key={r.dmpType} fill={DMP_COLORS[r.dmpType] ?? '#9CA3AF'} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(v: unknown) => `${fmt(Number(v))}원`} />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </div>

                    {/* DMP 정산 KPI 카드 */}
                    <div className="space-y-3">
                      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                        <p className="text-xs text-gray-500">총 집행 금액</p>
                        <p className="text-2xl font-bold text-gray-900">{fmt(dmpSettlement.totalExecution)}원</p>
                      </div>
                      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                        <p className="text-xs text-gray-500">총 순 금액 (NET)</p>
                        <p className="text-2xl font-bold text-gray-800">{fmt(dmpSettlement.totalNet)}원</p>
                      </div>
                      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
                        <p className="text-xs text-blue-600">총 DMP 정산 수수료</p>
                        <p className="text-2xl font-bold text-blue-700">{fmt(dmpSettlement.totalFee)}원</p>
                      </div>
                    </div>
                  </div>

                  {/* DMP 정산 테이블 */}
                  <div className="mt-4 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                    <div className="border-b border-gray-100 px-5 py-3">
                      <h3 className="text-sm font-semibold text-gray-700">DMP별 정산 내역</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-gray-100 bg-gray-50 text-gray-500">
                            <th className="px-4 py-2.5 text-left font-medium">DMP</th>
                            <th className="px-4 py-2.5 text-right font-medium">건수</th>
                            <th className="px-4 py-2.5 text-right font-medium">집행 금액</th>
                            <th className="px-4 py-2.5 text-right font-medium">순 금액(NET)</th>
                            <th className="px-4 py-2.5 text-right font-medium">수수료율</th>
                            <th className="px-4 py-2.5 text-right font-medium">정산 수수료</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {dmpSettlement.rows.map(r => (
                            <tr key={r.dmpType} className="hover:bg-gray-50">
                              <td className="px-4 py-2.5">
                                <span
                                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
                                  style={{ backgroundColor: DMP_COLORS[r.dmpType] ?? '#6B7280' }}
                                >
                                  {r.dmpType}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-right text-gray-500 tabular-nums">{fmt(r.rowCount)}</td>
                              <td className="px-4 py-2.5 text-right text-gray-700 tabular-nums">{fmt(r.totalExecution)}원</td>
                              <td className="px-4 py-2.5 text-right text-gray-700 tabular-nums">{fmt(r.totalNet)}원</td>
                              <td className="px-4 py-2.5 text-right text-gray-500">{r.feeRate}%</td>
                              <td className="px-4 py-2.5 text-right font-semibold text-blue-700 tabular-nums">
                                {r.feeAmount > 0 ? `${fmt(r.feeAmount)}원` : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                            <td colSpan={2} className="px-4 py-2.5 text-gray-700">합계</td>
                            <td className="px-4 py-2.5 text-right text-gray-800 tabular-nums">{fmt(dmpSettlement.totalExecution)}원</td>
                            <td className="px-4 py-2.5 text-right text-gray-800 tabular-nums">{fmt(dmpSettlement.totalNet)}원</td>
                            <td className="px-4 py-2.5"></td>
                            <td className="px-4 py-2.5 text-right text-blue-700 tabular-nums">{fmt(dmpSettlement.totalFee)}원</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </section>
              )}

              {/* ── 4. 매체별 성과 ────────────────────────────── */}
              {activeSection === 'media' && (
                <section>
                  <h2 className="mb-4 text-sm font-semibold text-gray-800">매체별 성과 비교</h2>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                      <h3 className="mb-4 text-xs font-semibold text-gray-600">매체별 집행 금액 비중</h3>
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie
                            data={mediaData.filter(m => m.cost > 0)}
                            dataKey="cost"
                            nameKey="media"
                            cx="50%"
                            cy="50%"
                            outerRadius={90}
                            label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0)*100).toFixed(0)}%`}
                            labelLine={false}
                          >
                            {mediaData.filter(m => m.cost > 0).map(m => (
                              <Cell key={m.media} fill={MEDIA_CHART_COLORS[m.media] ?? '#9CA3AF'} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v: unknown) => `${fmt(Number(v))}원`} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                      <h3 className="mb-4 text-xs font-semibold text-gray-600">매체별 CTR 비교 (%)</h3>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={mediaData} layout="vertical" margin={{ left: 60, right: 16 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
                          <YAxis type="category" dataKey="media" tick={{ fontSize: 10 }} width={60} />
                          <Tooltip formatter={(v: unknown) => `${Number(v).toFixed(2)}%`} />
                          <Bar dataKey="ctr" fill="#3B82F6" radius={[0,2,2,0]}>
                            {mediaData.map(m => (
                              <Cell key={m.media} fill={MEDIA_CHART_COLORS[m.media] ?? '#9CA3AF'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </section>
              )}

              {/* ── 5. 소재별 Top 10 ────────────────────────── */}
              {activeSection === 'creative' && (
                <section>
                  <h2 className="mb-4 text-sm font-semibold text-gray-800">소재별 성과 Top 10</h2>
                  <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-gray-100 bg-gray-50 text-gray-500">
                            <th className="px-4 py-2.5 text-left font-medium w-8">#</th>
                            <th className="px-4 py-2.5 text-left font-medium">소재명</th>
                            <th className="px-4 py-2.5 text-right font-medium">노출</th>
                            <th className="px-4 py-2.5 text-right font-medium">클릭</th>
                            <th className="px-4 py-2.5 text-right font-medium">CTR</th>
                            <th className="px-4 py-2.5 text-right font-medium">CPC</th>
                            <th className="px-4 py-2.5 text-right font-medium">집행금액</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {creativeData.map((c, i) => (
                            <tr key={c.name} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
                              <td className="px-4 py-2.5 text-gray-400 font-mono">{i + 1}</td>
                              <td className="px-4 py-2.5 text-gray-700 max-w-xs">
                                <span className="block truncate" title={c.name}>{c.name || '—'}</span>
                              </td>
                              <td className="px-4 py-2.5 text-right text-gray-600 tabular-nums">{fmt(c.impressions)}</td>
                              <td className="px-4 py-2.5 text-right text-gray-600 tabular-nums">{fmt(c.clicks)}</td>
                              <td className="px-4 py-2.5 text-right text-gray-600">{fmtPct(c.ctr)}</td>
                              <td className="px-4 py-2.5 text-right text-gray-600 tabular-nums">{fmt(c.cpc)}원</td>
                              <td className="px-4 py-2.5 text-right font-medium text-gray-800 tabular-nums">{fmt(c.cost)}원</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                    <h3 className="mb-4 text-xs font-semibold text-gray-600">소재별 집행금액 (Top 10)</h3>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={creativeData} layout="vertical" margin={{ left: 160, right: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `${(v/10000).toFixed(0)}만`} />
                        <YAxis
                          type="category"
                          dataKey="name"
                          tick={{ fontSize: 10 }}
                          width={160}
                          tickFormatter={v => v.length > 20 ? v.slice(0, 20) + '…' : v}
                        />
                        <Tooltip formatter={(v: unknown) => `${fmt(Number(v))}원`} />
                        <Bar dataKey="cost" fill="#3B82F6" radius={[0,2,2,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>
              )}

          {/* ── 영상 성과 ─────────────────────────────────────── */}
          {activeSection === 'video' && (
            <div>
              <h2 className="text-sm font-semibold text-gray-800 mb-4">영상 성과</h2>
              {videoData.length === 0 ? (
                <p className="text-sm text-gray-400">영상 재생 데이터가 없습니다. (총재생 컬럼이 0인 경우)</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-gray-200">
                      <th className="py-2 px-3 text-left text-gray-500 font-medium">날짜</th>
                      <th className="py-2 px-3 text-right text-gray-500 font-medium">재생수</th>
                      <th className="py-2 px-3 text-right text-gray-500 font-medium">노출</th>
                      <th className="py-2 px-3 text-right text-gray-500 font-medium">VTR</th>
                      <th className="py-2 px-3 text-right text-gray-500 font-medium">집행금액</th>
                      <th className="py-2 px-3 text-right text-gray-500 font-medium">CPV</th>
                    </tr></thead>
                    <tbody>
                      {videoData.map(r => (
                        <tr key={r.date} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-2 px-3 font-mono">{r.date}</td>
                          <td className="py-2 px-3 text-right">{fmt(r.views)}</td>
                          <td className="py-2 px-3 text-right">{fmt(r.impressions)}</td>
                          <td className="py-2 px-3 text-right">{fmtPct(r.vtr)}</td>
                          <td className="py-2 px-3 text-right">{fmt(r.cost)}원</td>
                          <td className="py-2 px-3 text-right">{fmt(r.cpv)}원</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr className="border-t border-gray-300 font-semibold bg-gray-50">
                      <td className="py-2 px-3">합계</td>
                      <td className="py-2 px-3 text-right">{fmt(videoData.reduce((s,r)=>s+r.views,0))}</td>
                      <td className="py-2 px-3 text-right">{fmt(videoData.reduce((s,r)=>s+r.impressions,0))}</td>
                      <td className="py-2 px-3 text-right">—</td>
                      <td className="py-2 px-3 text-right">{fmt(videoData.reduce((s,r)=>s+r.cost,0))}원</td>
                      <td className="py-2 px-3 text-right">—</td>
                    </tr></tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── 캠페인별 / 계정별 ───────────────────────────────── */}
          {activeSection === 'campaign' && (
            <div className="space-y-8">
              {campaignData.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold text-gray-800 mb-4">캠페인별 성과</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="border-b border-gray-200">
                        <th className="py-2 px-3 text-left text-gray-500 font-medium">캠페인명 (CSV)</th>
                        <th className="py-2 px-3 text-right text-gray-500 font-medium">노출</th>
                        <th className="py-2 px-3 text-right text-gray-500 font-medium">클릭</th>
                        <th className="py-2 px-3 text-right text-gray-500 font-medium">CTR</th>
                        <th className="py-2 px-3 text-right text-gray-500 font-medium">CPC</th>
                        <th className="py-2 px-3 text-right text-gray-500 font-medium">집행금액</th>
                      </tr></thead>
                      <tbody>
                        {campaignData.map(r => (
                          <tr key={r.name} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="py-2 px-3 max-w-[200px] truncate" title={r.name}>{r.name}</td>
                            <td className="py-2 px-3 text-right">{fmt(r.impressions)}</td>
                            <td className="py-2 px-3 text-right">{fmt(r.clicks)}</td>
                            <td className="py-2 px-3 text-right">{fmtPct(r.ctr)}</td>
                            <td className="py-2 px-3 text-right">{fmt(r.cpc)}원</td>
                            <td className="py-2 px-3 text-right">{fmt(r.cost)}원</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {accountData.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold text-gray-800 mb-4">계정별 성과</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="border-b border-gray-200">
                        <th className="py-2 px-3 text-left text-gray-500 font-medium">계정명 (CSV)</th>
                        <th className="py-2 px-3 text-right text-gray-500 font-medium">노출</th>
                        <th className="py-2 px-3 text-right text-gray-500 font-medium">클릭</th>
                        <th className="py-2 px-3 text-right text-gray-500 font-medium">CTR</th>
                        <th className="py-2 px-3 text-right text-gray-500 font-medium">CPC</th>
                        <th className="py-2 px-3 text-right text-gray-500 font-medium">집행금액</th>
                      </tr></thead>
                      <tbody>
                        {accountData.map(r => (
                          <tr key={r.name} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="py-2 px-3">{r.name}</td>
                            <td className="py-2 px-3 text-right">{fmt(r.impressions)}</td>
                            <td className="py-2 px-3 text-right">{fmt(r.clicks)}</td>
                            <td className="py-2 px-3 text-right">{fmtPct(r.ctr)}</td>
                            <td className="py-2 px-3 text-right">{fmt(r.cpc)}원</td>
                            <td className="py-2 px-3 text-right">{fmt(r.cost)}원</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {campaignData.length === 0 && accountData.length === 0 && (
                <p className="text-sm text-gray-400">캠페인명/계정명 데이터가 없습니다. 최신 CSV로 다시 파싱하면 표시됩니다.</p>
              )}
            </div>
          )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}
