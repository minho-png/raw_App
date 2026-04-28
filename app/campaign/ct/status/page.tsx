"use client"

import { useMemo, useState } from "react"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts"
import { useMotivSettlementCampaignsByProduct } from "@/lib/hooks/useMotivSettlementCampaigns"
import { useMotivAssignments } from "@/lib/hooks/useMotivAssignments"
import { useMotivAdAccounts } from "@/lib/hooks/useMotivAdAccounts"
import { useMotivAgencies } from "@/lib/hooks/useMotivAgencies"
import { useMasterData } from "@/lib/hooks/useMasterData"
import { MotivSettlementTable } from "@/components/settlement/MotivSettlementTable"
import { motivTypeToProduct } from "@/lib/motivApi/productMapping"
import type { MotivCampaign } from "@/lib/motivApi/types"

// ── 타입 ────────────────────────────────────────────────────
type Category = 'total' | 'display' | 'video' | 'partners'

const CATEGORY_LABEL: Record<Category, string> = {
  total: '전체',
  display: 'DISPLAY',
  video: 'VIDEO',
  partners: 'PARTNERS',
}

function fmt(n: number): string { return Math.round(n).toLocaleString('ko-KR') }
function fmtAbbr(n: number): string {
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}억`
  if (n >= 10000)     return `${(n / 10000).toFixed(0)}만`
  return fmt(n)
}

// Motiv 캠페인 → 카테고리 추출 (CTV 페이지와 동일 패턴)
function categoryOf(c: MotivCampaign): Exclude<Category, 'total'> | null {
  const t = c.campaign_type
  if (t === 'DISPLAY')  return 'display'
  if (t === 'VIDEO')    return 'video'
  if (t === 'PARTNERS') return 'partners'
  return null
}

// 합계용 메트릭
interface Metrics {
  impressions: number
  clicks: number
  spend: number
  agencyFee: number
  dataFee: number
  revenue: number
}
const ZERO: Metrics = { impressions: 0, clicks: 0, spend: 0, agencyFee: 0, dataFee: 0, revenue: 0 }

function metricsOf(c: MotivCampaign): Metrics {
  const s = c.stats
  if (!s) return ZERO
  return {
    impressions: Number(s.win ?? 0) + Number(s.v_impression ?? 0),
    clicks:      Number(s.click ?? 0),
    spend:       Number(s.cost ?? 0),
    agencyFee:   Number(s.agency_fee ?? 0),
    dataFee:     Number(s.data_fee ?? 0),
    revenue:     Number(s.revenue ?? s.cost ?? 0),
  }
}

function sumMetrics(arr: MotivCampaign[]): Metrics {
  return arr.reduce((acc, c) => {
    const m = metricsOf(c)
    return {
      impressions: acc.impressions + m.impressions,
      clicks:      acc.clicks      + m.clicks,
      spend:       acc.spend       + m.spend,
      agencyFee:   acc.agencyFee   + m.agencyFee,
      dataFee:     acc.dataFee     + m.dataFee,
      revenue:     acc.revenue     + m.revenue,
    }
  }, { ...ZERO })
}

// ─────────────────────────────────────────────────────────────

export default function CtStatusPage() {
  const [category, setCategory] = useState<Category>('total')

  const { agencies, advertisers, operators } = useMasterData()
  const { data: assignments, upsert: upsertAssignment } = useMotivAssignments()
  const { byId: adAccountById } = useMotivAdAccounts()
  const { byId: motivAgencyById } = useMotivAgencies()

  // CT 전체 (DISPLAY + VIDEO + PARTNERS) Motiv API
  const motivCt = useMotivSettlementCampaignsByProduct('CT', undefined, true)

  const filtered = useMemo(() => {
    if (category === 'total') return motivCt.data
    return motivCt.data.filter(c => categoryOf(c) === category)
  }, [motivCt.data, category])

  const totals = useMemo(() => sumMetrics(filtered), [filtered])
  const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0
  const cpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0
  const profit = totals.revenue - totals.spend - totals.agencyFee - totals.dataFee
  const profitRate = totals.revenue > 0 ? (profit / totals.revenue) * 100 : 0

  // 카테고리별 비중 (스택 차트)
  const byCategoryChart = useMemo(() => {
    const rows: { category: string; spend: number; revenue: number; profit: number }[] = []
    for (const cat of ['display', 'video', 'partners'] as const) {
      const subset = motivCt.data.filter(c => categoryOf(c) === cat)
      const m = sumMetrics(subset)
      rows.push({
        category: CATEGORY_LABEL[cat],
        spend: m.spend,
        revenue: m.revenue,
        profit: m.revenue - m.spend - m.agencyFee - m.dataFee,
      })
    }
    return rows
  }, [motivCt.data])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-base font-semibold text-gray-900">CT 캠페인 현황</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Motiv 운영데스크 API 실시간 데이터 · CT (DISPLAY · VIDEO · PARTNERS)
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
            {(['total', 'display', 'video', 'partners'] as Category[]).map(cat => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  category === cat ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {CATEGORY_LABEL[cat]}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="p-6 space-y-6">
        {motivCt.error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
            Motiv API 오류: {motivCt.error}
          </div>
        )}

        {/* KPI 카드 */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {[
            { label: '캠페인 수',   value: `${filtered.length}건` },
            { label: '노출(impr.)', value: fmtAbbr(totals.impressions) },
            { label: '클릭(click)', value: fmtAbbr(totals.clicks) },
            { label: 'CTR',         value: `${ctr.toFixed(2)}%` },
            { label: 'CPC',         value: `₩${fmt(cpc)}` },
            { label: '집행금액',    value: `₩${fmtAbbr(totals.spend)}`,  blue: true },
            { label: '매출',        value: `₩${fmtAbbr(totals.revenue)}`, blue: true },
          ].map(({ label, value, blue }) => (
            <div key={label} className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</p>
              <p className={`mt-1 text-base font-bold tabular-nums ${blue ? 'text-blue-700' : 'text-gray-900'}`}>{value}</p>
            </div>
          ))}
        </section>

        {/* 비중 차트 */}
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-800">카테고리별 매출·집행·이익</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={byCategoryChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="category" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={v => fmtAbbr(Number(v))} tick={{ fontSize: 10 }} width={50} />
              <Tooltip formatter={(v) => `₩${fmt(Math.round(Number(v ?? 0)))}`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="revenue" name="매출"     stroke="#3b82f6" strokeWidth={2} />
              <Line type="monotone" dataKey="spend"   name="집행금액" stroke="#ef4444" strokeWidth={2} />
              <Line type="monotone" dataKey="profit"  name="이익"     stroke="#10b981" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </section>

        {/* 수익성 요약 */}
        <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Card label="대행 수수료 (agency_fee)" value={`₩${fmtAbbr(totals.agencyFee)}`} sub="Motiv 응답 stats.agency_fee 합계" />
          <Card label="DMP 비용 (data_fee)"     value={`₩${fmtAbbr(totals.dataFee)}`}   sub="Motiv 응답 stats.data_fee 합계" />
          <Card label="이익 / 이익률"          value={`₩${fmtAbbr(profit)} (${profitRate.toFixed(2)}%)`}
                sub="(매출 − 집행 − 수수료 − DMP) ÷ 매출" highlight />
        </section>

        {/* 정산 지정 — Motiv 캠페인 리스트 + 일괄 매핑 */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-800">정산 지정 (CT 캠페인)</h2>
          <p className="text-[11px] text-gray-500">
            여기서 지정한 대행사·광고주·운영자 정보가 매입/매출 현황 / 계산서 발급에 자동 반영됩니다.
          </p>
          <MotivSettlementTable
            title="CT 캠페인 (DISPLAY · VIDEO · PARTNERS)"
            loading={motivCt.loading}
            error={motivCt.error}
            campaigns={filtered}
            exchangeRate={motivCt.exchangeRate}
            agencies={agencies}
            advertisers={advertisers}
            operators={operators}
            assignments={assignments}
            onUpsertAssignment={upsertAssignment}
            adAccountById={adAccountById}
            motivAgencyById={motivAgencyById}
          />
        </section>
      </main>
    </div>
  )
}

function Card({ label, value, sub, highlight }: { label: string; value: string; sub: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border ${highlight ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 bg-white'} p-4 shadow-sm`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1.5 text-xl font-bold tabular-nums ${highlight ? 'text-emerald-700' : 'text-gray-900'}`}>{value}</p>
      <p className="mt-1 text-[10px] text-gray-400">{sub}</p>
    </div>
  )
}
