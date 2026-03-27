"use client"

import { useState, useEffect, useCallback } from "react"
import type { Campaign, Agency, Advertiser } from "@/lib/campaignTypes"
import { DMP_TARGETS, DMP_FEE_RATES } from "@/lib/campaignTypes"

const STORAGE_KEY    = "ct-plus-campaigns-v7"
const AGENCY_KEY     = "ct-plus-agencies-v1"
const ADVERTISER_KEY = "ct-plus-advertisers-v1"
const AMOUNTS_KEY    = "dmp-fee-amounts-v1"

function overlapsMonth(campaign: Campaign, month: string): boolean {
  const [y, m] = month.split("-").map(Number)
  const mStart = new Date(y, m - 1, 1)
  const mEnd   = new Date(y, m, 0)
  const cStart = new Date(campaign.startDate)
  const cEnd   = new Date(campaign.endDate)
  return cStart <= mEnd && cEnd >= mStart
}

function getCampaignDmps(campaign: Campaign): string[] {
  const dmps = new Set<string>()
  for (const mb of campaign.mediaBudgets)
    for (const t of mb.dmp.targetings)
      if (DMP_TARGETS.includes(t as typeof DMP_TARGETS[number])) dmps.add(t)
  return Array.from(dmps)
}

interface AmountMap { [key: string]: number }

function toMonthStr(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

// DMP별 색상
const DMP_COLORS: Record<string, { card: string; badge: string; ring: string; bar: string }> = {
  SKP:        { card: "border-blue-400 bg-blue-50 ring-blue-200",       badge: "bg-blue-100 text-blue-700 border-blue-200",        ring: "ring-blue-400",   bar: "bg-blue-500"   },
  LOTTE:      { card: "border-red-400 bg-red-50 ring-red-200",          badge: "bg-red-100 text-red-700 border-red-200",           ring: "ring-red-400",    bar: "bg-red-500"    },
  TG360:      { card: "border-orange-400 bg-orange-50 ring-orange-200", badge: "bg-orange-100 text-orange-700 border-orange-200",  ring: "ring-orange-400", bar: "bg-orange-500" },
  WIFI:       { card: "border-teal-400 bg-teal-50 ring-teal-200",       badge: "bg-teal-100 text-teal-700 border-teal-200",        ring: "ring-teal-400",   bar: "bg-teal-500"   },
  KB:         { card: "border-yellow-400 bg-yellow-50 ring-yellow-200", badge: "bg-yellow-100 text-yellow-700 border-yellow-200",  ring: "ring-yellow-400", bar: "bg-yellow-500" },
  HyperLocal: { card: "border-purple-400 bg-purple-50 ring-purple-200", badge: "bg-purple-100 text-purple-700 border-purple-200",  ring: "ring-purple-400", bar: "bg-purple-500" },
}

function getDmpColor(dmp: string) {
  return DMP_COLORS[dmp] ?? { card: "border-gray-400 bg-gray-50 ring-gray-200", badge: "bg-gray-100 text-gray-700 border-gray-200", ring: "ring-gray-400", bar: "bg-gray-500" }
}

export default function DmpFeePage() {
  const today = new Date()
  const [month, setMonth]             = useState(toMonthStr(today))
  const [campaigns, setCampaigns]     = useState<Campaign[]>([])
  const [agencies, setAgencies]       = useState<Agency[]>([])
  const [advertisers, setAdvertisers] = useState<Advertiser[]>([])
  const [amounts, setAmounts]         = useState<AmountMap>({})
  const [copied, setCopied]           = useState(false)
  const [selectedDmp, setSelectedDmp] = useState<string | null>(null)

  useEffect(() => {
    try {
      const c  = localStorage.getItem(STORAGE_KEY)
      const ag = localStorage.getItem(AGENCY_KEY)
      const adv = localStorage.getItem(ADVERTISER_KEY)
      const am = localStorage.getItem(AMOUNTS_KEY)
      if (c)   setCampaigns(JSON.parse(c))
      if (ag)  setAgencies(JSON.parse(ag))
      if (adv) setAdvertisers(JSON.parse(adv))
      if (am)  setAmounts(JSON.parse(am))
    } catch {}
  }, [])

  const saveAmounts = useCallback((next: AmountMap) => {
    setAmounts(next)
    try { localStorage.setItem(AMOUNTS_KEY, JSON.stringify(next)) } catch {}
  }, [])

  function setAmount(campaignId: string, dmp: string, value: number) {
    saveAmounts({ ...amounts, [`${campaignId}|${dmp}`]: value })
  }

  function getAmount(campaignId: string, dmp: string): number {
    return amounts[`${campaignId}|${dmp}`] ?? 0
  }

  const filtered = campaigns.filter(c => overlapsMonth(c, month) && getCampaignDmps(c).length > 0)

  function getAdvertiserName(c: Campaign) {
    return advertisers.find(a => a.id === c.advertiserId)?.name ?? "-"
  }
  function getAgencyName(c: Campaign) {
    const adv = advertisers.find(a => a.id === c.advertiserId)
    return agencies.find(a => a.id === adv?.agencyId)?.name ?? "-"
  }

  // DMP별 집계 (전체 기준)
  const dmpSummary: Record<string, { spend: number; fee: number }> = {}
  for (const dmp of DMP_TARGETS) dmpSummary[dmp] = { spend: 0, fee: 0 }
  for (const c of filtered) {
    for (const dmp of getCampaignDmps(c)) {
      const spend = getAmount(c.id, dmp)
      const fee   = Math.round(spend * (DMP_FEE_RATES[dmp] ?? 0) / 100)
      dmpSummary[dmp].spend += spend
      dmpSummary[dmp].fee   += fee
    }
  }

  // 결과 행 (전체)
  type ResultRow = { advertiserName: string; agencyName: string; campaignName: string; dmp: string; spend: number; feeRate: number; fee: number }
  const allResultRows: ResultRow[] = []
  for (const c of filtered) {
    for (const dmp of getCampaignDmps(c)) {
      const spend   = getAmount(c.id, dmp)
      const feeRate = DMP_FEE_RATES[dmp] ?? 0
      const fee     = Math.round(spend * feeRate / 100)
      allResultRows.push({ advertiserName: getAdvertiserName(c), agencyName: getAgencyName(c), campaignName: c.campaignName, dmp, spend, feeRate, fee })
    }
  }

  const visibleResultRows = selectedDmp ? allResultRows.filter(r => r.dmp === selectedDmp) : allResultRows
  const totalSpend = visibleResultRows.reduce((s, r) => s + r.spend, 0)
  const totalFee   = visibleResultRows.reduce((s, r) => s + r.fee, 0)

  function fmt(n: number) { return n.toLocaleString() }

  function copyAsExcel() {
    const header = ["광고주", "대행사", "캠페인", "DMP", "집행금액", "수수료율(%)", "정산금액"].join("\t")
    const rows   = visibleResultRows.map(r =>
      [r.advertiserName, r.agencyName, r.campaignName, r.dmp, r.spend, r.feeRate, r.fee].join("\t")
    )
    const total = ["합계", "", "", "", totalSpend, "", totalFee].join("\t")
    navigator.clipboard.writeText([header, ...rows, total].join("\n")).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function shiftMonth(dir: -1 | 1) {
    const [y, m] = month.split("-").map(Number)
    setMonth(toMonthStr(new Date(y, m - 1 + dir, 1)))
  }

  function toggleDmp(dmp: string) {
    setSelectedDmp(prev => prev === dmp ? null : dmp)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-base font-semibold text-gray-900">DMP 수수료</h1>
        <p className="text-xs text-gray-400 mt-0.5">정산 리포트 · DMP 수수료</p>
      </header>

      <main className="p-6 space-y-6">

        {/* 정산 월 선택 */}
        <div className="flex items-center gap-3">
          <button onClick={() => shiftMonth(-1)} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">‹</button>
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button onClick={() => shiftMonth(1)} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">›</button>
          <span className="text-sm text-gray-400">정산 대상 캠페인 {filtered.length}개</span>
        </div>

        {/* DMP별 요약 카드 (클릭 가능) */}
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">DMP 선택</span>
            {selectedDmp && (
              <button
                onClick={() => setSelectedDmp(null)}
                className="rounded-full border border-gray-200 bg-white px-3 py-0.5 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
              >
                전체 보기
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {DMP_TARGETS.map(dmp => {
              const s       = dmpSummary[dmp]
              const rate    = DMP_FEE_RATES[dmp] ?? 0
              const clr     = getDmpColor(dmp)
              const isOn    = selectedDmp === dmp
              const isDimmed = selectedDmp !== null && !isOn
              return (
                <button
                  key={dmp}
                  onClick={() => toggleDmp(dmp)}
                  className={`group relative rounded-xl border-2 px-4 py-3 shadow-sm text-left transition-all duration-150 ${
                    isOn
                      ? `${clr.card} ring-2 scale-[1.02]`
                      : isDimmed
                      ? "border-gray-200 bg-white opacity-40"
                      : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-md"
                  }`}
                >
                  {/* 선택 표시 */}
                  {isOn && (
                    <span className="absolute top-2 right-2 flex h-4 w-4 items-center justify-center rounded-full bg-white/80 text-[10px] font-bold text-gray-700">✓</span>
                  )}
                  <p className="text-xs font-bold text-gray-700">{dmp}</p>
                  <p className="mt-0.5 text-xs text-gray-400">{rate > 0 ? `${rate}%` : "수수료 없음"}</p>
                  <p className="mt-2 text-sm font-semibold text-gray-800">{fmt(s.fee)}원</p>
                  <p className="text-xs text-gray-400">집행 {fmt(s.spend)}원</p>
                </button>
              )
            })}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white py-16 text-center text-sm text-gray-400">
            해당 월에 DMP를 사용하는 캠페인이 없습니다.
          </div>
        ) : (
          <>
            {/* 집행 금액 입력 테이블 */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
                <div>
                  <h2 className="text-sm font-semibold text-gray-800">집행 금액 입력</h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {selectedDmp ? `${selectedDmp} DMP만 표시 중` : "전체 DMP"}
                    {" · "}DMP별 실제 집행 금액을 입력하면 정산 금액이 자동 계산됩니다.
                  </p>
                </div>
                {selectedDmp && (
                  <button
                    onClick={() => setSelectedDmp(null)}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                  >
                    전체 보기
                  </button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500">
                      <th className="px-4 py-2.5 text-left font-medium">광고주</th>
                      <th className="px-4 py-2.5 text-left font-medium">캠페인</th>
                      <th className="px-4 py-2.5 text-left font-medium">DMP</th>
                      <th className="px-4 py-2.5 text-right font-medium">수수료율</th>
                      <th className="px-4 py-2.5 text-right font-medium w-44">집행 금액 (원)</th>
                      <th className="px-4 py-2.5 text-right font-medium">정산 금액 (원)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtered.map(c => {
                      const allDmps     = getCampaignDmps(c)
                      const visibleDmps = selectedDmp ? allDmps.filter(d => d === selectedDmp) : allDmps
                      if (visibleDmps.length === 0) return null
                      return visibleDmps.map((dmp, di) => {
                        const spend   = getAmount(c.id, dmp)
                        const feeRate = DMP_FEE_RATES[dmp] ?? 0
                        const fee     = Math.round(spend * feeRate / 100)
                        const clr     = getDmpColor(dmp)
                        const isOn    = selectedDmp === dmp
                        return (
                          <tr
                            key={`${c.id}|${dmp}`}
                            className={`transition-colors border-l-4 ${isOn ? `border-l-current` : "border-l-transparent hover:bg-gray-50/50"}`}
                            style={isOn ? { borderLeftColor: "" } : {}}
                          >
                            {di === 0 && (
                              <td rowSpan={visibleDmps.length} className="px-4 py-2 align-top">
                                <p className="font-medium text-gray-800">{getAdvertiserName(c)}</p>
                                <p className="text-xs text-gray-400">{getAgencyName(c)}</p>
                              </td>
                            )}
                            {di === 0 && (
                              <td rowSpan={visibleDmps.length} className="px-4 py-2 align-top">
                                <p className="text-gray-700">{c.campaignName}</p>
                                <p className="text-xs text-gray-400 mt-0.5">{c.startDate} ~ {c.endDate}</p>
                              </td>
                            )}
                            <td className="px-4 py-2">
                              <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${clr.badge}`}>
                                {dmp}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right text-gray-500">{feeRate}%</td>
                            <td className="px-4 py-2">
                              <input
                                type="number"
                                min={0}
                                step={1000}
                                value={spend || ""}
                                placeholder="0"
                                onFocus={() => setSelectedDmp(dmp)}
                                onChange={e => setAmount(c.id, dmp, Number(e.target.value))}
                                className={`w-full rounded-lg border px-3 py-1.5 text-right text-sm transition-colors focus:outline-none focus:ring-2 ${
                                  isOn
                                    ? `border-gray-300 focus:ring-2 ${clr.ring}`
                                    : "border-gray-200 focus:border-blue-400 focus:ring-blue-400"
                                }`}
                              />
                            </td>
                            <td className="px-4 py-2 text-right font-medium text-blue-700">
                              {spend > 0 ? fmt(fee) : "-"}
                            </td>
                          </tr>
                        )
                      })
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 정산 결과 */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
                <div>
                  <h2 className="text-sm font-semibold text-gray-800">정산 결과</h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {selectedDmp ? `${selectedDmp} 선택됨` : "전체 DMP"} · 광고주 · 캠페인 · DMP별 정산 내역
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {selectedDmp && (
                    <button
                      onClick={() => setSelectedDmp(null)}
                      className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                    >
                      전체 보기
                    </button>
                  )}
                  <button
                    onClick={copyAsExcel}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                      copied ? "border-green-200 bg-green-50 text-green-700" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {copied ? "✓ 복사됨" : "📋 엑셀 복사"}
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500">
                      <th className="px-4 py-2.5 text-left font-medium">광고주</th>
                      <th className="px-4 py-2.5 text-left font-medium">대행사</th>
                      <th className="px-4 py-2.5 text-left font-medium">캠페인</th>
                      <th className="px-4 py-2.5 text-left font-medium">DMP</th>
                      <th className="px-4 py-2.5 text-right font-medium">집행 금액</th>
                      <th className="px-4 py-2.5 text-right font-medium">수수료율</th>
                      <th className="px-4 py-2.5 text-right font-medium">정산 금액</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {visibleResultRows.map((r, i) => {
                      const clr = getDmpColor(r.dmp)
                      return (
                        <tr key={i} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-2.5 font-medium text-gray-800">{r.advertiserName}</td>
                          <td className="px-4 py-2.5 text-gray-500">{r.agencyName}</td>
                          <td className="px-4 py-2.5 text-gray-700">{r.campaignName}</td>
                          <td className="px-4 py-2.5">
                            <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${clr.badge}`}>{r.dmp}</span>
                          </td>
                          <td className="px-4 py-2.5 text-right text-gray-700">{r.spend > 0 ? fmt(r.spend) : "-"}</td>
                          <td className="px-4 py-2.5 text-right text-gray-500">{r.feeRate}%</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-blue-700">{r.spend > 0 ? fmt(r.fee) : "-"}</td>
                        </tr>
                      )
                    })}
                    <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                      <td colSpan={4} className="px-4 py-2.5 text-gray-700">
                        합계 {selectedDmp ? `(${selectedDmp})` : "(전체)"}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-800">{fmt(totalSpend)}</td>
                      <td className="px-4 py-2.5"></td>
                      <td className="px-4 py-2.5 text-right text-blue-700">{fmt(totalFee)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
