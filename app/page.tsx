"use client"

import { useState, useEffect, useMemo } from "react"
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

// ── 로컬스토리지 키 ────────────────────────────────────────────
const CAMPAIGNS_KEY  = 'campaigns-v1'
const AGENCIES_KEY   = 'agencies-v1'
const ADVERTISERS_KEY = 'advertisers-v1'

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

// ── 서브컴포넌트: 캠페인 카드 ─────────────────────────────────────
function CampaignCard({ c, advertiserName, agencyName }: {
  c: Campaign
  advertiserName: string
  agencyName: string
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
              dday.expired ? 'text-gray-300' : dday.urgent ? 'text-red-500' : 'text-gray-500'
            }`}>
              {dday.label}
            </span>
            <p className="text-[10px] text-gray-300 mt-0.5">{c.endDate.slice(2).replace(/-/g, '.')}</p>
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
            <p className="text-[10px] text-gray-300">/ ₩{fmt(totals.totalSettingCost)}</p>
          </div>
        </div>

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
  const [campaigns,    setCampaigns]    = useState<Campaign[]>([])
  const [advertisers,  setAdvertisers]  = useState<Record<string, string>>({})  // id → name
  const [agencies,     setAgencies]     = useState<Record<string, string>>({})  // id → name
  const [filterStatus, setFilterStatus] = useState<'all' | '집행 중' | '종료'>('집행 중')

  const { reports } = useReports()

  useEffect(() => {
    try {
      const c = localStorage.getItem(CAMPAIGNS_KEY)
      if (c) setCampaigns(JSON.parse(c))
      const ag = localStorage.getItem(AGENCIES_KEY)
      if (ag) {
        const list = JSON.parse(ag)
        setAgencies(Object.fromEntries(list.map((a: { id: string; name: string }) => [a.id, a.name])))
      }
      const adv = localStorage.getItem(ADVERTISERS_KEY)
      if (adv) {
        const list = JSON.parse(adv)
        setAdvertisers(Object.fromEntries(list.map((a: { id: string; name: string }) => [a.id, a.name])))
      }
    } catch {}
  }, [])

  const filtered = useMemo(() =>
    campaigns.filter(c => filterStatus === 'all' || c.status === filterStatus),
    [campaigns, filterStatus]
  )

  // 집행 중 통계
  const activeStats = useMemo(() => {
    const active = campaigns.filter(c => c.status === '집행 중')
    let totalBudget = 0, totalSpend = 0, totalSettingCost = 0
    for (const c of active) {
      const t = getCampaignTotals(c)
      totalBudget      += t.totalBudget
      totalSpend       += t.totalSpend
      totalSettingCost += t.totalSettingCost
    }
    const spendRate = totalSettingCost > 0
      ? Math.round((totalSpend / totalSettingCost) * 1000) / 10
      : 0
    return { count: active.length, totalBudget, totalSpend, totalSettingCost, spendRate }
  }, [campaigns])

  // 소진 경보 캠페인 수
  const alertCounts = useMemo(() => {
    const active = campaigns.filter(c => c.status === '집행 중')
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
            <Link
              href="/campaign/ct-plus/report"
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              통합 리포트
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

        {/* ── 빠른 이동 ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {[
            { href: '/campaign/ct-plus/status',       icon: '📊', label: '집행 현황' },
            { href: '/campaign/ct-plus/daily',         icon: '📥', label: '데이터 입력' },
            { href: '/campaign/ct-plus/report',        icon: '📈', label: '통합 리포트' },
            { href: '/campaign/ct-plus/final',         icon: '📋', label: '종료 리포트' },
            { href: '/settlement/dmp-fee',             icon: '💰', label: 'DMP 정산' },
            { href: '/settlement/agency-fee',          icon: '🏢', label: '대행 수수료' },
            { href: '/settlement/media-cost',          icon: '📡', label: '매체비 정산' },
            { href: '/campaign/ct-ctv/analysis',       icon: '📺', label: 'CT/CTV 분석' },
            { href: '/campaign/ct-plus/creative-check',icon: '🔍', label: '소재 검수' },
            { href: '/mockup',                         icon: '🎨', label: '목업 생성' },
          ].map(({ href, icon, label }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-xs font-medium text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition-all"
            >
              <span>{icon}</span>
              <span className="truncate">{label}</span>
            </Link>
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

          {campaigns.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center">
              <p className="text-sm text-gray-400 mb-3">등록된 캠페인이 없습니다</p>
              <Link
                href="/campaign/ct-plus/status"
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700"
              >
                캠페인 등록하기 →
              </Link>
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
              <Link href="/campaign/ct-plus/report" className="text-xs text-blue-600 hover:underline">
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
