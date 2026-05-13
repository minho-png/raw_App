"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import {
  getCampaignTotals,
  getCampaignProgress,
  getDday,
} from "@/lib/campaignTypes"
import type { Campaign } from "@/lib/campaignTypes"
import { MEDIA_CONFIG } from "@/lib/reportTypes"
import type { MediaType } from "@/lib/reportTypes"
import { useRawData } from "@/lib/hooks/useRawData"
import { useMasterData } from "@/lib/hooks/useMasterData"
import { useDailySpendMap } from "@/lib/hooks/useDailySpendMap"
import { applyMarkupToRows } from "@/lib/markupService"
import { DailyDeltaCell } from "@/components/DailyDeltaCell"

function fmt(n: number) { return n.toLocaleString('ko-KR') }
function fmtPct(n: number) { return n.toFixed(1) + '%' }


// ── 소진률 색상 ──────────────────────────────────────────────────
function spendColor(rate: number): string {
  if (rate >= 100) return 'bg-red-500'
  if (rate >= 90)  return 'bg-orange-400'
  if (rate >= 70)  return 'bg-yellow-400'
  return 'bg-blue-500'
}
function spendTextColor(rate: number): string {
  if (rate >= 100) return 'text-red-600 font-bold'
  if (rate >= 90)  return 'text-orange-600 font-semibold'
  if (rate >= 70)  return 'text-yellow-600'
  return 'text-blue-600'
}

// ── 매체 타입 변환 ────────────────────────────────────────────────
const MEDIA_NAME_TO_TYPE: Record<string, MediaType> = {
  '네이버 GFA': 'naver', '카카오모먼트': 'kakao', 'Google': 'google', 'META': 'meta',
}

// ── 서브컴포넌트: 이상 알림 카드 (mini-list + querystring 점프) ────
type AlertTone = 'red' | 'orange' | 'yellow'
const ALERT_TONE: Record<AlertTone, { border: string; bg: string; text: string; dot: string; pulse?: boolean }> = {
  red:    { border: 'border-red-200',    bg: 'bg-red-50',    text: 'text-red-700',    dot: 'bg-red-500',    pulse: true },
  orange: { border: 'border-orange-200', bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-400' },
  yellow: { border: 'border-yellow-200', bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-500' },
}
function AlertCard({
  title, count, note, tone, campaigns, alertKey,
}: {
  title: string
  count: number
  note: string
  tone: AlertTone
  campaigns: Campaign[]
  alertKey: 'overspend' | 'underspend' | 'expiring'
}) {
  const s = ALERT_TONE[tone]
  if (count === 0) {
    return (
      <div className="rounded-xl border border-gray-100 bg-white px-4 py-3.5 opacity-60">
        <div className="flex items-baseline justify-between">
          <p className="text-xs font-semibold text-gray-400">{title}</p>
          <span className="text-xs text-gray-300">0개</span>
        </div>
        <p className="mt-1 text-[10px] text-gray-300">{note}</p>
        <p className="mt-2 text-[11px] text-gray-300">해당 없음</p>
      </div>
    )
  }
  return (
    <Link
      href={`/campaign/ct-plus/status?alert=${alertKey}`}
      className={`block rounded-xl border ${s.border} ${s.bg} px-4 py-3.5 transition-transform hover:scale-[1.01] hover:shadow-sm`}
    >
      <div className="flex items-baseline justify-between">
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${s.dot} ${s.pulse ? 'animate-pulse' : ''}`} />
          <p className={`text-xs font-semibold ${s.text}`}>{title}</p>
        </div>
        <span className={`text-sm font-bold ${s.text} tabular-nums`}>{count}개</span>
      </div>
      <p className="mt-0.5 text-[10px] text-gray-500">{note}</p>
      <div className="mt-2 space-y-0.5">
        {campaigns.slice(0, 3).map(c => (
          <p key={c.id} className="text-[11px] text-gray-700 truncate" title={c.campaignName}>
            · {c.campaignName}
          </p>
        ))}
        {campaigns.length > 3 && (
          <p className="text-[10px] text-gray-400">+{campaigns.length - 3}개 더 보기 →</p>
        )}
      </div>
    </Link>
  )
}

// ── 서브컴포넌트: 캠페인 카드 ─────────────────────────────────────
// R3 간소화: 캠페인명/광고주·대행사/D-day/소진률(+ 색띠)/매체 도트 + 전일대비 만 표시.
// 제거: 기간진행률 행, 예산/소진 텍스트 행, 메모.
function CampaignCard({ c, advertiserName, agencyName, dailyEntry }: {
  c: Campaign
  advertiserName: string
  agencyName: string
  dailyEntry?: import("@/lib/hooks/useDailySpendMap").DailySpendEntry
}) {
  const totals    = getCampaignTotals(c)
  const dday      = getDday(c.endDate)
  const mediaKeys = c.mediaBudgets.map(mb => MEDIA_NAME_TO_TYPE[mb.media]).filter(Boolean) as MediaType[]
  const hasDaily  = dailyEntry && (dailyEntry.today > 0 || dailyEntry.yesterday > 0)

  return (
    <div className={`rounded-xl border bg-white overflow-hidden transition-shadow hover:shadow-md ${
      dday.expired ? 'border-gray-200 opacity-70' : 'border-gray-200'
    }`}>
      {/* 상단 색띠 — 소진률 프로그레스 */}
      <div className="h-1 w-full bg-gray-100">
        <div
          className={`h-full transition-all ${spendColor(totals.spendRate)}`}
          style={{ width: `${Math.min(totals.spendRate, 100)}%` }}
        />
      </div>

      <div className="px-4 py-3">
        {/* 1행: 캠페인명 + D-day */}
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <p className="text-sm font-semibold text-gray-800 truncate flex-1 min-w-0">{c.campaignName}</p>
          <span className={`shrink-0 text-xs font-bold ${
            dday.expired ? 'text-gray-500' : dday.urgent ? 'text-red-500' : 'text-gray-500'
          }`}>
            {dday.label}
          </span>
        </div>

        {/* 2행: 광고주 · 대행사 + 매체 도트 */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-[11px] text-gray-400 truncate flex-1 min-w-0">
            {advertiserName || '광고주 미지정'}
            {agencyName ? ` · ${agencyName}` : ''}
          </p>
          <div className="flex gap-1 shrink-0">
            {mediaKeys.map(mk => {
              const cfg = MEDIA_CONFIG[mk]
              return (
                <span
                  key={mk}
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ backgroundColor: cfg.color }}
                  title={cfg.label}
                />
              )
            })}
          </div>
        </div>

        {/* 3행: 소진률 게이지 + 전일대비 */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="h-1.5 flex-1 rounded-full bg-gray-100 overflow-hidden">
              <div
                className={`h-full rounded-full ${spendColor(totals.spendRate)}`}
                style={{ width: `${Math.min(totals.spendRate, 100)}%` }}
              />
            </div>
            <span className={`text-[11px] tabular-nums font-semibold ${spendTextColor(totals.spendRate)}`}>
              {fmtPct(totals.spendRate)}
            </span>
          </div>
          {hasDaily && (
            <DailyDeltaCell entry={dailyEntry} variant="inline" className="shrink-0" />
          )}
        </div>
      </div>
    </div>
  )
}

// ── 메인 페이지 ──────────────────────────────────────────────────
export default function DashboardPage() {
  const [filterStatus, setFilterStatus] = useState<'all' | '집행 중' | '종료'>('집행 중')

  // BUG-001/002/006 fix:
  //   기존엔 메인 대시보드만 localStorage(campaigns-v1, agencies-v1, advertisers-v1) 에서 직접 로드해
  //   다른 페이지(useMasterData → MongoDB) 와 데이터 소스가 분리돼 있었음.
  //   결과: 캠페인이 실제 등록돼 있어도 메인은 0개로 표시 + 광고주/대행사 빈 경고가 잘못 노출.
  //   useMasterData 로 통합하여 모든 페이지가 동일한 데이터를 보도록 정정.
  const { campaigns, advertisers: advertiserList, agencies: agencyList, loading: masterLoading } = useMasterData()

  // id → name lookup (CampaignCard 가 string 으로 받음)
  const advertisers = useMemo(
    () => Object.fromEntries(advertiserList.map(a => [a.id, a.name])),
    [advertiserList],
  )
  const agencies = useMemo(
    () => Object.fromEntries(agencyList.map(a => [a.id, a.name])),
    [agencyList],
  )

  const { allRows: rawRows } = useRawData()
  const dailySpendMap = useDailySpendMap(rawRows, campaigns)

  // 상태값 정규화 — '집행중' / '집행 중' / '집행  중' 모두 동일하게 처리 (BUG-03)
  function isActive(c: Campaign): boolean {
    const s = (c.status ?? '').replace(/\s+/g, '')
    return s === '집행중'
  }

  const filtered = useMemo(() =>
    campaigns.filter(c => {
      if (filterStatus === 'all') return true
      if (filterStatus === '집행 중') return isActive(c)
      const norm = (c.status ?? '').replace(/\s+/g, '')
      return norm === filterStatus.replace(/\s+/g, '')
    }),
    [campaigns, filterStatus]
  )

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
          <div className="flex items-center gap-2">
            <Link
              href="/campaign/ct-plus/daily"
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              데이터 입력
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

        {/* ── 캠페인 목록 ────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-800">
              캠페인 현황
              <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-normal text-gray-500">
                {filtered.length}개
              </span>
            </h2>
            <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white p-0.5">
              {(['all', '집행 중', '종료'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    filterStatus === s
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {s === 'all' ? '전체' : s}
                </button>
              ))}
            </div>
          </div>

          {masterLoading ? (
            <div className="rounded-xl border border-gray-100 bg-white px-6 py-12 text-center">
              <p className="text-sm text-gray-400">캠페인을 불러오는 중…</p>
            </div>
          ) : campaigns.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center space-y-3">
              <p className="text-sm text-gray-400">등록된 캠페인이 없습니다</p>
              {(advertiserList.length === 0 || agencyList.length === 0) && (
                <p className="text-[11px] text-amber-700 bg-amber-50 inline-block rounded px-2 py-1">
                  ⚠ 광고주·대행사가 비어 있습니다. 캠페인 등록 전 <Link href="/management" className="underline font-medium">관리 페이지</Link>에서 먼저 추가하세요.
                </p>
              )}
              <div>
                <Link
                  href="/campaign/ct-plus/status"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700"
                >
                  캠페인 등록하기 →
                </Link>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-gray-100 bg-white px-6 py-8 text-center">
              <p className="text-sm text-gray-400">해당 상태의 캠페인이 없습니다</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map(c => (
                <Link key={c.id} href="/campaign/ct-plus/status" className="block">
                  <CampaignCard
                    c={c}
                    advertiserName={advertisers[c.advertiserId] ?? ''}
                    agencyName={agencies[c.agencyId] ?? ''}
                    dailyEntry={dailySpendMap.get(c.id)}
                  />
                </Link>
              ))}
            </div>
          )}
        </div>

      </main>
    </div>
  )
}
