"use client"

import { useMemo, useEffect } from "react"
import { useFilterPersistence } from "@/lib/hooks/useFilterPersistence"
import { FilterToggle, FilterDateRange } from "@/components/atoms/filters"
import { useMasterData } from "@/lib/hooks/useMasterData"
import { useMotivSettlementCampaignsByProduct } from "@/lib/hooks/useMotivSettlementCampaigns"
import { useMotivAssignments } from "@/lib/hooks/useMotivAssignments"
import { useMotivAdAccounts } from "@/lib/hooks/useMotivAdAccounts"
import { useMotivAgencies } from "@/lib/hooks/useMotivAgencies"
import { useMotivDailySnapshot } from "@/lib/hooks/useMotivDailySnapshot"
import { MotivSettlementTable } from "@/components/settlement/MotivSettlementTable"
import { KpiCard } from "@/components/analysis/KpiCard"
import { SummaryCard } from "@/components/molecules/SummaryCard"
import { AlertIcon } from "@/components/analysis/AlertIcon"
import { SettingsPanel } from "@/components/analysis/SettingsPanel"
import { StatsRawDiagnostic, type RawStatsCampaign } from "@/components/analysis/StatsRawDiagnostic"
import { buildAlerts, dDay } from "@/components/analysis/alertEngine"
import { DEFAULT_ANALYSIS_SETTINGS, type AnalysisSettings } from "@/components/analysis/types"
import {
  motivCampaignToSnapshot,
  motivStatsToMetrics,
  aggregateMetrics,
  calcCTR, calcSR, calcPR, calcVTR,
  type UnifiedCampaignSnapshot,
} from "@/lib/motivApi/statsMapper"
import { getAdvertiserName, getAgencyDisplayName } from "@/lib/motivApi/advertiserHelpers"
import { useMotivStatsDaily } from "@/lib/hooks/useMotivStatsDaily"
import { useMotivStatsCampaign } from "@/lib/hooks/useMotivStatsCampaign"
import { pacingStatus, pacingToneClasses } from "@/lib/motivApi/pacingHelper"
import { useRefreshControl } from "@/lib/hooks/useRefreshControl"
import { RefreshControlBar } from "@/components/molecules/RefreshControl"
import { DailyCostChart } from "@/components/analysis/DailyCostChart"
import { isExcludedCampaign } from "@/lib/motivApi/productMapping"

const f = (n: number) => Math.round(n).toLocaleString('ko-KR')
function fmtDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function todayStr() { return fmtDate(new Date()) }
function addDays(s: string, n: number): string {
  const d = new Date(s); d.setDate(d.getDate() + n); return fmtDate(d)
}
function monthStart(s: string): string {
  const d = new Date(s); return fmtDate(new Date(d.getFullYear(), d.getMonth(), 1))
}
function monthEnd(s: string): string {
  const d = new Date(s); return fmtDate(new Date(d.getFullYear(), d.getMonth() + 1, 0))
}

// CTV(TV) 매체 분석 — Motiv API 의 campaign_type='TV' 캠페인만.
// AUD-005 fix: 이전에는 mock 데이터로 채워져 있었으나 실 MOTIV 데이터 연결.
export default function CtCtvAnalysisPage() {
  // 일자 범위 — 기본: 시작=종료=오늘 (당일). sessionStorage 영속화.
  const [rangeStart, setRangeStart] = useFilterPersistence<string>('ctv-analysis:rangeStart', todayStr())
  const [rangeEnd, setRangeEnd]     = useFilterPersistence<string>('ctv-analysis:rangeEnd',   todayStr())
  const [showSettings, setShowSettings] = useFilterPersistence<boolean>('ctv-analysis:showSettings', false)
  const [showStatsDiagnostic, setShowStatsDiagnostic] = useFilterPersistence<boolean>('ctv-analysis:showStatsDiagnostic', false)
  const [settings, setSettings]         = useFilterPersistence<AnalysisSettings>('ctv-analysis:settings', DEFAULT_ANALYSIS_SETTINGS)
  // 활성 캠페인(status='Y') 필터 — 당일 단일 모드일 때 기본 ON, 그 외 OFF.
  const [activeOnly, setActiveOnly] = useFilterPersistence<boolean>('ctv-analysis:activeOnly', true)

  // ── 실시간 갱신 제어 ────────────────────────────────────
  const refreshControl = useRefreshControl()
  const refreshKey = refreshControl.key

  // ── 데이터 소스 ──────────────────────────────────────────
  const { agencies, advertisers, operators } = useMasterData()
  const motiv = useMotivSettlementCampaignsByProduct('CTV',
    { dateRange: { start: rangeStart, end: rangeEnd }, refreshKey },
  )
  const { data: assignments, upsert: upsertAssignment } = useMotivAssignments()
  const { byId: adAccountById }   = useMotivAdAccounts(true, refreshKey)
  const { byId: motivAgencyById } = useMotivAgencies(true, refreshKey)
  // 선택한 일자(시작일)의 전일자 스냅샷과 비교
  const yesterdayDate = useMemo(() => addDays(rangeStart, -1), [rangeStart])
  const { byMotivId: yesterdayStats, snapshot } = useMotivDailySnapshot(yesterdayDate, refreshKey)
  const yesterdayAvailable = snapshot !== null && yesterdayStats.size > 0

  // 캠페인별 일자 범위 stats — 표/카드 source 일치용 (today override).
  const motivCampaignIdsAll = useMemo(
    () => motiv.data.filter(c => !isExcludedCampaign(c.title ?? '')).map(c => c.id),
    [motiv.data],
  )
  const statsCampaign = useMotivStatsCampaign({
    scope: { campaignIds: motivCampaignIdsAll },
    startDate: rangeStart,
    endDate:   rangeEnd,
    enabled:   motivCampaignIdsAll.length > 0,
    refreshKey,
  })

  // 매출(소진) source 하이브리드: 오늘 단일이면 daily_spent, 그 외 stats.cost.
  const isTodayOnly = rangeStart === rangeEnd && rangeStart === todayStr()

  // 일자 범위가 바뀔 때 activeOnly 기본값 재동기화 — 당일 단일=ON, 그 외=OFF.
  useEffect(() => { setActiveOnly(isTodayOnly) }, [isTodayOnly])

  // MotivCampaign → UnifiedCampaignSnapshot (P1: 광고주 매핑 포함)
  // today 는 statsCampaign(일자 범위 집계) 가 있으면 override — 누적값 의존 제거.
  const snapshots: UnifiedCampaignSnapshot[] = useMemo(() => {
    return motiv.data
      .filter(c => !isExcludedCampaign(c.title ?? ''))
      .filter(c => !activeOnly || c.status === 'Y')
      .map(c => {
        const adAccount = adAccountById.get(c.adaccount_id)
        const motivAgency = adAccount?.agency_id ? motivAgencyById.get(adAccount.agency_id) : undefined
        const agencyName = getAgencyDisplayName(motivAgency)
        const advertiserName = getAdvertiserName(adAccount)
        const yStats = yesterdayStats.get(c.id)
        const snap = motivCampaignToSnapshot(
          c, agencyName,
          yStats ? motivStatsToMetrics(yStats) : undefined,
          advertiserName,
        )
        const todayOverride = statsCampaign.byMotivId.get(c.id)
        // 사용자 정책 — '해당 기간에 발생한 정확한 매출 SPEND'. breakdown 정확치로 모두 override.
        if (todayOverride) snap.today = todayOverride
        if (isTodayOnly && c.daily_spent != null) {
          snap.today = { ...snap.today, spend: Math.round(c.daily_spent) }
        }
        if (snap.isFree) {
          snap.today = { ...snap.today, spend: 0 }
        }
        return snap
      })
  }, [motiv.data, adAccountById, motivAgencyById, yesterdayStats, statsCampaign.byMotivId, isTodayOnly, activeOnly])

  // 합계 — snapshot.today 가 일자 범위 집계로 override 되어 카드/표가 동일 source 로 일치.
  const sumT        = useMemo(() => aggregateMetrics(snapshots.map(s => s.today)), [snapshots])
  const sumY        = useMemo(() => aggregateMetrics(snapshots.map(s => s.yesterday)), [snapshots])
  const totalBudget = useMemo(() => snapshots.reduce((a, c) => a + c.budget, 0), [snapshots])

  // 일별 비용 추세 차트 전용
  const snapshotCampaignIds = useMemo(() => snapshots.map(s => s.motivId), [snapshots])
  const statsDaily = useMotivStatsDaily({
    scope: { campaignIds: snapshotCampaignIds },
    startDate: rangeStart,
    endDate:   rangeEnd,
    enabled:   snapshotCampaignIds.length > 0,
    refreshKey,
  })

  // Dev 교차 검증 — campaign-sum vs daily-sum vs statsCampaign.totals (CT analysis 와 동일 패턴).
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return
    if (typeof window === 'undefined') return
    if (statsDaily.loading || statsDaily.data.length === 0) return
    if (statsCampaign.loading) return
    const dailySpendSum = statsDaily.data.reduce((s, p) => s + Math.round(p.revenue || p.cost), 0)
    const campaignSpendSum = sumT.spend
    const totalsSpend = statsCampaign.totals
      ? Math.round(Number(statsCampaign.totals.revenue ?? statsCampaign.totals.cost ?? 0))
      : null
    const candidates = [campaignSpendSum, dailySpendSum, totalsSpend].filter((n): n is number => n != null && n > 0)
    if (candidates.length < 2) return
    const max = Math.max(...candidates), min = Math.min(...candidates)
    const delta = max > 0 ? (max - min) / max : 0
    if (delta > 0.01) {
      console.warn('[CTV analysis] 매출 source 불일치 감지', {
        period: `${rangeStart}~${rangeEnd}`,
        campaignSum: campaignSpendSum,
        dailySum: dailySpendSum,
        statsTotals: totalsSpend,
        deltaPct: +(delta * 100).toFixed(2),
      })
    }
  }, [sumT.spend, statsDaily.data, statsDaily.loading, statsCampaign.totals, statsCampaign.loading, rangeStart, rangeEnd])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-base font-semibold text-gray-900">CTV 매체 분석</h1>
            <p className="text-xs text-gray-400 mt-0.5">TV 매체 (Connected TV) · MOTIV API 실시간</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <FilterDateRange
              start={rangeStart}
              end={rangeEnd}
              onStartChange={setRangeStart}
              onEndChange={setRangeEnd}
              presets={[
                { label: '오늘',    onClick: () => { const t = todayStr(); setRangeStart(t); setRangeEnd(t) } },
                { label: '어제',    onClick: () => { const y = addDays(todayStr(), -1); setRangeStart(y); setRangeEnd(y) } },
                { label: '최근 7일', onClick: () => { setRangeStart(addDays(todayStr(), -6)); setRangeEnd(todayStr()) } },
                // 월별 — 해당 월 1일~말일 자동 설정 (campaigns.index 규칙).
                { label: '이번 달',  onClick: () => { const t = todayStr(); setRangeStart(monthStart(t)); setRangeEnd(monthEnd(t)) } },
                { label: '지난 달',  onClick: () => {
                  const lastStart = monthStart(addDays(monthStart(todayStr()), -1))
                  setRangeStart(lastStart); setRangeEnd(monthEnd(lastStart))
                } },
                // 캠페인 실 운영기간 — campaigns.index 의 start_date/end_date 기준 (사용자 요청).
                { label: '캠페인 운영기간', onClick: () => {
                  const starts = motiv.data.map(c => c.start_date).filter((s): s is string => !!s)
                  const ends   = motiv.data.map(c => c.end_date).filter((s): s is string => !!s)
                  if (starts.length === 0) return
                  const minStart = starts.reduce((a, b) => a < b ? a : b)
                  const t = todayStr()
                  const maxEnd  = ends.length > 0
                    ? ends.reduce((a, b) => a > b ? a : b)
                    : t
                  const cappedEnd = maxEnd > t ? t : maxEnd
                  setRangeStart(minStart); setRangeEnd(cappedEnd)
                } },
              ]}
            />
            <FilterToggle
              label="활성만"
              active={activeOnly}
              onChange={setActiveOnly}
              tone="emerald"
              title="status='Y' 캠페인만 표시. 당일 단일 모드에서 자동 ON."
            />
            <RefreshControlBar control={refreshControl} loading={motiv.loading} />
            {yesterdayAvailable ? (
              <span className="rounded-full bg-green-50 px-2.5 py-1 text-[11px] text-green-700 font-medium">
                {snapshot?.date} 비교 데이터 연결됨
              </span>
            ) : (
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] text-amber-700 font-medium">
                {yesterdayDate} 비교 데이터 없음
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
            <button
              type="button"
              onClick={() => setShowStatsDiagnostic(v => !v)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                showStatsDiagnostic ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              API raw 진단
            </button>
          </div>
        </div>
      </header>

      <main className="p-6 space-y-5">
        {showSettings && <SettingsPanel settings={settings} onChange={setSettings} variant="CTV" />}

        {showStatsDiagnostic && (() => {
          const rawMap = new Map<number, RawStatsCampaign>()
          for (const [id, raw] of statsCampaign.rawByMotivId) {
            rawMap.set(id, {
              motivId: id,
              title: motiv.data.find(c => c.id === id)?.title ?? '',
              payprice:    Number(raw.payprice ?? 0),
              cost:        Number(raw.cost ?? 0),
              revenue:     Number(raw.revenue ?? 0),
              agency_fee:  Number(raw.agency_fee ?? 0),
              data_fee:    Number(raw.data_fee ?? 0),
              profit:      Number(raw.profit ?? 0),
              profit_rate: raw.profit_rate != null ? Number(raw.profit_rate) : undefined,
            })
          }
          return (
            <StatsRawDiagnostic
              campaigns={motiv.data}
              rawStatsByMotivId={rawMap}
              mappedSpendByMotivId={new Map(snapshots.map(s => [s.motivId, s.today.spend]))}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
            />
          )
        })()}

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

        {/* 요약 통계 — 소진액(MOTIV cost) = 매출 */}
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <SummaryCard label="총 노출" value={f(sumT.impressions)} />
          <SummaryCard label="완료 시청" value={f(sumT.completedViews)} />
          <SummaryCard label="총 매출" value={`₩${f(sumT.spend)}`}
            sub={isTodayOnly ? 'source: Campaign.daily_spent' : 'source: stats.cost (기간 합)'} />
          <SummaryCard label="총 비용"
            value={`₩${f(sumT.mediaCost + sumT.agencyFee + sumT.dmpFee)}`} />
        </section>

        {/* P2: 매출·비용·이익 구조
              매출(소진액) = MOTIV stats.cost
              비용         = 매체비 + 대행 수수료 + DMP 수수료
              이익         = 매출 - 비용 */}
        <section className="rounded-xl border border-gray-200 bg-white px-5 py-4">
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-xs font-semibold text-gray-700">매출·비용·이익 구조</h3>
            <span className="text-[10px] text-gray-400">매출(소진액) − 비용(매체비+대행+DMP) = 이익</span>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <CostBreakdownCell label="매체비 (비용)"      value={sumT.mediaCost} total={sumT.spend} tone="blue"   />
            <CostBreakdownCell label="대행 수수료 (비용)" value={sumT.agencyFee} total={sumT.spend} tone="purple" />
            <CostBreakdownCell label="DMP 수수료 (비용)"  value={sumT.dmpFee}    total={sumT.spend} tone="amber"  />
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
              CTV 캠페인 목록
              <span className="ml-2 text-[11px] font-normal text-gray-400">{snapshots.length}건</span>
            </h2>
          </div>
          {motiv.loading ? (
            <div className="p-6 text-center text-xs text-gray-400 flex items-center justify-center gap-2">
              <svg className="animate-spin h-3.5 w-3.5 text-gray-400" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
              </svg>
              MOTIV API 응답 대기 중… (최대 30s)
            </div>
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
                    <th className="px-3 py-2 text-left font-medium">광고주</th>
                    <th className="px-3 py-2 text-left font-medium">대행사</th>
                    <th className="px-3 py-2 text-right font-medium">예산</th>
                    <th className="px-3 py-2 text-right font-medium">소진</th>
                    <th className="px-3 py-2 text-right font-medium">일예산 소진율</th>
                    <th className="px-3 py-2 text-center font-medium">페이싱</th>
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
                    const pacing = pacingStatus(c.dailySpent, c.dailyBudget)
                    const ptone = pacingToneClasses(pacing.level)
                    const dailyRate = c.dailyBudget > 0
                      ? (c.dailySpent / c.dailyBudget) * 100
                      : 0
                    return (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2"><AlertIcon msgs={alerts} motivId={c.motivId} startDate={rangeStart} endDate={rangeEnd} /></td>
                        <td className="px-3 py-2 font-medium text-gray-800">
                          {c.name}
                          {c.isFree && (
                            <span className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-[9px] text-gray-500">무료</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-700 font-medium">{c.advertiser}</td>
                        <td className="px-3 py-2 text-gray-600">{c.agency}</td>
                        <td className="px-3 py-2 text-right text-gray-700">₩{f(c.budget)}</td>
                        <td className="px-3 py-2 text-right text-gray-700">₩{f(c.today.spend)}</td>
                        <td className="px-3 py-2 text-right text-gray-700 tabular-nums">
                          {c.dailyBudget > 0 ? (
                            <span>
                              {dailyRate.toFixed(1)}%
                              <span className="ml-1 text-[10px] text-gray-400">
                                (₩{f(c.dailySpent)}/{f(c.dailyBudget)})
                              </span>
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${ptone.bg} ${ptone.text}`}
                            title={pacing.level === 'no_budget'
                              ? '일예산 미설정'
                              : `시간 진행률 ${(pacing.timeProgress * 100).toFixed(1)}% vs 소진율 ${(pacing.spendRate * 100).toFixed(1)}%`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${ptone.dot}`} />
                            {pacing.label}
                          </span>
                        </td>
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
            directMotivDisplay  /* 정산 시 Motiv API 광고주/대행사 직접 표시 — 추후 매칭 추가 예정 */
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

// SummaryCard 는 components/molecules/SummaryCard.tsx 의 단일 source 사용 (CT analysis 와 공유)
