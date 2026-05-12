"use client"

import { useMemo, useState } from "react"
import { useMasterData } from "@/lib/hooks/useMasterData"
import { useMotivSettlementCampaignsByProduct } from "@/lib/hooks/useMotivSettlementCampaigns"
import { useMotivAssignments } from "@/lib/hooks/useMotivAssignments"
import { useMotivAdAccounts } from "@/lib/hooks/useMotivAdAccounts"
import { useMotivAgencies } from "@/lib/hooks/useMotivAgencies"
import { useMotivDailySnapshot } from "@/lib/hooks/useMotivDailySnapshot"
import { MotivSettlementTable } from "@/components/settlement/MotivSettlementTable"
import { KpiCard } from "@/components/analysis/KpiCard"
import { AlertIcon } from "@/components/analysis/AlertIcon"
import { SettingsPanel } from "@/components/analysis/SettingsPanel"
import { buildAlerts, dDay } from "@/components/analysis/alertEngine"
import { DEFAULT_ANALYSIS_SETTINGS, type AnalysisSettings } from "@/components/analysis/types"
import {
  motivCampaignToSnapshot,
  motivStatsToMetrics,
  aggregateMetrics,
  calcCTR, calcSR, calcPR, calcVTR,
  type UnifiedCampaignSnapshot,
} from "@/lib/motivApi/statsMapper"
import { isExcludedCampaign } from "@/lib/motivApi/productMapping"

const f = (n: number) => Math.round(n).toLocaleString('ko-KR')
function fmtMonth(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }

// CTV(TV) 매체 분석 — Motiv API 의 campaign_type='TV' 캠페인만.
// AUD-005 fix: 이전에는 mock 데이터로 채워져 있었으나 실 MOTIV 데이터 연결.
export default function CtCtvAnalysisPage() {
  const [month, setMonth]               = useState<string>(fmtMonth(new Date()))
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings]         = useState<AnalysisSettings>(DEFAULT_ANALYSIS_SETTINGS)

  // ── 데이터 소스 ──────────────────────────────────────────
  const { agencies, advertisers, operators } = useMasterData()
  const motiv = useMotivSettlementCampaignsByProduct('CTV', month)
  const { data: assignments, upsert: upsertAssignment } = useMotivAssignments()
  const { byId: adAccountById }   = useMotivAdAccounts()
  const { byId: motivAgencyById } = useMotivAgencies()
  const { byMotivId: yesterdayStats, snapshot } = useMotivDailySnapshot()
  const yesterdayAvailable = snapshot !== null && yesterdayStats.size > 0

  // MotivCampaign → UnifiedCampaignSnapshot
  const snapshots: UnifiedCampaignSnapshot[] = useMemo(() => {
    return motiv.data
      .filter(c => !isExcludedCampaign(c.title ?? ''))
      .map(c => {
        const adAccount = adAccountById.get(c.adaccount_id)
        const motivAgency = adAccount?.agency_id ? motivAgencyById.get(adAccount.agency_id) : undefined
        const agencyName = motivAgency?.name ?? '—'
        const yStats = yesterdayStats.get(c.id)
        return motivCampaignToSnapshot(c, agencyName, yStats ? motivStatsToMetrics(yStats) : undefined)
      })
  }, [motiv.data, adAccountById, motivAgencyById, yesterdayStats])

  // 합계
  const sumT        = useMemo(() => aggregateMetrics(snapshots.map(s => s.today)),     [snapshots])
  const sumY        = useMemo(() => aggregateMetrics(snapshots.map(s => s.yesterday)), [snapshots])
  const totalBudget = useMemo(() => snapshots.reduce((a, c) => a + c.budget, 0), [snapshots])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-base font-semibold text-gray-900">CTV 매체 분석</h1>
            <p className="text-xs text-gray-400 mt-0.5">TV 매체 (Connected TV) · MOTIV API 실시간</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700 focus:border-blue-400 focus:outline-none"
            />
            {yesterdayAvailable ? (
              <span className="rounded-full bg-green-50 px-2.5 py-1 text-[11px] text-green-700 font-medium">
                전일 스냅샷 {snapshot?.date} 연결됨
              </span>
            ) : (
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] text-amber-700 font-medium">
                전일 스냅샷 없음 — cron 1회 이상 실행 후 표시
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowSettings(v => !v)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                showSettings ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              기준 수치 설정
            </button>
          </div>
        </div>
      </header>

      <main className="p-6 space-y-5">
        {showSettings && <SettingsPanel settings={settings} onChange={setSettings} variant="CTV" />}

        {/* KPI 카드 — TV 단일이라 카테고리 토글 없음 */}
        <section>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard
              label="CTR (클릭률)"
              todayVal={calcCTR(sumT.clicks, sumT.impressions)}
              yestVal={calcCTR(sumY.clicks, sumY.impressions)}
              threshold={settings.ctrDiff}
              yesterdayMissing={!yesterdayAvailable}
            />
            <KpiCard
              label="소진금액률"
              todayVal={calcSR(sumT.spend, totalBudget)}
              yestVal={calcSR(sumY.spend, totalBudget)}
              threshold={settings.spendRateDiff}
              yesterdayMissing={!yesterdayAvailable}
            />
            <KpiCard
              label="수익률"
              todayVal={calcPR(sumT)}
              yestVal={calcPR(sumY)}
              threshold={settings.profitRateDiff}
              benchmarkMin={settings.videoProfitMin}
              yesterdayMissing={!yesterdayAvailable}
            />
            <KpiCard
              label="VTR (완료율)"
              todayVal={calcVTR(sumT)}
              yestVal={calcVTR(sumY)}
              threshold={5}
              note="평균 기준: 95% 이상"
              benchmarkMin={settings.ctvVtrMin}
              yesterdayMissing={!yesterdayAvailable}
            />
          </div>
        </section>

        {/* 요약 통계 */}
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <SummaryCard label="총 노출" value={f(sumT.impressions)} />
          <SummaryCard label="완료 시청" value={f(sumT.completedViews)} />
          <SummaryCard label="총 소진금액" value={`₩${f(sumT.spend)}`} />
          <SummaryCard label="총 매체비용" value={`₩${f(sumT.mediaCost)}`} />
        </section>

        {/* 캠페인 테이블 */}
        <section className="rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-gray-900">
              CTV 캠페인 목록
              <span className="ml-2 text-[11px] font-normal text-gray-400">{snapshots.length}건</span>
            </h2>
          </div>
          {motiv.loading ? (
            <div className="p-6 text-center text-xs text-gray-400">로딩 중…</div>
          ) : motiv.error ? (
            <div className="p-6 text-center text-xs text-red-500">MOTIV API 오류: {motiv.error}</div>
          ) : snapshots.length === 0 ? (
            <div className="p-6 text-center text-xs text-gray-400">해당 월에 데이터가 없습니다.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr className="text-gray-500">
                    <th className="px-3 py-2 text-left font-medium">상태</th>
                    <th className="px-3 py-2 text-left font-medium">캠페인</th>
                    <th className="px-3 py-2 text-left font-medium">대행사</th>
                    <th className="px-3 py-2 text-right font-medium">예산</th>
                    <th className="px-3 py-2 text-right font-medium">소진</th>
                    <th className="px-3 py-2 text-right font-medium">노출</th>
                    <th className="px-3 py-2 text-right font-medium">VTR</th>
                    <th className="px-3 py-2 text-right font-medium">수익률</th>
                    <th className="px-3 py-2 text-center font-medium">D-day</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {snapshots.map(c => {
                    const alerts = buildAlerts(c, settings, { yesterdayMissing: !yesterdayAvailable })
                    const dd = dDay(c.endDate)
                    return (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2"><AlertIcon msgs={alerts} /></td>
                        <td className="px-3 py-2 font-medium text-gray-800">{c.name}</td>
                        <td className="px-3 py-2 text-gray-600">{c.agency}</td>
                        <td className="px-3 py-2 text-right text-gray-700">₩{f(c.budget)}</td>
                        <td className="px-3 py-2 text-right text-gray-700">₩{f(c.today.spend)}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{f(c.today.impressions)}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{calcVTR(c.today).toFixed(2)}%</td>
                        <td className="px-3 py-2 text-right text-gray-700">{c.profitRate.toFixed(2)}%</td>
                        <td className={`px-3 py-2 text-center ${dd.color}`}>{dd.label}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 정산 테이블 */}
        <section className="space-y-2 mt-8">
          <MotivSettlementTable
            title="CTV 정산 지정"
            loading={motiv.loading}
            error={motiv.error}
            campaigns={motiv.data.filter(c => !isExcludedCampaign(c.title ?? ''))}
            exchangeRate={motiv.exchangeRate}
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

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
      <p className="text-[11px] font-medium text-gray-400 mb-1">{label}</p>
      <p className="text-xl font-bold text-gray-900">{value}</p>
    </div>
  )
}
