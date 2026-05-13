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
import { getAdvertiserName, getAgencyDisplayName } from "@/lib/motivApi/advertiserHelpers"
import { useMotivStatsDaily } from "@/lib/hooks/useMotivStatsDaily"
import { DailyCostChart } from "@/components/analysis/DailyCostChart"

type Category = 'total' | 'display' | 'video'

const TYPE_LABEL: Record<UnifiedCampaignSnapshot['uiType'], string> = {
  display:  '디스플레이',
  video:    '동영상',
  partners: '파트너스',
  ctv:      'CTV',
}
const TYPE_COLOR: Record<UnifiedCampaignSnapshot['uiType'], string> = {
  display:  'bg-blue-50 text-blue-600',
  video:    'bg-purple-50 text-purple-600',
  partners: 'bg-amber-50 text-amber-700',
  ctv:      'bg-green-50 text-green-600',
}

const f = (n: number) => Math.round(n).toLocaleString('ko-KR')
function fmtMonth(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }

export default function CtAnalysisPage() {
  const [month, setMonth]               = useState<string>(fmtMonth(new Date()))
  const [category, setCategory]         = useState<Category>('total')
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings]         = useState<AnalysisSettings>(DEFAULT_ANALYSIS_SETTINGS)

  // ── 데이터 소스 ──────────────────────────────────────────
  const { agencies, advertisers, operators } = useMasterData()
  const motiv = useMotivSettlementCampaignsByProduct('CT', month)
  const { data: assignments, upsert: upsertAssignment } = useMotivAssignments()
  const { byId: adAccountById }   = useMotivAdAccounts()
  const { byId: motivAgencyById } = useMotivAgencies()
  const { byMotivId: yesterdayStats, snapshot } = useMotivDailySnapshot()
  const yesterdayAvailable = snapshot !== null && yesterdayStats.size > 0

  // MotivCampaign → UnifiedCampaignSnapshot (전일 스냅샷 + 광고주 매핑)
  // P1: getAdvertiserName / getAgencyDisplayName 헬퍼로 fallback chain 적용
  const snapshots: UnifiedCampaignSnapshot[] = useMemo(() => {
    return motiv.data
      .filter(c => !isExcludedCampaign(c.title ?? ''))
      .map(c => {
        const adAccount = adAccountById.get(c.adaccount_id)
        const motivAgency = adAccount?.agency_id ? motivAgencyById.get(adAccount.agency_id) : undefined
        const agencyName = getAgencyDisplayName(motivAgency)
        const advertiserName = getAdvertiserName(adAccount)
        const yStats = yesterdayStats.get(c.id)
        return motivCampaignToSnapshot(
          c, agencyName,
          yStats ? motivStatsToMetrics(yStats) : undefined,
          advertiserName,
        )
      })
  }, [motiv.data, adAccountById, motivAgencyById, yesterdayStats])

  // 카테고리 필터 (PARTNERS 는 합계에만 포함)
  const filtered = useMemo(() => {
    if (category === 'total') return snapshots
    return snapshots.filter(s => s.uiType === category)
  }, [snapshots, category])

  // 합계
  const sumT        = useMemo(() => aggregateMetrics(filtered.map(s => s.today)),     [filtered])
  const sumY        = useMemo(() => aggregateMetrics(filtered.map(s => s.yesterday)), [filtered])
  const totalBudget = useMemo(() => filtered.reduce((a, c) => a + c.budget, 0), [filtered])
  const showVTR = category === 'video'

  // P3: 일별 비용 추세 — month 의 시작·종료일을 startDate/endDate 로
  const monthRange = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    if (!y || !m) return { start: '', end: '' }
    const first = new Date(y, m - 1, 1)
    const last  = new Date(y, m,     0)
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { start: fmt(first), end: fmt(last) }
  }, [month])
  const filteredCampaignIds = useMemo(() => filtered.map(s => s.motivId), [filtered])
  const statsDaily = useMotivStatsDaily({
    scope: { campaignIds: filteredCampaignIds },
    startDate: monthRange.start,
    endDate:   monthRange.end,
    enabled:   filteredCampaignIds.length > 0,
  })

  // 카테고리 별 캠페인 수 (탭 배지)
  const countByCategory = useMemo(() => ({
    total:   snapshots.length,
    display: snapshots.filter(s => s.uiType === 'display').length,
    video:   snapshots.filter(s => s.uiType === 'video').length,
  }), [snapshots])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-base font-semibold text-gray-900">CT 매체 분석</h1>
            <p className="text-xs text-gray-400 mt-0.5">자체 DA 매체 (DISPLAY / VIDEO / PARTNERS) · MOTIV API 실시간</p>
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
        {showSettings && <SettingsPanel settings={settings} onChange={setSettings} variant="CT" />}

        {/* 카테고리 토글 */}
        <div className="flex items-center gap-1.5">
          {(['total', 'display', 'video'] as const).map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
                category === c ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {c === 'total' ? '총 합계' : TYPE_LABEL[c]}
              <span className="ml-1.5 opacity-70">({countByCategory[c]})</span>
            </button>
          ))}
          {category === 'total' && (
            <span className="ml-2 text-[11px] text-gray-400">
              ※ 합계에는 PARTNERS 포함
            </span>
          )}
        </div>

        {/* KPI 카드 */}
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
              benchmarkMin={category === 'video' ? settings.videoProfitMin : settings.displayProfitMin}
              yesterdayMissing={!yesterdayAvailable}
            />
            {showVTR && (
              <KpiCard
                label="VTR (완료율)"
                todayVal={calcVTR(sumT)}
                yestVal={calcVTR(sumY)}
                threshold={5}
                note="평균 기준: 75~80%"
                benchmarkMin={settings.videoVtrMin}
                yesterdayMissing={!yesterdayAvailable}
              />
            )}
          </div>
        </section>

        {/* 요약 통계 */}
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <SummaryCard label="총 노출" value={f(sumT.impressions)} />
          <SummaryCard label="총 클릭" value={f(sumT.clicks)} />
          <SummaryCard label="총 소진금액" value={`₩${f(sumT.spend)}`} />
          <SummaryCard label="총 매체비용" value={`₩${f(sumT.mediaCost)}`} />
        </section>

        {/* P2: 비용 분해 (MOTIV stats — cost = 매체비 + 대행수수료 + DMP수수료 + 이익) */}
        <section className="rounded-xl border border-gray-200 bg-white px-5 py-4">
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-xs font-semibold text-gray-700">비용 분해</h3>
            <span className="text-[10px] text-gray-400">MOTIV stats 기준</span>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <CostBreakdownCell label="매체비"      value={sumT.mediaCost} total={sumT.spend} tone="blue"   />
            <CostBreakdownCell label="대행 수수료" value={sumT.agencyFee} total={sumT.spend} tone="purple" />
            <CostBreakdownCell label="DMP 수수료"  value={sumT.dmpFee}    total={sumT.spend} tone="amber"  />
            <CostBreakdownCell label="이익"
              value={Math.max(0, sumT.spend - sumT.mediaCost - sumT.agencyFee - sumT.dmpFee)}
              total={sumT.spend} tone="green" />
          </div>
        </section>

        {/* P3: 일별 비용 추세 (MOTIV /stats/daily) */}
        <section>
          <DailyCostChart data={statsDaily.data} loading={statsDaily.loading} error={statsDaily.error} />
        </section>

        {/* 캠페인 테이블 */}
        <section className="rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-gray-900">
              캠페인 목록
              <span className="ml-2 text-[11px] font-normal text-gray-400">{filtered.length}건</span>
            </h2>
          </div>
          {motiv.loading ? (
            <div className="p-6 text-center text-xs text-gray-400">로딩 중…</div>
          ) : motiv.error ? (
            <div className="p-6 text-center text-xs text-red-500">MOTIV API 오류: {motiv.error}</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-xs text-gray-400">해당 월에 데이터가 없습니다.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr className="text-gray-500">
                    <th className="px-3 py-2 text-left font-medium">상태</th>
                    <th className="px-3 py-2 text-left font-medium">캠페인</th>
                    <th className="px-3 py-2 text-left font-medium">유형</th>
                    <th className="px-3 py-2 text-left font-medium">광고주</th>
                    <th className="px-3 py-2 text-left font-medium">대행사</th>
                    <th className="px-3 py-2 text-right font-medium">예산</th>
                    <th className="px-3 py-2 text-right font-medium">소진</th>
                    <th className="px-3 py-2 text-right font-medium">CTR</th>
                    <th className="px-3 py-2 text-right font-medium">수익률</th>
                    <th className="px-3 py-2 text-center font-medium">D-day</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(c => {
                    const alerts = buildAlerts(c, settings, { yesterdayMissing: !yesterdayAvailable })
                    const dd = dDay(c.endDate)
                    return (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2"><AlertIcon msgs={alerts} /></td>
                        <td className="px-3 py-2 font-medium text-gray-800">{c.name}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${TYPE_COLOR[c.uiType]}`}>
                            {TYPE_LABEL[c.uiType]}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-700 font-medium">{c.advertiser}</td>
                        <td className="px-3 py-2 text-gray-600">{c.agency}</td>
                        <td className="px-3 py-2 text-right text-gray-700">₩{f(c.budget)}</td>
                        <td className="px-3 py-2 text-right text-gray-700">₩{f(c.today.spend)}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{c.ctr.toFixed(2)}%</td>
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

        {/* 정산 테이블 (MOTIV → 내부 Agency 자동 매칭) */}
        <section className="space-y-2 mt-8">
          <MotivSettlementTable
            title="CT 정산 지정"
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

// P2: 비용 분해 셀 — 금액 + 총소진 대비 비율(%) + 진행바
function CostBreakdownCell({
  label, value, total, tone,
}: {
  label: string
  value: number
  total: number
  tone: 'blue' | 'purple' | 'amber' | 'green'
}) {
  const pct = total > 0 ? Math.round((value / total) * 1000) / 10 : 0
  const barCls = tone === 'blue' ? 'bg-blue-400'
    : tone === 'purple' ? 'bg-purple-400'
    : tone === 'amber'  ? 'bg-amber-400'
    : 'bg-green-400'
  const textCls = tone === 'blue' ? 'text-blue-700'
    : tone === 'purple' ? 'text-purple-700'
    : tone === 'amber'  ? 'text-amber-700'
    : 'text-green-700'
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
      <p className="text-[10px] text-gray-500 font-medium mb-0.5">{label}</p>
      <p className={`text-sm font-bold tabular-nums ${textCls}`}>₩{value.toLocaleString('ko-KR')}</p>
      <div className="mt-1.5 h-1 rounded-full bg-gray-200 overflow-hidden">
        <div className={`h-full rounded-full ${barCls}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <p className="mt-0.5 text-[10px] text-gray-400 text-right tabular-nums">{pct.toFixed(1)}%</p>
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
