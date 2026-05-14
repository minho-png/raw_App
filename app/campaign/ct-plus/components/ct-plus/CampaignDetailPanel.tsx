"use client"
import React, { useMemo } from "react"
import { useRouter } from "next/navigation"
import {
  LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from "recharts"
import {
  Campaign, Operator, Agency, Advertiser,
  getMediaTotals, getCampaignTotals, getCampaignProgress, getDday,
} from "@/lib/campaignTypes"
import type { RawRow } from "@/lib/rawDataParser"
import { fmt, spendRateStyle, getDailySuggestion } from "./statusUtils"
import { mColor } from "@/lib/mediaColors"
import { MetricCard as DetailKPICard } from "@/components/atoms/MetricCard"

// ── raw 내보내기 헬퍼 ──────────────────────────────────────────
// 사용자 결정 — 노출 / 클릭 / 캠페인 소재 / 매체 / 마크업단가 컬럼.
// 마크업단가 = 노출당 grossCost (executionAmount/impressions) — 매체사 단가 의미.
const RAW_EXPORT_HEADERS = ['매체', '캠페인명', '소재명', '노출', '클릭', '마크업단가'] as const

function rowsToExportMatrix(rows: RawRow[]): (string | number)[][] {
  const m: (string | number)[][] = []
  for (const r of rows) {
    const cpm = r.impressions > 0 ? Math.round((r.executionAmount ?? 0) / r.impressions * 1000) / 1000 : 0
    m.push([
      r.media,
      r.campaignName,
      r.creativeName ?? '',
      r.impressions,
      r.clicks,
      cpm,
    ])
  }
  return m
}

function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60)
}

async function copyRawToClipboard(campaignName: string, rows: RawRow[]): Promise<boolean> {
  const matrix = rowsToExportMatrix(rows)
  const lines = [
    RAW_EXPORT_HEADERS.join('\t'),
    ...matrix.map(r => r.join('\t')),
  ]
  const text = lines.join('\n')
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

async function downloadRawXlsx(campaignName: string, rows: RawRow[]): Promise<void> {
  const XLSX = await import('xlsx')
  const aoa: (string | number)[][] = [[...RAW_EXPORT_HEADERS], ...rowsToExportMatrix(rows)]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'raw')
  XLSX.writeFile(wb, `${safeFileName(campaignName)}_raw.xlsx`)
}

function fmtAbbr(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`
  if (n >= 10_000)      return `${(n / 10_000).toFixed(0)}만`
  return fmt(n)
}

// DetailKPICard 통합 구현은 components/atoms/MetricCard.tsx 단일 source 사용.
// variant="bordered" 가 기존 시각(회색 박스 + 텍스트 색만) 과 동일.

export function CampaignDetailPanel({
  campaign, operators, agencies, advertisers, rawRows, onClose, onEdit, onUpdate,
}: {
  campaign: Campaign
  operators: Operator[]
  agencies: Agency[]
  advertisers: Advertiser[]
  rawRows: RawRow[]
  onClose: () => void
  onEdit: (c: Campaign) => void
  onUpdate?: (c: Campaign) => void
}) {
  // UX-08: 상세 분석 버튼 클릭 후 페이지 전환까지 약간 지연이 있어 사용자가 재클릭하는 문제 해소.
  const [navigatingDetail, setNavigatingDetail] = React.useState(false)
  // raw export 복사 토스트 — 외부 toast 컴포넌트 없이 inline 표시.
  const [exportToast, setExportToast] = React.useState<string | null>(null)
  const [dashboardInput, setDashboardInput] = React.useState<string>(
    campaign.dashboardNetAmount != null ? String(campaign.dashboardNetAmount) : ""
  )
  // 이 캠페인에 매핑된 raw rows
  const router = useRouter()
  const campRows = useMemo(
    () => rawRows.filter(r => r.matchedCampaignId === campaign.id),
    [rawRows, campaign.id]
  )

  // 매체별 집계
  const byMedia = useMemo(() => {
    const map = new Map<string, { rows: number; impressions: number; clicks: number; views: number; executionAmount: number; netAmount: number }>()
    for (const r of campRows) {
      const cur = map.get(r.media) ?? { rows: 0, impressions: 0, clicks: 0, views: 0, executionAmount: 0, netAmount: 0 }
      cur.rows++
      cur.impressions    += r.impressions
      cur.clicks         += r.clicks
      cur.views          += r.views ?? 0
      cur.executionAmount += r.executionAmount ?? 0
      cur.netAmount      += r.netAmount ?? 0
      map.set(r.media, cur)
    }
    return map
  }, [campRows])

  // 일자별 × 매체별 LineChart 데이터
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

  // 매체별 KPI 목표 달성률 (CPC/CTR/CPM/VTR — mediaBudget 에 target 설정된 항목만)
  //   higher-better (CTR/VTR): rate = actual / target * 100
  //   lower-better  (CPC/CPM): rate = target / actual * 100
  type KpiRow = {
    media: string
    metric: 'CTR' | 'CPC' | 'CPM' | 'VTR'
    target: number
    actual: number
    rate: number | null      // null = 실적 0 으로 계산 불가
    good: boolean
    unit: '%' | '원'
    lowerBetter: boolean
    diffLabel: string
  }
  const kpiRowsByMedia = useMemo<KpiRow[]>(() => {
    const out: KpiRow[] = []
    for (const mb of campaign.mediaBudgets) {
      const agg = byMedia.get(mb.media)
      const imp = agg?.impressions ?? 0
      const clk = agg?.clicks ?? 0
      const vws = agg?.views ?? 0
      const spd = agg?.executionAmount ?? 0
      const ctrActual = imp > 0 ? +(clk / imp * 100).toFixed(2) : 0
      const vtrActual = imp > 0 ? +(vws / imp * 100).toFixed(2) : 0
      const cpcActual = clk > 0 ? Math.round(spd / clk) : 0
      const cpmActual = imp > 0 ? Math.round(spd / imp * 1000) : 0

      const push = (
        metric: KpiRow['metric'], target: number | null | undefined, actual: number,
        unit: '%' | '원', lowerBetter: boolean,
      ) => {
        if (target == null || target === 0) return
        let rate: number | null = null
        if (lowerBetter) {
          rate = actual > 0 ? +(target / actual * 100).toFixed(1) : null
        } else {
          rate = +(actual / target * 100).toFixed(1)
        }
        const good = rate !== null && rate >= 100
        let diffLabel = ''
        if (unit === '%') {
          const dp = +(actual - target).toFixed(2)
          diffLabel = `${dp >= 0 ? '+' : ''}${dp.toFixed(2)}%p`
        } else {
          if (lowerBetter) {
            const saved = Math.round(target - actual)
            diffLabel = actual <= 0 ? '실적 없음'
              : saved >= 0 ? `₩${fmt(saved)} 절감` : `₩${fmt(Math.abs(saved))} 초과`
          } else {
            const diff = Math.round(actual - target)
            diffLabel = `${diff >= 0 ? '+' : ''}${fmt(diff)}`
          }
        }
        out.push({ media: mb.media, metric, target, actual, rate, good, unit, lowerBetter, diffLabel })
      }

      push('CTR', mb.ctrTarget, ctrActual, '%', false)
      push('VTR', mb.vtrTarget, vtrActual, '%', false)
      push('CPC', mb.cpcTarget, cpcActual, '원', true)
      push('CPM', mb.cpmTarget, cpmActual, '원', true)
    }
    return out
  }, [campaign.mediaBudgets, byMedia])

  // ── KPI 표 / 차트용 가공 데이터 ────────────────────────
  // 매체 × KPI 매트릭스. 사용자 요청: 상단 표(KPI 수치) + 하단 세로 막대(달성률)
  type KpiMetric = 'CTR' | 'VTR' | 'CPC' | 'CPM'
  const KPI_METRICS: KpiMetric[] = ['CTR', 'VTR', 'CPC', 'CPM']
  const kpiMatrix = useMemo(() => {
    const byMediaMap = new Map<string, Partial<Record<KpiMetric, KpiRow>>>()
    for (const r of kpiRowsByMedia) {
      const m = byMediaMap.get(r.media) ?? {}
      m[r.metric] = r
      byMediaMap.set(r.media, m)
    }
    return [...byMediaMap.entries()]
      .map(([media, kpis]) => ({ media, kpis }))
      .sort((a, b) => a.media.localeCompare(b.media))
  }, [kpiRowsByMedia])

  // 어느 KPI 가 어느 매체에든 한 번이라도 등장하면 표 컬럼으로 노출
  const visibleKpiCols = useMemo<KpiMetric[]>(
    () => KPI_METRICS.filter(k => kpiMatrix.some(r => r.kpis[k])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kpiMatrix],
  )

  // KPI 별 차트 데이터 — 목표 vs 실적 절대값 비교 (단위가 KPI 마다 달라 차트 분리)
  //   CTR/VTR : % 단위 (0~100 범위)
  //   CPC/CPM : 원 단위 (수백~수만)
  // 각 KPI 차트마다 매체 별로 [목표 막대, 실적 막대] 표시.
  const kpiChartGroups = useMemo(
    () => visibleKpiCols.map(k => {
      const unit: '%' | '원' = (k === 'CTR' || k === 'VTR') ? '%' : '원'
      const data = kpiMatrix
        .map(({ media, kpis }) => {
          const r = kpis[k]
          if (!r) return null
          return { media, 목표: r.target, 실적: r.actual, good: r.good, rate: r.rate }
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)
      return { metric: k, unit, data }
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kpiMatrix, visibleKpiCols],
  )

  const KPI_COLOR: Record<KpiMetric, string> = {
    CTR: '#3b82f6',  // blue
    VTR: '#a855f7',  // violet
    CPC: '#10b981',  // green
    CPM: '#f59e0b',  // amber
  }

  function fmtAxis(unit: '%' | '원'): (v: number) => string {
    if (unit === '%') return (v: number) => `${v}%`
    return (v: number) => v >= 10_000 ? `${(v / 10_000).toFixed(0)}만` : `${v.toLocaleString('ko-KR')}`
  }
  function fmtTooltip(unit: '%' | '원'): (v: unknown) => string {
    return (v: unknown) => {
      const n = Number(v ?? 0)
      return unit === '%' ? `${n.toFixed(2)}%` : `₩${n.toLocaleString('ko-KR')}`
    }
  }

  const totals   = getCampaignTotals(campaign)
  const progress = getCampaignProgress(campaign.startDate, campaign.endDate)
  const dday     = getDday(campaign.endDate)

  // 소진율: raw CSV 데이터 기반.
  // R1 통일: 상세 분석 페이지(status/[id]/page.tsx)의 aggRows().spend(=executionAmount 합)
  //          기준으로 분자를 executionAmount 합으로 변경 — 모달/상세 KPI 정합 확보.
  const rawExecTotal = [...byMedia.values()].reduce((s, m) => s + m.executionAmount, 0)
  const rawSpendRate = totals.totalSettingCost > 0
    ? Math.round((rawExecTotal / totals.totalSettingCost) * 1000) / 10
    : 0
  const sc  = spendRateStyle(rawSpendRate)
  const lag = progress - rawSpendRate

  // 실 소진율: 대시보드 직접 입력 기반 (2차 검증)
  const actualNetTotal     = campaign.mediaBudgets.reduce((s, mb) => s + (mb.actualNetAmount     ?? 0), 0)
  const actualSettingTotal = campaign.mediaBudgets.reduce((s, mb) => s + (mb.actualSettingCost   ?? 0), 0)
  const actualSpendRate    = actualSettingTotal > 0
    ? Math.round((actualNetTotal / actualSettingTotal) * 1000) / 10
    : 0
  const spendRateDiff    = Math.abs(rawSpendRate - actualSpendRate)
  const showActualWarning = actualNetTotal > 0 && spendRateDiff >= 15

  const opName  = operators.find(o => o.id === campaign.managerId)?.name    ?? "-"
  const agN     = agencies.find(a => a.id === campaign.agencyId)?.name      ?? "-"
  const advN    = advertisers.find(a => a.id === campaign.advertiserId)?.name ?? "-"

  const byMediaArr = [...byMedia.entries()]

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden pointer-events-auto">

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
            <DetailKPICard variant="bordered" label="부킹 금액"  value={fmt(totals.totalBudget) + "원"} />
            <DetailKPICard variant="bordered" label="세팅 금액"  value={fmt(totals.totalSettingCost) + "원"} />
            <DetailKPICard variant="bordered" label="집행 금액 (CSV)"  value={fmt(rawExecTotal) + "원"}
              color={rawSpendRate > 100 ? "red" : "blue"} />
            <DetailKPICard variant="bordered" label="미소진 잔액"
              value={fmt(Math.max(0, totals.totalSettingCost - rawExecTotal)) + "원"} />
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
            {/* 리포트 소진율 (CSV 기반) — 바 위 말풍선으로 지연/빠름 */}
            {(() => {
              const barW = Math.min(rawSpendRate, 100)
              const bubbleLeft = Math.min(Math.max(barW, 8), 92)
              const showBubble = campRows.length > 0 && Math.abs(lag) >= 5
              return (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-gray-600">리포트 소진율</span>
                    <span className={`text-xs font-semibold ${sc.text}`}>{rawSpendRate.toFixed(1)}%</span>
                  </div>
                  <div className="relative pt-7">
                    {showBubble && (
                      <div className="absolute top-0" style={{ left: `${bubbleLeft}%`, transform: "translateX(-50%)" }}>
                        <div className={`relative px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${
                          lag > 0 ? "bg-orange-500 text-white" : "bg-green-500 text-white"
                        }`}>
                          {lag > 0 ? `${lag.toFixed(1)}%p 지연` : `${Math.abs(lag).toFixed(1)}%p 빠름`}
                          <div className={`absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent ${
                            lag > 0 ? "border-t-orange-500" : "border-t-green-500"
                          }`} />
                        </div>
                      </div>
                    )}
                    <div className="h-2 w-full rounded-full bg-gray-200">
                      <div className={`h-full rounded-full transition-all ${sc.bar}`} style={{ width: `${barW}%` }} />
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* 대시보드 소진율 — 직접 입력된 금액 기반, DB 저장 */}
            {(() => {
              const dashAmt = parseFloat(dashboardInput) || 0
              const dashRate = totals.totalSettingCost > 0
                ? Math.round((dashAmt / totals.totalSettingCost) * 1000) / 10
                : 0
              const dashSc = spendRateStyle(dashRate)
              const dashLag = progress - dashRate
              const barW = Math.min(dashRate, 100)
              const bubbleLeft = Math.min(Math.max(barW, 8), 92)
              const showBubble = dashAmt > 0 && Math.abs(dashLag) >= 5
              return (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-gray-600">대시보드 소진율</span>
                    <span className={`text-xs font-semibold ${dashSc.text}`}>{dashRate}%</span>
                  </div>
                  <div className="relative pt-7">
                    {showBubble && (
                      <div className="absolute top-0" style={{ left: `${bubbleLeft}%`, transform: "translateX(-50%)" }}>
                        <div className={`relative px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${
                          dashLag > 0 ? "bg-orange-500 text-white" : "bg-green-500 text-white"
                        }`}>
                          {dashLag > 0 ? `${dashLag.toFixed(1)}%p 지연` : `${Math.abs(dashLag).toFixed(1)}%p 빠름`}
                          <div className={`absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent ${
                            dashLag > 0 ? "border-t-orange-500" : "border-t-green-500"
                          }`} />
                        </div>
                      </div>
                    )}
                    <div className="h-2 w-full rounded-full bg-gray-200">
                      <div className={`h-full rounded-full transition-all ${dashSc.bar}`} style={{ width: `${barW}%` }} />
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-gray-600 whitespace-nowrap">대시보드 소진액:</span>
                    <input
                      type="number" min="0"
                      value={dashboardInput}
                      onChange={e => {
                        const v = e.target.value
                        setDashboardInput(v)
                        const num = parseFloat(v)
                        onUpdate?.({ ...campaign, dashboardNetAmount: Number.isFinite(num) && num > 0 ? num : undefined })
                      }}
                      placeholder="금액 입력 (원)"
                      className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                  </div>
                </div>
              )
            })()}
            {showActualWarning && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs">
                <span className="font-semibold text-red-700">⚠ 실 소진율 차이 {spendRateDiff.toFixed(1)}%p</span>
                <span className="text-red-600 ml-1">(CSV: {rawSpendRate.toFixed(1)}% vs 실입력: {actualSpendRate.toFixed(1)}%)</span>
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

          {/* 매체별 KPI — 상단: 수치 매트릭스 표 / 하단: 매체별 세로 막대 차트 */}
          {kpiMatrix.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
              <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">매체별 KPI 목표 달성률</h3>

              {/* ── 상단: KPI 수치 매트릭스 표 ───────────────────── */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">매체</th>
                      {visibleKpiCols.map(k => (
                        <th key={k} className="px-3 py-2 text-right font-semibold" style={{ color: KPI_COLOR[k] }}>
                          {k}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {kpiMatrix.map(({ media, kpis }) => (
                      <tr key={media} className="hover:bg-gray-50">
                        <td className="px-3 py-2" style={{ borderLeft: `3px solid ${mColor(media)}` }}>
                          <span className="font-medium" style={{ color: mColor(media) }}>{media}</span>
                        </td>
                        {visibleKpiCols.map(k => {
                          const r = kpis[k]
                          if (!r) return <td key={k} className="px-3 py-2 text-right text-gray-300">—</td>
                          const noData = r.rate === null
                          const targetTxt = r.unit === '원' ? `₩${fmt(r.target)}` : `${r.target.toFixed(2)}%`
                          const actualTxt = noData ? '실적 없음'
                            : r.unit === '원' ? `₩${fmt(r.actual)}` : `${r.actual.toFixed(2)}%`
                          return (
                            <td key={k} className="px-3 py-2 text-right">
                              <div className="text-[10px] text-gray-400">목표 {targetTxt}</div>
                              <div className="font-medium text-blue-700">{actualTxt}</div>
                              <div className={`text-[10px] font-semibold ${noData ? 'text-gray-300' : r.good ? 'text-green-600' : 'text-orange-500'}`}>
                                {noData ? '-' : `${r.rate}%`}
                                <span className="ml-1 text-[9px] font-normal text-gray-400">{r.diffLabel}</span>
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ── 하단: KPI 별 목표 vs 실적 미니 차트 그리드 ───── */}
              <div className="pt-2 border-t border-gray-100">
                <div className="flex items-baseline justify-between mb-2">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">목표 vs 실적</p>
                  <p className="text-[9px] text-gray-300">KPI 별 단위에 맞춰 매체별 비교</p>
                </div>
                <div className={`grid gap-3 ${
                  kpiChartGroups.length === 1 ? 'grid-cols-1'
                    : kpiChartGroups.length === 2 ? 'grid-cols-1 sm:grid-cols-2'
                    : 'grid-cols-1 sm:grid-cols-2'
                }`}>
                  {kpiChartGroups.map(({ metric, unit, data }) => {
                    const color = KPI_COLOR[metric]
                    return (
                      <div key={metric} className="rounded-lg border border-gray-100 bg-gray-50/40 p-2">
                        <div className="flex items-baseline justify-between mb-1.5 px-1">
                          <span className="text-[11px] font-semibold" style={{ color }}>{metric}</span>
                          <span className="text-[9px] text-gray-400">단위: {unit}</span>
                        </div>
                        <ResponsiveContainer width="100%" height={150}>
                          <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                            barCategoryGap="30%" barGap={2}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                            <XAxis dataKey="media" tick={{ fontSize: 9, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                            <YAxis
                              tickFormatter={fmtAxis(unit)}
                              tick={{ fontSize: 8, fill: '#9ca3af' }}
                              axisLine={false} tickLine={false} width={36}
                            />
                            <Tooltip
                              formatter={fmtTooltip(unit)}
                              contentStyle={{ fontSize: 10, borderRadius: 6, border: '1px solid #e5e7eb' }}
                            />
                            <Legend iconType="circle" iconSize={6} wrapperStyle={{ fontSize: 9 }} />
                            <Bar dataKey="목표" fill="#cbd5e1" radius={[3, 3, 0, 0]} maxBarSize={32} />
                            <Bar dataKey="실적" radius={[3, 3, 0, 0]} maxBarSize={32}>
                              {data.map((row, idx) => (
                                // lowerBetter(CPC/CPM) 는 실적 < 목표 가 좋음, 그 외는 실적 >= 목표 가 좋음.
                                // good 플래그가 이미 그 정책 반영됨.
                                <Cell key={idx} fill={row.good ? color : `${color}66`} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )
                  })}
                </div>
              </div>
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

          {/* 등록 데이터 vs raw 데이터 비교 검증 */}
          {campRows.length > 0 && campaign.mediaBudgets.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                <h3 className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">
                  세팅 vs 실적 검증
                </h3>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  등록 세팅금액 대비 raw 순집행 비교
                </p>
              </div>
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-3 py-2 text-left text-gray-500 font-medium">매체</th>
                    <th className="px-3 py-2 text-right text-gray-500 font-medium">세팅금액</th>
                    <th className="px-3 py-2 text-right text-gray-500 font-medium">raw 순집행</th>
                    <th className="px-3 py-2 text-right text-gray-500 font-medium">차이</th>
                    <th className="px-3 py-2 text-right text-gray-500 font-medium">소진율</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {campaign.mediaBudgets.map(mb => {
                    const t        = getMediaTotals(mb)
                    const rows     = campRows.filter(r => r.media === mb.media)
                    const rawNet   = Math.round(rows.reduce((s, r) => s + (r.netAmount ?? 0), 0))
                    const diff     = rawNet - t.totalSettingCost
                    const rate     = t.totalSettingCost > 0
                      ? Math.round((rawNet / t.totalSettingCost) * 1000) / 10 : 0
                    const overSpend = diff > 0
                    const noData    = rows.length === 0
                    return (
                      <tr key={mb.media} className={`hover:bg-gray-50 ${overSpend ? "bg-red-50/40" : ""}`}>
                        <td className="px-3 py-2 font-medium" style={{ borderLeft: `3px solid ${mColor(mb.media)}`, color: mColor(mb.media) }}>{mb.media}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-600">{fmtAbbr(t.totalSettingCost)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium text-blue-700">
                          {noData ? <span className="text-gray-300 font-normal">없음</span> : fmtAbbr(rawNet)}
                        </td>
                        <td className={`px-3 py-2 text-right tabular-nums text-[11px] ${overSpend ? "text-red-600 font-semibold" : noData ? "text-gray-300" : "text-green-600"}`}>
                          {noData ? "-" : (overSpend ? "+" : "") + fmtAbbr(diff)}
                        </td>
                        <td className={`px-3 py-2 text-right tabular-nums font-semibold ${
                          noData ? "text-gray-300" : overSpend ? "text-red-600" : rate >= 80 ? "text-green-600" : rate >= 50 ? "text-blue-600" : "text-gray-500"
                        }`}>
                          {noData ? "-" : `${rate}%`}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
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
        <div className="border-t border-gray-100 px-5 py-3 flex items-center justify-between gap-2 flex-wrap">
          <button
            onClick={() => {
              if (navigatingDetail) return
              setNavigatingDetail(true)
              router.push(`/campaign/ct-plus/status/${campaign.id}`)
            }}
            disabled={navigatingDetail}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              navigatingDetail
                ? 'border-purple-200 bg-purple-100 text-purple-400 cursor-wait'
                : 'border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-100'
            }`}
          >
            {navigatingDetail && (
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
                <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            )}
            {navigatingDetail ? '이동 중…' : '상세 분석'}
          </button>
          <div className="flex items-center gap-2">
            {exportToast && (
              <span className="text-[11px] text-emerald-600 font-medium">{exportToast}</span>
            )}
            <button
              onClick={async () => {
                const ok = await copyRawToClipboard(campaign.campaignName, campRows)
                setExportToast(ok ? '클립보드에 복사됨' : '복사 실패')
                setTimeout(() => setExportToast(null), 2000)
              }}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              title="매체 / 캠페인명 / 소재 / 노출 / 클릭 / 마크업단가 컬럼을 TSV 로 복사 (엑셀에 붙여넣기 가능)"
            >
              raw 복사
            </button>
            <button
              onClick={() => downloadRawXlsx(campaign.campaignName, campRows)}
              className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
              title="raw 데이터를 Excel(.xlsx) 파일로 다운로드"
            >
              Excel 다운로드
            </button>
            <button
              onClick={() => onEdit(campaign)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              캠페인 수정
            </button>
          </div>
        </div>
      </div>
      </div>
    </>
  )
}
