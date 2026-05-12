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
import { useReports } from "@/lib/hooks/useReports"
import { useRawData } from "@/lib/hooks/useRawData"
import { useMasterData } from "@/lib/hooks/useMasterData"
import { useDailySpendMap } from "@/lib/hooks/useDailySpendMap"
import { applyMarkupToRows } from "@/lib/markupService"
import { DailyDeltaCell } from "@/components/DailyDeltaCell"

function fmt(n: number) { return n.toLocaleString('ko-KR') }
function fmtPct(n: number) { return n.toFixed(1) + '%' }

// 사이드바 그룹 순(CT+ → CT → CTV → 정산) 과 동일한 워크플로우 단계.
// 각 그룹 내 메뉴 순서도 사이드바 순서를 그대로 반영하여 운영 흐름(제작 → 데이터 → 분석/현황) 을 시각화.
// 목업/관리 메뉴는 워크플로우 단계가 아니므로 제외.
const WORKFLOWS: ReadonlyArray<{
  title: string
  desc: string
  items: ReadonlyArray<{ href: string; icon: string; label: string }>
}> = [
  {
    title: 'CT+ 워크플로우',
    desc: '자체 입력 데이터 기반',
    items: [
      { href: '/campaign/ct-plus/creative-check', icon: '🔍', label: '소재 검수' },
      { href: '/campaign/ct-plus/daily',          icon: '📥', label: '데이터 업로드' },
      { href: '/campaign/ct-plus/status',         icon: '📊', label: '캠페인 현황' },
    ],
  },
  {
    title: 'CT 워크플로우',
    desc: '자체 DA (DISPLAY/VIDEO/PARTNERS)',
    items: [
      { href: '/campaign/ct/creative-check',  icon: '🔍', label: '소재 검수' },
      { href: '/campaign/ct/analysis',        icon: '📈', label: '캠페인 분석' },
      { href: '/campaign/ct/motiv-campaigns', icon: '📊', label: '캠페인 현황' },
    ],
  },
  {
    title: 'CTV 워크플로우',
    desc: 'TV (Connected TV)',
    items: [
      { href: '/campaign/ct-ctv/creative-check', icon: '🔍', label: '소재 검수' },
      { href: '/campaign/ct-ctv/analysis',       icon: '📺', label: '캠페인 분석' },
    ],
  },
  {
    title: '캠페인 정산',
    desc: '매입·매출 → 수수료 → 계산서',
    items: [
      { href: '/settlement/sales-purchase', icon: '💰', label: '매입/매출' },
      { href: '/settlement/agency-fee',     icon: '🏢', label: '대행사 수수료' },
      { href: '/settlement/dmp-fee',        icon: '🗂', label: 'DMP 수수료' },
      { href: '/settlement/media-cost',     icon: '📡', label: '매체 비용' },
      { href: '/campaign/ct-plus/final',    icon: '📋', label: '계산서 발급' },
    ],
  },
]

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

// ── 서브컴포넌트: 캠페인 카드 ─────────────────────────────────────
function CampaignCard({ c, advertiserName, agencyName, dailyEntry }: {
  c: Campaign
  advertiserName: string
  agencyName: string
  dailyEntry?: import("@/lib/hooks/useDailySpendMap").DailySpendEntry
}) {
  const totals   = getCampaignTotals(c)
  const progress = getCampaignProgress(c.startDate, c.endDate)
  const dday     = getDday(c.endDate)
  const mediaKeys = c.mediaBudgets.map(mb => MEDIA_NAME_TO_TYPE[mb.media]).filter(Boolean) as MediaType[]

  return (
    <div className={`rounded-xl border bg-white overflow-hidden transition-shadow hover:shadow-md ${
      dday.expired ? 'border-gray-200 opacity-70' : 'border-gray-200'
    }`}>
      {/* 상단 색띠: 소진률 프로그레스 */}
      <div className="h-1 w-full bg-gray-100">
        <div
          className={`h-full transition-all ${spendColor(totals.spendRate)}`}
          style={{ width: `${Math.min(totals.spendRate, 100)}%` }}
        />
      </div>

      <div className="px-4 py-3.5">
        {/* 캠페인명 + D-day */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-800 truncate">{c.campaignName}</p>
            <p className="text-[11px] text-gray-400 truncate mt-0.5">
              {advertiserName || '광고주 미지정'}
              {agencyName ? ` · ${agencyName}` : ''}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <span className={`text-sm font-bold ${
              dday.expired ? 'text-gray-500' : dday.urgent ? 'text-red-500' : 'text-gray-500'
            }`}>
              {dday.label}
            </span>
            <p className="text-[10px] text-gray-500 mt-0.5">{c.endDate.slice(2).replace(/-/g, '.')}</p>
          </div>
        </div>

        {/* 소진률 */}
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[11px] text-gray-400">소진률</span>
          <div className="flex items-center gap-2">
            <div className="w-28 h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div
                className={`h-full rounded-full ${spendColor(totals.spendRate)}`}
                style={{ width: `${Math.min(totals.spendRate, 100)}%` }}
              />
            </div>
            <span className={`text-xs tabular-nums ${spendTextColor(totals.spendRate)}`}>
              {fmtPct(totals.spendRate)}
            </span>
          </div>
        </div>

        {/* 기간 진행률 */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] text-gray-400">기간 진행</span>
          <div className="flex items-center gap-2">
            <div className="w-28 h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-gray-300"
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
            <span className="text-xs tabular-nums text-gray-400">{fmtPct(progress)}</span>
          </div>
        </div>

        {/* 예산/소진 요약 + 매체 뱃지 */}
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap gap-1">
            {mediaKeys.map(mk => {
              const cfg = MEDIA_CONFIG[mk]
              return (
                <span
                  key={mk}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-600"
                >
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: cfg.color }} />
                  {cfg.label}
                </span>
              )
            })}
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs tabular-nums text-gray-700 font-medium">₩{fmt(totals.totalSpend)}</p>
            <p className="text-[10px] text-gray-500">/ ₩{fmt(totals.totalSettingCost)}</p>
          </div>
        </div>

        {/* 전일 대비 소진율 */}
        {dailyEntry && (dailyEntry.today > 0 || dailyEntry.yesterday > 0) && (
          <div className="mt-2.5 border-t border-gray-50 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-400">전일 대비 소진</span>
              <DailyDeltaCell entry={dailyEntry} variant="inline" className="text-right" />
            </div>
          </div>
        )}

        {/* 메모 */}
        {c.memo && (
          <p className="mt-2.5 text-[11px] text-gray-400 border-t border-gray-50 pt-2 truncate">{c.memo}</p>
        )}
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

  const { reports } = useReports()
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

  // 소진 경보 캠페인 수
  const alertCounts = useMemo(() => {
    const active = campaigns.filter(isActive)
    let overSpend = 0, underSpend = 0, expiringSoon = 0
    for (const c of active) {
      const t    = getCampaignTotals(c)
      const dday = getDday(c.endDate)
      if (t.spendRate >= 95)  overSpend++
      if (t.spendRate <  50 && getCampaignProgress(c.startDate, c.endDate) > 60) underSpend++
      if (dday.urgent && !dday.expired) expiringSoon++
    }
    return { overSpend, underSpend, expiringSoon }
  }, [campaigns])

  const reportCount = reports.length

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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3.5">
            <p className="text-[11px] text-gray-400 mb-1">저장 리포트</p>
            <p className="text-2xl font-bold text-gray-900">{reportCount}<span className="text-sm font-normal text-gray-400 ml-1">건</span></p>
          </div>
        </div>

        {/* ── 경보 패널 ──────────────────────────────────────────── */}
        {(alertCounts.overSpend > 0 || alertCounts.underSpend > 0 || alertCounts.expiringSoon > 0) && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs font-semibold text-amber-800 mb-2.5">⚠ 주의 필요 캠페인</p>
            <div className="flex flex-wrap gap-2">
              {alertCounts.overSpend > 0 && (
                <Link href="/campaign/ct-plus/status" className="flex items-center gap-1.5 rounded-full bg-red-100 border border-red-200 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-200 transition-colors">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                  소진 과다 {alertCounts.overSpend}개 (95% 이상)
                </Link>
              )}
              {alertCounts.underSpend > 0 && (
                <Link href="/campaign/ct-plus/status" className="flex items-center gap-1.5 rounded-full bg-orange-100 border border-orange-200 px-3 py-1 text-xs font-medium text-orange-700 hover:bg-orange-200 transition-colors">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
                  소진 저조 {alertCounts.underSpend}개 (기간 60% 이상 경과)
                </Link>
              )}
              {alertCounts.expiringSoon > 0 && (
                <Link href="/campaign/ct-plus/status" className="flex items-center gap-1.5 rounded-full bg-yellow-100 border border-yellow-200 px-3 py-1 text-xs font-medium text-yellow-700 hover:bg-yellow-200 transition-colors">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 shrink-0" />
                  종료 임박 {alertCounts.expiringSoon}개 (7일 이내)
                </Link>
              )}
            </div>
          </div>
        )}

        {/* ── 빠른 이동 — 사이드바 워크플로우(CT+ → CT → CTV → 정산) 순 그룹 ── */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {WORKFLOWS.map(wf => (
            <div key={wf.title} className="rounded-xl border border-gray-200 bg-white p-3.5">
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="text-xs font-semibold text-gray-700">{wf.title}</h3>
                <span className="text-[10px] text-gray-400">{wf.desc}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {wf.items.map((it, i) => (
                  <div key={it.href} className="flex items-center gap-1.5">
                    <Link
                      href={it.href}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-[11px] font-medium text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                    >
                      <span>{it.icon}</span>
                      <span>{it.label}</span>
                    </Link>
                    {i < wf.items.length - 1 && (
                      <span className="text-gray-300 text-xs select-none" aria-hidden>→</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

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

        {/* ── 저장 리포트 빠른 보기 ──────────────────────────────── */}
        {reportCount > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-800">최근 저장 리포트</h2>
              <Link href="/campaign/ct-plus/daily" className="text-xs text-blue-600 hover:underline">
                전체 보기 →
              </Link>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-50">
              {reports.slice(0, 5).map(r => {
                const d    = new Date(r.savedAt)
                const dt   = `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
                const rows = r.chunked ? (r.totalRows ?? 0) : r.mediaTypes.reduce((s, m) => s + (r.rowsByMedia[m]?.length ?? 0), 0)
                return (
                  <div key={r.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50/50 transition-colors">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-700 truncate">{r.label}</p>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-gray-400">
                        <span>{dt}</span>
                        <span>·</span>
                        <span>{fmt(rows)}행</span>
                        {r.chunked && <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-600">대용량</span>}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0 ml-3">
                      {r.mediaTypes.map(m => (
                        <span key={m} className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: MEDIA_CONFIG[m]?.color ?? '#9ca3af' }} title={MEDIA_CONFIG[m]?.label} />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </main>
    </div>
  )
}
