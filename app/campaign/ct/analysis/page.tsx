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
import { SummaryCard } from "@/components/molecules/SummaryCard"
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
import { aggregateDailyToMetrics } from "@/lib/motivApi/statsService"
import { isExcludedCampaign } from "@/lib/motivApi/productMapping"
import { getAdvertiserName, getAgencyDisplayName } from "@/lib/motivApi/advertiserHelpers"
import { useMotivStatsDaily } from "@/lib/hooks/useMotivStatsDaily"
import { useRefreshControl } from "@/lib/hooks/useRefreshControl"
import { RefreshControlBar } from "@/components/molecules/RefreshControl"
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

// 일자 헬퍼 — YYYY-MM-DD 포맷
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

export default function CtAnalysisPage() {
  // 일자 범위 — 기본: 시작일=종료일=오늘 (당일)
  const [rangeStart, setRangeStart]     = useState<string>(todayStr())
  const [rangeEnd, setRangeEnd]         = useState<string>(todayStr())
  const [category, setCategory]         = useState<Category>('total')
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings]         = useState<AnalysisSettings>(DEFAULT_ANALYSIS_SETTINGS)

  // ── 실시간 갱신 제어 ────────────────────────────────────
  const refreshControl = useRefreshControl()
  const refreshKey = refreshControl.key

  // ── 데이터 소스 ──────────────────────────────────────────
  const { agencies, advertisers, operators } = useMasterData()
  const motiv = useMotivSettlementCampaignsByProduct('CT',
    { dateRange: { start: rangeStart, end: rangeEnd }, refreshKey },
  )
  const { data: assignments, upsert: upsertAssignment } = useMotivAssignments()
  const { byId: adAccountById }   = useMotivAdAccounts(true, refreshKey)
  const { byId: motivAgencyById } = useMotivAgencies(true, refreshKey)
  // 선택한 일자(시작일)의 전일자 스냅샷과 비교
  const yesterdayDate = useMemo(() => addDays(rangeStart, -1), [rangeStart])
  const { byMotivId: yesterdayStats, snapshot } = useMotivDailySnapshot(yesterdayDate, refreshKey)
  const yesterdayAvailable = snapshot !== null && yesterdayStats.size > 0

  // MotivCampaign → UnifiedCampaignSnapshot (전일 스냅샷 + 광고주 매핑)
  // P1: getAdvertiserName / getAgencyDisplayName 헬퍼로 fallback chain 적용
  const snapshots: UnifiedCampaignSnapshot[] = useMemo(() => {
    // dev 환경 — 매핑 실패 케이스 진단
    const missingAd: number[] = []
    const missingAgency: { campaignId: number; adAccountId: number; agencyId: number }[] = []

    const result = motiv.data
      .filter(c => !isExcludedCampaign(c.title ?? ''))
      .map(c => {
        const adAccount = adAccountById.get(c.adaccount_id)
        if (!adAccount && adAccountById.size > 0) missingAd.push(c.adaccount_id)
        const motivAgency = adAccount?.agency_id ? motivAgencyById.get(adAccount.agency_id) : undefined
        if (adAccount?.agency_id && !motivAgency && motivAgencyById.size > 0) {
          missingAgency.push({ campaignId: c.id, adAccountId: c.adaccount_id, agencyId: adAccount.agency_id })
        }
        const agencyName = getAgencyDisplayName(motivAgency)
        const advertiserName = getAdvertiserName(adAccount)
        const yStats = yesterdayStats.get(c.id)
        return motivCampaignToSnapshot(
          c, agencyName,
          yStats ? motivStatsToMetrics(yStats) : undefined,
          advertiserName,
        )
      })

    // dev 환경 — 매핑 실패 케이스 가시화 (어떤 adaccount_id / agency_id 가 비어있는지)
    if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
      if (missingAd.length > 0) {
        console.warn('[CT analysis] adaccount_id 매핑 실패 (광고주명·대행사명 모두 누락):',
          [...new Set(missingAd)])
      }
      if (missingAgency.length > 0) {
        const uniqueAgencyIds = [...new Set(missingAgency.map(m => m.agencyId))]
        console.warn('[CT analysis] agency_id 매핑 실패 (대행사명 누락) — 누락된 agency_id:',
          uniqueAgencyIds, '· 영향 캠페인:', missingAgency.length)
      }
    }

    return result
  }, [motiv.data, adAccountById, motivAgencyById, yesterdayStats])

  // 카테고리 필터 (PARTNERS 는 합계에만 포함)
  const filtered = useMemo(() => {
    if (category === 'total') return snapshots
    return snapshots.filter(s => s.uiType === category)
  }, [snapshots, category])

  // 합계
  // 합계 (캠페인 stats 단위 — MOTIV /v1/campaigns 응답의 stats 합산).
  const sumT_campaignBased = useMemo(() => aggregateMetrics(filtered.map(s => s.today)), [filtered])
  const sumY        = useMemo(() => aggregateMetrics(filtered.map(s => s.yesterday)), [filtered])
  const totalBudget = useMemo(() => filtered.reduce((a, c) => a + c.budget, 0), [filtered])
  const showVTR = category === 'video'

  // P3: 일별 비용 추세 — 선택된 일자 범위 그대로 사용
  const monthRange = useMemo(
    () => ({ start: rangeStart, end: rangeEnd }),
    [rangeStart, rangeEnd],
  )
  const filteredCampaignIds = useMemo(() => filtered.map(s => s.motivId), [filtered])
  const statsDaily = useMotivStatsDaily({
    scope: { campaignIds: filteredCampaignIds },
    startDate: monthRange.start,
    endDate:   monthRange.end,
    enabled:   filteredCampaignIds.length > 0,
    refreshKey,
  })

  // sumT: 매출/비용 항목은 /stats/daily/breakdown 의 일자 합으로 우선 적용(있을 때).
  //       impressions/clicks/completedViews 는 daily 응답에 없으므로 캠페인 stats 합 유지.
  //       캠페인 stats 는 누적값일 수 있어 선택 일자 범위와 일치하지 않을 수 있음 → daily 합이 정확.
  const sumT = useMemo(() => {
    if (statsDaily.data.length === 0) return sumT_campaignBased
    const daily = aggregateDailyToMetrics(statsDaily.data)
    // dev 진단 — 캠페인 stats 합 vs daily 합 차이 가시화
    if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
      const cmp = sumT_campaignBased
      console.info('[CT analysis] spend 비교', {
        '캠페인 stats 합 (sumT)': { spend: cmp.spend, agencyFee: cmp.agencyFee, dmpFee: cmp.dmpFee, mediaCost: cmp.mediaCost },
        '일자별 합 (daily)':     { spend: daily.spend, agencyFee: daily.agencyFee, dmpFee: daily.dmpFee, mediaCost: daily.mediaCost, profit: daily.profit },
        '차이(daily-campaign)':  { spend: daily.spend - cmp.spend },
      })
    }
    return {
      ...sumT_campaignBased,
      spend:     daily.spend,
      agencyFee: daily.agencyFee,
      dmpFee:    daily.dmpFee,
      mediaCost: daily.mediaCost,
    }
  }, [sumT_campaignBased, statsDaily.data])

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
            {/* 일자 범위 메인 입력 — 기본: 시작=종료=오늘 */}
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={rangeStart}
                max={rangeEnd || undefined}
                onChange={e => setRangeStart(e.target.value)}
                className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 focus:border-blue-400 focus:outline-none"
              />
              <span className="text-gray-300 text-xs">~</span>
              <input
                type="date"
                value={rangeEnd}
                min={rangeStart || undefined}
                onChange={e => setRangeEnd(e.target.value)}
                className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 focus:border-blue-400 focus:outline-none"
              />
            </div>
            {/* 빠른 선택 (월별 등 하위 기능) */}
            <div className="inline-flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white p-0.5">
              {([
                { label: '오늘',    s: () => todayStr(),                e: () => todayStr() },
                { label: '어제',    s: () => addDays(todayStr(), -1),    e: () => addDays(todayStr(), -1) },
                { label: '최근 7일', s: () => addDays(todayStr(), -6),    e: () => todayStr() },
                { label: '이번 달',  s: () => monthStart(todayStr()),     e: () => todayStr() },
                { label: '지난 달',  s: () => monthStart(addDays(monthStart(todayStr()), -1)),
                                    e: () => monthEnd(addDays(monthStart(todayStr()), -1)) },
              ] as const).map(({ label, s, e }) => {
                const ss = s(); const ee = e()
                const active = rangeStart === ss && rangeEnd === ee
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => { setRangeStart(ss); setRangeEnd(ee) }}
                    className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
                      active ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >{label}</button>
                )
              })}
            </div>
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

        {/* 요약 통계 — 소진액(MOTIV cost) = 매출 */}
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <SummaryCard label="총 노출" value={f(sumT.impressions)} />
          <SummaryCard label="총 클릭" value={f(sumT.clicks)} />
          <SummaryCard label="총 매출"
            value={`₩${f(sumT.spend)}`}
            sub={statsDaily.data.length > 0
              ? `일자별 합 ₩${f(statsDaily.data.reduce((s, p) => s + p.cost, 0))}`
              : undefined} />
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

// SummaryCard 는 components/molecules/SummaryCard.tsx 의 단일 source 사용 (CTV analysis 와 공유)
