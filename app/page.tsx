"use client"

import { useMemo } from "react"
import Link from "next/link"
import {
  getCampaignTotals,
  getCampaignProgress,
  getDday,
} from "@/lib/campaignTypes"
import type { Campaign } from "@/lib/campaignTypes"
import { useRawData } from "@/lib/hooks/useRawData"
import { useMasterData } from "@/lib/hooks/useMasterData"
import { useMotivSettlementCampaignsByProduct } from "@/lib/hooks/useMotivSettlementCampaigns"
import { applyMarkupToRows } from "@/lib/markupService"
import { MediaConsoleMenu } from "@/components/MediaConsoleMenu"
import { DomainStatusCard, type MediaDistribution } from "@/components/molecules/DomainStatusCard"
import { AlertCard } from "@/components/molecules/AlertCard"
import { MotivAlertsTable } from "@/components/molecules/MotivAlertsTable"
import { isActiveMotivCampaign, motivLifeSpendRate } from "@/lib/motivApi/campaignFilters"
import { useKpiThresholds, checkBudgetWarning } from "@/lib/kpiThresholds"
import { useRefreshControl } from "@/lib/hooks/useRefreshControl"
import { RefreshControlBar } from "@/components/molecules/RefreshControl"

function fmt(n: number) { return n.toLocaleString('ko-KR') }
function fmtPct(n: number) { return n.toFixed(1) + '%' }

// 소진률 텍스트 색 (KPI 카드용)
function spendTextColor(rate: number): string {
  if (rate >= 100) return 'text-red-600 font-bold'
  if (rate >= 90)  return 'text-orange-600 font-semibold'
  if (rate >= 70)  return 'text-yellow-600'
  return 'text-blue-600'
}

// ── 메인 페이지 ──────────────────────────────────────────────────
export default function DashboardPage() {
  // BUG-001/002/006 fix:
  //   기존엔 메인 대시보드만 localStorage(campaigns-v1, agencies-v1, advertisers-v1) 에서 직접 로드해
  //   다른 페이지(useMasterData → MongoDB) 와 데이터 소스가 분리돼 있었음.
  //   결과: 캠페인이 실제 등록돼 있어도 메인은 0개로 표시 + 광고주/대행사 빈 경고가 잘못 노출.
  //   useMasterData 로 통합하여 모든 페이지가 동일한 데이터를 보도록 정정.
  const { campaigns, advertisers: advertiserList, agencies: agencyList, loading: masterLoading } = useMasterData()
  const { allRows: rawRows } = useRawData()

  // CT / CTV — MOTIV API 캠페인 (운영 중 판정 위해 page-level 호출)
  // 성능 (2026-06-16): 기존엔 range 미지정 → 라우트가 2년 범위로 Open API insights 를
  // 집계해 totalCount(~1.9만) 가 폭증, hook 이 ~95페이지를 순회하다 60초 TIMEOUT.
  // 대시보드는 "집행중"(현재 운영) 캠페인만 필요하고, 집행중 캠페인은 최근 활동이
  // 있으므로 최근 90일 윈도로 좁혀도 누락되지 않는다. 윈도 축소로 업스트림 집계 비용과
  // 페이지 수를 동시에 대폭 절감 + perPage 1000(Open API max)으로 라운드트립 최소화.
  // (사용하는 필드 total_budget/total_spent/status/start_date/end_date 는 모두
  //  날짜무관 lifetime dimension 이라 윈도 축소가 값 정확도에 영향 없음)
  const dashboardRange = useMemo(() => {
    const KST = 9 * 60 * 60 * 1000
    const now = new Date(Date.now() + KST)
    const to = now.toISOString().slice(0, 10)
    const fromDate = new Date(now)
    fromDate.setUTCDate(fromDate.getUTCDate() - 90)
    return { start: fromDate.toISOString().slice(0, 10), end: to }
  }, [])
  // 실시간 갱신 — 모든 MOTIV 호출 + master data 가 refreshKey 에 반응
  const refreshControl = useRefreshControl()
  const refreshKey = refreshControl.key
  const motivCt  = useMotivSettlementCampaignsByProduct('CT',  { refreshKey, dateRange: dashboardRange, perPage: 1000 })
  const motivCtv = useMotivSettlementCampaignsByProduct('CTV', { refreshKey, dateRange: dashboardRange, perPage: 1000 })

  // 상태값 정규화 — '집행중' / '집행 중' / '집행  중' 모두 동일하게 처리 (BUG-03)
  function isActive(c: Campaign): boolean {
    const s = (c.status ?? '').replace(/\s+/g, '')
    return s === '집행중'
  }

  // 캠페인 ID → raw data 기반 실집행금액 합계
  // QA BUG-001/002: 캠페인 모달의 mb.spend(수동 입력) 은 비어있는 경우가 많아
  // 누적 소진 KPI 가 0 으로 표기되던 문제 → raw rows 의 executionAmount 합으로 보정.
  const rawSpendByCampaign = useMemo(() => {
    if (rawRows.length === 0 || campaigns.length === 0) return new Map<string, number>()
    const computed = applyMarkupToRows(rawRows, campaigns)
    const m = new Map<string, number>()
    for (const r of computed) {
      if (!r.matchedCampaignId) continue
      m.set(r.matchedCampaignId, (m.get(r.matchedCampaignId) ?? 0) + (r.executionAmount ?? 0))
    }
    return m
  }, [rawRows, campaigns])

  // 집행 중 통계
  const activeStats = useMemo(() => {
    const active = campaigns.filter(isActive)
    let totalBudget = 0, totalSpend = 0, totalSettingCost = 0
    for (const c of active) {
      const t = getCampaignTotals(c)
      totalBudget      += t.totalBudget
      totalSettingCost += t.totalSettingCost
      // raw 집행금액 우선, 없으면 수동 입력값(t.totalSpend) 폴백
      const rawSpend = rawSpendByCampaign.get(c.id)
      totalSpend += (rawSpend !== undefined && rawSpend > 0) ? rawSpend : t.totalSpend
    }
    const spendRate = totalSettingCost > 0
      ? Math.round((totalSpend / totalSettingCost) * 1000) / 10
      : 0
    return { count: active.length, totalBudget, totalSpend, totalSettingCost, spendRate }
  }, [campaigns, rawSpendByCampaign])

  // KPI 임계값 (localStorage) — 도메인별 경고 캠페인 수 계산에 사용
  const { thresholds } = useKpiThresholds()

  // ── 도메인 카드 데이터 — CT+ / CT / CTV ──────────────
  // CT+: useMasterData 의 자체 입력 캠페인. 매체별 분포(중복 카운트 — 한 캠페인이 N 매체)
  //      평균 소진률은 활성 캠페인의 단순 평균.
  const ctPlusActive = useMemo(() => {
    const active = campaigns.filter(isActive)
    const map = new Map<string, number>()
    let spendRateSum = 0
    let warningCount = 0
    for (const c of active) {
      const t = getCampaignTotals(c)
      const prog = getCampaignProgress(c.startDate, c.endDate)
      const rawSpend = rawSpendByCampaign.get(c.id)
      const effSpend = (rawSpend !== undefined && rawSpend > 0) ? rawSpend : t.totalSpend
      // 사용자 정책: 예산은 부킹 금액(totalBudget) 기준 — 마크업 차감 전
      const sr = t.totalBudget > 0 ? (effSpend / t.totalBudget) * 100 : 0
      if (checkBudgetWarning(sr, prog, thresholds)) warningCount++
      spendRateSum += sr
      for (const mb of c.mediaBudgets) {
        map.set(mb.media, (map.get(mb.media) ?? 0) + 1)
      }
    }
    const distribution: MediaDistribution[] = [...map.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
    const avgSpendRate = active.length > 0 ? spendRateSum / active.length : 0
    return { count: active.length, distribution, avgSpendRate, warningCount }
  }, [campaigns, rawSpendByCampaign, thresholds])

  // CT/CTV 캠페인의 운영 기간 진행률 (now - start) / (end - start) * 100
  function motivProgress(c: { start_date?: string | null; end_date?: string | null }, now: Date): number {
    if (!c.start_date || !c.end_date) return 0
    const s = new Date(c.start_date).getTime()
    const e = new Date(c.end_date).getTime()
    if (e <= s) return 0
    return Math.min(100, Math.max(0, ((now.getTime() - s) / (e - s)) * 100))
  }

  // CT (DISPLAY/VIDEO/PARTNERS) — isActiveMotivCampaign 으로 운영 중 필터
  const ctActive = useMemo(() => {
    const now = new Date()
    const active = motivCt.data.filter(c => isActiveMotivCampaign(c, now))
    const map = new Map<string, number>()
    let rateSum = 0
    let warningCount = 0
    for (const c of active) {
      map.set(c.campaign_type, (map.get(c.campaign_type) ?? 0) + 1)
      const sr = motivLifeSpendRate(c)
      rateSum += sr
      if (checkBudgetWarning(sr, motivProgress(c, now), thresholds)) warningCount++
    }
    const distribution: MediaDistribution[] = [...map.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
    const avgSpendRate = active.length > 0 ? rateSum / active.length : 0
    return { count: active.length, distribution, avgSpendRate, warningCount }
  }, [motivCt.data, thresholds])

  // CTV (TV) — TV 단일 매체
  const ctvActive = useMemo(() => {
    const now = new Date()
    const active = motivCtv.data.filter(c => isActiveMotivCampaign(c, now))
    let rateSum = 0
    let warningCount = 0
    for (const c of active) {
      const sr = motivLifeSpendRate(c)
      rateSum += sr
      if (checkBudgetWarning(sr, motivProgress(c, now), thresholds)) warningCount++
    }
    const distribution: MediaDistribution[] = active.length > 0
      ? [{ label: 'TV', count: active.length }]
      : []
    const avgSpendRate = active.length > 0 ? rateSum / active.length : 0
    return { count: active.length, distribution, avgSpendRate, warningCount }
  }, [motivCtv.data, thresholds])

  // R3: 이상 알림 — 카운트뿐 아니라 캠페인명 미니리스트도 노출.
  // 각 카테고리는 진단 결과 + 캠페인 인스턴스 보유.
  const alerts = useMemo(() => {
    const active = campaigns.filter(isActive)
    const overSpend:    Campaign[] = []
    const underSpend:   Campaign[] = []
    const expiringSoon: Campaign[] = []
    for (const c of active) {
      const t    = getCampaignTotals(c)
      const dday = getDday(c.endDate)
      if (t.spendRate >= 95)  overSpend.push(c)
      if (t.spendRate <  50 && getCampaignProgress(c.startDate, c.endDate) > 60) underSpend.push(c)
      if (dday.urgent && !dday.expired) expiringSoon.push(c)
    }
    return { overSpend, underSpend, expiringSoon }
  }, [campaigns])
  const totalAlertCount = alerts.overSpend.length + alerts.underSpend.length + alerts.expiringSoon.length


  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-gray-900">광고 운영 대시보드</h1>
            <p className="text-xs text-gray-400 mt-0.5">크로스타겟 CT+ · 전체 현황</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* R4: 매체 운영 콘솔 외부 링크 (데스크톱 가로 5버튼 / 모바일 드롭다운) */}
            <RefreshControlBar control={refreshControl} loading={motivCt.loading || motivCtv.loading || masterLoading} />
            <MediaConsoleMenu />
            {/* 이전 '데이터 입력' (→/campaign/ct-plus/daily) 버튼은 캠페인 현황 페이지 헤더의
                CSV 파일 추가 버튼으로 통합됨. 메인 헤더에서는 캠페인 현황으로 안내. */}
            <Link
              href="/campaign/ct-plus/status"
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              캠페인 현황
            </Link>
          </div>
        </div>
      </header>

      <main className="p-6 space-y-6">

        {/* ── KPI 요약 카드 ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3.5">
            <p className="text-[11px] text-gray-400 mb-1">집행 중 캠페인</p>
            <p className="text-2xl font-bold text-gray-900">{activeStats.count}<span className="text-sm font-normal text-gray-400 ml-1">개</span></p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3.5">
            <p className="text-[11px] text-gray-400 mb-1">전체 소진률</p>
            <p className={`text-2xl font-bold tabular-nums ${spendTextColor(activeStats.spendRate)}`}>
              {fmtPct(activeStats.spendRate)}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3.5">
            <p className="text-[11px] text-gray-400 mb-1">누적 소진금액</p>
            <p className="text-xl font-bold text-gray-900 tabular-nums">
              {activeStats.totalSpend >= 1_000_000
                ? `₩${(activeStats.totalSpend / 1_000_000).toFixed(1)}M`
                : `₩${fmt(activeStats.totalSpend)}`}
            </p>
          </div>
        </div>

        {/* R3 이상 알림 — 카드형 + 인라인 mini-list (캠페인명 상위 3건)
            클릭 시 status 페이지로 querystring 전달 → 자동 필터 (R5 수신) */}
        {totalAlertCount > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <AlertCard
              title="소진 과다"
              count={alerts.overSpend.length}
              note="95% 이상"
              tone="red"
              campaigns={alerts.overSpend}
              alertKey="overspend"
            />
            <AlertCard
              title="소진 저조"
              count={alerts.underSpend.length}
              note="기간 60% 경과 · 소진 50% 미만"
              tone="orange"
              campaigns={alerts.underSpend}
              alertKey="underspend"
            />
            <AlertCard
              title="종료 임박"
              count={alerts.expiringSoon.length}
              note="7일 이내"
              tone="yellow"
              campaigns={alerts.expiringSoon}
              alertKey="expiring"
            />
          </div>
        )}

        {/* Motiv 캠페인 통합 알림 테이블 — 사용자 요청 '첫 화면 경고 모아보기'.
            행 우측 '열기' 버튼이 매체 콘솔(crosstarget)의 캠페인 페이지로 이동. */}
        <MotivAlertsTable ct={motivCt.data} ctv={motivCtv.data} />

        {/* ── 캠페인 현황 — CT+ / CT / CTV 도메인 카드 ───────────── */}
        <div>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-800">캠페인 현황 — 도메인별 집행 중</h2>
            <p className="text-[10px] text-gray-400">카드 클릭 → 도메인 상세</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <DomainStatusCard
              title="CT+"
              subtitle="자체 입력 데이터"
              campaignCount={ctPlusActive.count}
              distribution={ctPlusActive.distribution}
              distributionNote="* 한 캠페인이 여러 매체 포함 시 중복 표기"
              avgSpendRate={ctPlusActive.avgSpendRate}
              warningCount={ctPlusActive.warningCount}
              href="/campaign/ct-plus/status"
              loading={masterLoading}
              emptyHint={
                advertiserList.length === 0 || agencyList.length === 0
                  ? '광고주·대행사 등록 후 캠페인을 추가하세요'
                  : '집행 중 캠페인이 없습니다'
              }
            />
            <DomainStatusCard
              title="CT"
              subtitle="자체 DA (DISPLAY/VIDEO/PARTNERS)"
              campaignCount={ctActive.count}
              distribution={ctActive.distribution}
              avgSpendRate={ctActive.avgSpendRate}
              warningCount={ctActive.warningCount}
              href="/campaign/ct/analysis"
              loading={motivCt.loading}
              error={motivCt.error}
            />
            <DomainStatusCard
              title="CTV"
              subtitle="Connected TV"
              campaignCount={ctvActive.count}
              distribution={ctvActive.distribution}
              avgSpendRate={ctvActive.avgSpendRate}
              warningCount={ctvActive.warningCount}
              href="/campaign/ct-ctv/analysis"
              loading={motivCtv.loading}
              error={motivCtv.error}
            />
          </div>
        </div>

      </main>
    </div>
  )
}
