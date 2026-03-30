"use client"

import { useState, useEffect } from "react"
import type { Campaign, Agency, Advertiser } from "@/lib/campaignTypes"
import { MEDIA_MARKUP_RATE, getMediaTotals } from "@/lib/campaignTypes"

const CAMPAIGN_KEY   = "ct-plus-campaigns-v7"
const AGENCY_KEY     = "ct-plus-agencies-v1"
const ADVERTISER_KEY = "ct-plus-advertisers-v1"
const SNAPSHOTS_KEY  = "media-cost-snapshots-v1"

function fmt(n: number) { return n.toLocaleString('ko-KR') }
function toMonthStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}
function overlapsMonth(c: Campaign, month: string): boolean {
  const [y, m] = month.split("-").map(Number)
  const mStart = new Date(y, m - 1, 1)
  const mEnd   = new Date(y, m, 0)
  return new Date(c.startDate) <= mEnd && new Date(c.endDate) >= mStart
}

interface ResultRow {
  advertiserName: string
  agencyName: string
  agencyId: string
  campaignName: string
  media: string
  kind: 'DMP' | '비DMP'
  budget: number
  spend: number
  markupRate: number
  netCost: number      // 순 매체 비용 = spend × (1 - markupRate/100)
}

interface Snapshot {
  id: string
  month: string
  snapshotAt: string
  rows: ResultRow[]
  totalSpend: number
  totalNetCost: number
  note?: string
}

// 대행사별 색상 팔레트
const AGENCY_PALETTE = [
  { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   badge: 'bg-blue-100 text-blue-700' },
  { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', badge: 'bg-purple-100 text-purple-700' },
  { bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-700',  badge: 'bg-green-100 text-green-700' },
  { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', badge: 'bg-orange-100 text-orange-700' },
  { bg: 'bg-rose-50',   border: 'border-rose-200',   text: 'text-rose-700',   badge: 'bg-rose-100 text-rose-700' },
  { bg: 'bg-cyan-50',   border: 'border-cyan-200',   text: 'text-cyan-700',   badge: 'bg-cyan-100 text-cyan-700' },
  { bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-700',  badge: 'bg-amber-100 text-amber-700' },
  { bg: 'bg-teal-50',   border: 'border-teal-200',   text: 'text-teal-700',   badge: 'bg-teal-100 text-teal-700' },
]

export default function MediaCostPage() {
  const today = new Date()
  const [month, setMonth] = useState(toMonthStr(today))
  const [campaigns, setCampaigns]       = useState<Campaign[]>([])
  const [advertisers, setAdvertisers]   = useState<Advertiser[]>([])
  const [agencies, setAgencies]         = useState<Agency[]>([])
  const [snapshots, setSnapshots]       = useState<Snapshot[]>([])
  const [showHistory, setShowHistory]   = useState(false)
  const [confirmedToast, setConfirmedToast] = useState(false)
  const [noteInput, setNoteInput]       = useState('')

  useEffect(() => {
    try {
      const c  = localStorage.getItem(CAMPAIGN_KEY);   if (c)  setCampaigns(JSON.parse(c))
      const ad = localStorage.getItem(ADVERTISER_KEY); if (ad) setAdvertisers(JSON.parse(ad))
      const ag = localStorage.getItem(AGENCY_KEY);     if (ag) setAgencies(JSON.parse(ag))
      const sn = localStorage.getItem(SNAPSHOTS_KEY);  if (sn) setSnapshots(JSON.parse(sn))
    } catch {}
  }, [])

  function getAdvertiserName(adId: string) { return advertisers.find(a => a.id === adId)?.name ?? '—' }
  function getAgencyName(agId: string)     { return agencies.find(a => a.id === agId)?.name ?? '—' }

  // ── 결과 행 계산 ───────────────────────────────────────────────
  const rows: ResultRow[] = []
  for (const c of campaigns) {
    if (!overlapsMonth(c, month)) continue
    const advertiserName = getAdvertiserName(c.advertiserId)
    const agencyName     = getAgencyName(c.agencyId)
    for (const mb of c.mediaBudgets) {
      const markupRate = MEDIA_MARKUP_RATE[mb.media] ?? 0
      if (mb.dmp.spend > 0) {
        const spend = mb.dmp.spend
        rows.push({
          advertiserName, agencyName, agencyId: c.agencyId,
          campaignName: c.campaignName,
          media: mb.media,
          kind: 'DMP',
          budget: mb.dmp.budget,
          spend,
          markupRate,
          netCost: Math.round(spend * (1 - markupRate / 100)),
        })
      }
      if (mb.nonDmp.spend > 0) {
        const spend = mb.nonDmp.spend
        rows.push({
          advertiserName, agencyName, agencyId: c.agencyId,
          campaignName: c.campaignName,
          media: mb.media,
          kind: '비DMP',
          budget: mb.nonDmp.budget,
          spend,
          markupRate,
          netCost: Math.round(spend * (1 - markupRate / 100)),
        })
      }
    }
  }

  const totalSpend   = rows.reduce((s, r) => s + r.spend, 0)
  const totalNetCost = rows.reduce((s, r) => s + r.netCost, 0)
  const totalBudget  = rows.reduce((s, r) => s + r.budget, 0)

  // 대행사별 집계
  const agencyIds = [...new Set(rows.map(r => r.agencyId))]
  const agencyPaletteMap: Record<string, typeof AGENCY_PALETTE[number]> = {}
  agencyIds.forEach((id, i) => { agencyPaletteMap[id] = AGENCY_PALETTE[i % AGENCY_PALETTE.length] })

  // 매체별 집계
  const mediaMap = new Map<string, { spend: number; netCost: number }>()
  for (const r of rows) {
    const e = mediaMap.get(r.media) ?? { spend: 0, netCost: 0 }
    e.spend += r.spend; e.netCost += r.netCost
    mediaMap.set(r.media, e)
  }

  // ── TSV 복사 ──────────────────────────────────────────────────
  function handleCopyTsv() {
    const header = ['광고주', '대행사', '캠페인명', '매체', '구분', '예산', '집행금액', '매체마크업률', '순매체비용'].join('\t')
    const body = rows.map(r =>
      [r.advertiserName, r.agencyName, r.campaignName, r.media, r.kind,
       r.budget, r.spend, r.markupRate + '%', r.netCost].join('\t')
    ).join('\n')
    navigator.clipboard.writeText(header + '\n' + body).catch(() => {})
  }

  // ── 정산 확정 ─────────────────────────────────────────────────
  function handleConfirm() {
    const snap: Snapshot = {
      id: Date.now().toString(),
      month,
      snapshotAt: new Date().toISOString(),
      rows,
      totalSpend,
      totalNetCost,
      note: noteInput || undefined,
    }
    const next = [snap, ...snapshots].slice(0, 10)
    setSnapshots(next)
    try { localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(next)) } catch {}
    setConfirmedToast(true)
    setTimeout(() => setConfirmedToast(false), 2500)
  }

  // ── 월 이동 ───────────────────────────────────────────────────
  function shiftMonth(delta: number) {
    const [y, m] = month.split("-").map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setMonth(toMonthStr(d))
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-gray-900">매체 비용 정산</h1>
            <p className="text-xs text-gray-400 mt-0.5">정산 리포트 · 매체 비용</p>
          </div>
          <div className="flex items-center gap-3">
            {/* 이전 정산 */}
            <button
              onClick={() => setShowHistory(v => !v)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                showHistory ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              정산 이력
              {snapshots.length > 0 && (
                <span className="ml-0.5 rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] text-white leading-none">
                  {snapshots.length}
                </span>
              )}
            </button>
            {/* 월 선택 */}
            <div className="flex items-center gap-1">
              <button onClick={() => shiftMonth(-1)} className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors">‹</button>
              <input
                type="month"
                value={month}
                onChange={e => e.target.value && setMonth(e.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <button onClick={() => shiftMonth(1)} className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors">›</button>
            </div>
          </div>
        </div>
      </header>

      <main className="p-6 space-y-6">

        {/* 정산 이력 패널 */}
        {showHistory && (
          <div className="rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-5 py-3.5 flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-700">정산 확정 이력</p>
              <span className="text-[11px] text-gray-400">{snapshots.length}건</span>
            </div>
            {snapshots.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-gray-400">정산 확정 이력이 없습니다.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {snapshots.map(sn => {
                  const d = new Date(sn.snapshotAt)
                  const dateStr = `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
                  return (
                    <li key={sn.id} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-gray-50/50 transition-colors">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-gray-800">{sn.month}</p>
                          {sn.note && <span className="text-xs text-gray-500">{sn.note}</span>}
                        </div>
                        <div className="mt-0.5 flex items-center gap-3 text-[11px] text-gray-400">
                          <span>{dateStr} 확정</span>
                          <span>·</span>
                          <span>집행합계 ₩{fmt(sn.totalSpend)}</span>
                          <span>·</span>
                          <span>순매체비용 ₩{fmt(sn.totalNetCost)}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => { const next = snapshots.filter(s => s.id !== sn.id); setSnapshots(next); try { localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(next)) } catch {} }}
                        className="shrink-0 rounded-lg px-2 py-1.5 text-xs text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}

        {/* 요약 카드 */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: '총 예산', value: '₩' + fmt(totalBudget), sub: `${rows.length}개 집행 항목` },
            { label: '총 집행금액', value: '₩' + fmt(totalSpend), sub: totalBudget > 0 ? `예산 대비 ${((totalSpend / totalBudget) * 100).toFixed(1)}%` : '—' },
            { label: '순 매체비용', value: '₩' + fmt(totalNetCost), sub: totalSpend > 0 ? `마크업 차감 후 ${((totalNetCost / totalSpend) * 100).toFixed(1)}%` : '—' },
          ].map(({ label, value, sub }) => (
            <div key={label} className="rounded-xl border border-gray-200 bg-white px-5 py-4">
              <p className="text-xs text-gray-500">{label}</p>
              <p className="mt-1.5 text-2xl font-bold text-gray-900 tabular-nums">{value}</p>
              <p className="mt-0.5 text-[11px] text-gray-400">{sub}</p>
            </div>
          ))}
        </div>

        {/* 매체별 요약 */}
        {mediaMap.size > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-5 py-3.5">
              <p className="text-xs font-semibold text-gray-700">매체별 집계</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-5 py-2.5 text-left font-medium text-gray-500">매체</th>
                    <th className="px-4 py-2.5 text-right font-medium text-gray-500">집행금액</th>
                    <th className="px-4 py-2.5 text-right font-medium text-gray-500">매체 마크업</th>
                    <th className="px-4 py-2.5 text-right font-medium text-gray-500">순 매체비용</th>
                    <th className="px-4 py-2.5 text-right font-medium text-gray-500">비중</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {Array.from(mediaMap.entries()).map(([media, d]) => {
                    const markupAmt = d.spend - d.netCost
                    return (
                      <tr key={media} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-5 py-2.5">
                          <span className="font-medium text-gray-800">{media}</span>
                          <span className="ml-2 text-gray-400">마크업 {MEDIA_MARKUP_RATE[media] ?? 0}%</span>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">₩{fmt(d.spend)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">-₩{fmt(markupAmt)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-medium text-gray-800">₩{fmt(d.netCost)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">
                          {totalNetCost > 0 ? ((d.netCost / totalNetCost) * 100).toFixed(1) + '%' : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 대행사별 요약 */}
        {agencyIds.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {agencyIds.map(agId => {
              const agRows = rows.filter(r => r.agencyId === agId)
              const p = agencyPaletteMap[agId]
              const agSpend   = agRows.reduce((s, r) => s + r.spend, 0)
              const agNetCost = agRows.reduce((s, r) => s + r.netCost, 0)
              const agName    = agRows[0]?.agencyName ?? '—'
              return (
                <div key={agId} className={`rounded-xl border ${p.border} ${p.bg} px-5 py-4`}>
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${p.badge}`}>{agName}</span>
                  <p className="mt-3 text-xl font-bold text-gray-900 tabular-nums">₩{fmt(agNetCost)}</p>
                  <p className="mt-0.5 text-[11px] text-gray-500">순매체비용</p>
                  <p className="mt-2 text-xs text-gray-500">집행금액 ₩{fmt(agSpend)}</p>
                </div>
              )
            })}
          </div>
        )}

        {/* 상세 테이블 */}
        {rows.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white px-6 py-16 text-center">
            <p className="text-sm text-gray-400">해당 월에 집행된 캠페인이 없습니다.</p>
            <p className="mt-1 text-xs text-gray-300">캠페인 집행 현황에서 캠페인의 집행금액을 입력해주세요.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-700">집행 상세 ({month})</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyTsv}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                  </svg>
                  엑셀 복사
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-2.5 text-left font-medium text-gray-500 whitespace-nowrap">광고주</th>
                    <th className="px-4 py-2.5 text-left font-medium text-gray-500 whitespace-nowrap">대행사</th>
                    <th className="px-4 py-2.5 text-left font-medium text-gray-500">캠페인명</th>
                    <th className="px-4 py-2.5 text-left font-medium text-gray-500 whitespace-nowrap">매체</th>
                    <th className="px-3 py-2.5 text-center font-medium text-gray-500 whitespace-nowrap">구분</th>
                    <th className="px-4 py-2.5 text-right font-medium text-gray-500 whitespace-nowrap">예산</th>
                    <th className="px-4 py-2.5 text-right font-medium text-gray-500 whitespace-nowrap">집행금액</th>
                    <th className="px-3 py-2.5 text-center font-medium text-gray-500 whitespace-nowrap">마크업률</th>
                    <th className="px-4 py-2.5 text-right font-medium text-gray-500 whitespace-nowrap">순매체비용</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map((r, i) => {
                    const p = agencyPaletteMap[r.agencyId]
                    return (
                      <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-2.5 font-medium text-gray-800 whitespace-nowrap">{r.advertiserName}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium ${p?.badge ?? 'bg-gray-100 text-gray-600'}`}>
                            {r.agencyName}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 max-w-[180px] truncate text-gray-700" title={r.campaignName}>{r.campaignName}</td>
                        <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap">{r.media}</td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            r.kind === 'DMP'
                              ? 'bg-violet-100 text-violet-700'
                              : 'bg-gray-100 text-gray-500'
                          }`}>{r.kind}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">₩{fmt(r.budget)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">₩{fmt(r.spend)}</td>
                        <td className="px-3 py-2.5 text-center tabular-nums text-gray-500">{r.markupRate}%</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-800">
                          ₩{fmt(r.netCost)}
                          {r.markupRate > 0 && (
                            <span className="ml-1 text-[10px] text-gray-400">(-₩{fmt(r.spend - r.netCost)})</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                    <td colSpan={5} className="px-4 py-2.5 text-xs text-gray-600">합계</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-xs text-gray-600">₩{fmt(totalBudget)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-xs text-gray-800">₩{fmt(totalSpend)}</td>
                    <td className="px-3 py-2.5"></td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-xs text-gray-900">₩{fmt(totalNetCost)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* 정산 확정 */}
        {rows.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
            <p className="text-xs font-semibold text-gray-700 mb-3">정산 확정</p>
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={noteInput}
                onChange={e => setNoteInput(e.target.value)}
                placeholder="메모 (선택)"
                className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <div className="relative">
                <button
                  onClick={handleConfirm}
                  className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                >
                  정산 확정
                </button>
                {confirmedToast && (
                  <div className="absolute right-0 top-full mt-1.5 whitespace-nowrap rounded-lg bg-gray-800 px-3 py-1.5 text-[11px] text-white shadow-lg z-10">
                    {month} 정산 확정됨 ✓
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
