"use client"

import { useState, useEffect, useCallback } from "react"
import type { Campaign, Agency, Advertiser } from "@/lib/campaignTypes"
import { DMP_TARGETS, DMP_FEE_RATES } from "@/lib/campaignTypes"
import type { RawRow, DmpType } from "@/lib/rawDataParser"
import { calcDmpSettlement, DMP_FEE_RATES_PERCENT } from "@/lib/calculationService"
import type { MediaType } from "@/lib/reportTypes"

const STORAGE_KEY    = "ct-plus-campaigns-v7"
const AGENCY_KEY     = "ct-plus-agencies-v1"
const ADVERTISER_KEY = "ct-plus-advertisers-v1"
const AMOUNTS_KEY    = "dmp-fee-amounts-v1"
const REPORTS_KEY    = "ct-plus-daily-reports-v1"
const SNAPSHOTS_KEY  = "dmp-settlement-snapshots-v1"

// 데일리 리포트 타입 (daily/page.tsx와 동일)
interface SavedReport {
  id: string
  savedAt: string
  label: string
  campaignName: string | null
  mediaTypes: MediaType[]
  rowsByMedia: Partial<Record<MediaType, RawRow[]>>
  campaign: Campaign | null
}

// 스냅샷 타입
interface SettlementSnapshot {
  id: string
  month: string
  snapshotAt: string
  rows: Array<{
    advertiserName: string
    agencyName: string
    campaignName: string
    dmp: string
    spend: number
    feeRate: number
    fee: number
  }>
  totalSpend: number
  totalFee: number
  note?: string
}

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
  BC:         { card: "border-gray-400 bg-gray-50 ring-gray-200",       badge: "bg-gray-100 text-gray-700 border-gray-200",        ring: "ring-gray-400",   bar: "bg-gray-500"   },
  SH:         { card: "border-slate-400 bg-slate-50 ring-slate-200",    badge: "bg-slate-100 text-slate-700 border-slate-200",     ring: "ring-slate-400",  bar: "bg-slate-500"  },
  DIRECT:     { card: "border-gray-300 bg-gray-50 ring-gray-100",       badge: "bg-gray-50 text-gray-500 border-gray-200",         ring: "ring-gray-300",   bar: "bg-gray-400"   },
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
  const [snapshots, setSnapshots]     = useState<SettlementSnapshot[]>([])
  const [showSnapshots, setShowSnapshots] = useState(false)
  const [importResult, setImportResult] = useState<string | null>(null)
  const [showImportPanel, setShowImportPanel] = useState(false)
  const [savedReports, setSavedReports] = useState<SavedReport[]>([])

  useEffect(() => {
    try {
      const c   = localStorage.getItem(STORAGE_KEY)
      const ag  = localStorage.getItem(AGENCY_KEY)
      const adv = localStorage.getItem(ADVERTISER_KEY)
      const am  = localStorage.getItem(AMOUNTS_KEY)
      const sn  = localStorage.getItem(SNAPSHOTS_KEY)
      const rpts = localStorage.getItem(REPORTS_KEY)
      if (c)    setCampaigns(JSON.parse(c))
      if (ag)   setAgencies(JSON.parse(ag))
      if (adv)  setAdvertisers(JSON.parse(adv))
      if (am)   setAmounts(JSON.parse(am))
      if (sn)   setSnapshots(JSON.parse(sn))
      if (rpts) setSavedReports(JSON.parse(rpts))
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

  // ── 데일리 리포트에서 DMP 집행 금액 자동 가져오기 ────────────
  function importFromDailyReports() {
    // 해당 월의 저장된 리포트에서 rawRows 추출
    const [y, m] = month.split("-").map(Number)
    const mStart = new Date(y, m - 1, 1)
    const mEnd   = new Date(y, m, 0)

    const monthReports = savedReports.filter(r => {
      // 리포트 날짜 범위가 정산월과 겹치는지 확인
      const allDates = Object.values(r.rowsByMedia).flatMap(rows => rows?.map(row => row.date) ?? [])
      return allDates.some(d => {
        const dt = new Date(d)
        return dt >= mStart && dt <= mEnd
      })
    })

    if (monthReports.length === 0) {
      setImportResult("해당 월의 저장된 데일리 리포트가 없습니다.")
      return
    }

    // 모든 RawRow 수집
    const allRows: RawRow[] = []
    for (const report of monthReports) {
      for (const rows of Object.values(report.rowsByMedia)) {
        if (!rows) continue
        for (const row of rows) {
          const dt = new Date(row.date)
          if (dt >= mStart && dt <= mEnd) allRows.push(row)
        }
      }
    }

    // 캠페인명으로 매칭하여 DMP별 집행 금액 집계
    const newAmounts = { ...amounts }
    let importCount = 0

    for (const campaign of filtered) {
      const matchedMedia = campaign.mediaBudgets.find(mb =>
        ['네이버 GFA', '카카오모먼트', 'Google', 'META'].includes(mb.media)
      )?.media
      const campaignRows = allRows.filter(row => row.media === (matchedMedia ?? ''))

      const dmps = getCampaignDmps(campaign)
      for (const dmp of dmps) {
        // dmpType으로 매칭 (신규 필드) 또는 dmpName 키워드 매칭 (기존)
        const dmpRows = campaignRows.filter(row => {
          if (row.dmpType) return row.dmpType === dmp
          return row.dmpName.toUpperCase().includes(dmp.toUpperCase())
        })
        if (dmpRows.length > 0) {
          const totalExec = dmpRows.reduce((s, r) => s + (r.executionAmount || r.grossCost), 0)
          newAmounts[`${campaign.id}|${dmp}`] = totalExec
          importCount++
        }
      }
    }

    saveAmounts(newAmounts)
    setImportResult(
      importCount > 0
        ? `✓ ${importCount}개 항목의 집행 금액을 데일리 리포트에서 가져왔습니다.`
        : "데일리 리포트 데이터와 매칭되는 캠페인/DMP가 없습니다."
    )
    setTimeout(() => setImportResult(null), 4000)
  }

  // ── 정산 금액 자동 계산 (전체 rawRow 기반, 캠페인 매칭 없이) ──
  function calcFromAllRows() {
    const [y, m] = month.split("-").map(Number)
    const mStart = new Date(y, m - 1, 1)
    const mEnd   = new Date(y, m, 0)

    const allRows: RawRow[] = []
    for (const report of savedReports) {
      for (const rows of Object.values(report.rowsByMedia)) {
        if (!rows) continue
        for (const row of rows) {
          const dt = new Date(row.date)
          if (dt >= mStart && dt <= mEnd) allRows.push(row)
        }
      }
    }

    if (allRows.length === 0) {
      setImportResult("해당 월의 저장된 데이터가 없습니다.")
      return
    }

    // DMP별 집계
    const settlement = calcDmpSettlement(
      allRows.map(r => ({
        dmpType: (r.dmpType as DmpType) || 'DIRECT',
        executionAmount: r.executionAmount || r.grossCost,
        netAmount: r.netAmount || r.netCost,
      }))
    )

    setImportResult(
      `✓ ${allRows.length}개 행 분석 완료: ` +
      settlement.rows.filter(r => r.dmpType !== 'DIRECT').map(r =>
        `${r.dmpType} ${r.totalExecution.toLocaleString()}원`
      ).join(', ')
    )
    setTimeout(() => setImportResult(null), 6000)
    setShowImportPanel(false)
  }

  // ── DMP별 집계 (전체 기준) ────────────────────────────────
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

  // ── 결과 행 ────────────────────────────────────────────────
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

  // ── 정산 확정 (스냅샷 저장) ──────────────────────────────────
  function confirmSettlement() {
    if (allResultRows.length === 0) return
    if (!confirm(`${month} 정산을 확정하시겠습니까?\n이 작업은 현재 집행 금액을 스냅샷으로 저장합니다.`)) return

    const snapshot: SettlementSnapshot = {
      id: Date.now().toString(),
      month,
      snapshotAt: new Date().toISOString(),
      rows: allResultRows,
      totalSpend: allResultRows.reduce((s, r) => s + r.spend, 0),
      totalFee: allResultRows.reduce((s, r) => s + r.fee, 0),
    }
    const next = [snapshot, ...snapshots]
    setSnapshots(next)
    try { localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(next)) } catch {}
    setImportResult(`✓ ${month} 정산이 확정되었습니다.`)
    setTimeout(() => setImportResult(null), 3000)
  }

  // ── 스냅샷 CSV 다운로드 ──────────────────────────────────────
  function downloadSnapshot(snap: SettlementSnapshot) {
    const header = "광고주\t대행사\t캠페인\tDMP\t집행금액\t수수료율(%)\t정산금액\n"
    const rows = snap.rows.map(r =>
      `${r.advertiserName}\t${r.agencyName}\t${r.campaignName}\t${r.dmp}\t${r.spend}\t${r.feeRate}\t${r.fee}`
    ).join("\n")
    const total = `합계\t\t\t\t${snap.totalSpend}\t\t${snap.totalFee}`
    const content = header + rows + "\n" + total

    const blob = new Blob(["\ufeff" + content], { type: "text/tab-separated-values;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `DMP정산_${snap.month}.tsv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function shiftMonth(dir: -1 | 1) {
    const [y, m] = month.split("-").map(Number)
    setMonth(toMonthStr(new Date(y, m - 1 + dir, 1)))
  }

  function toggleDmp(dmp: string) {
    setSelectedDmp(prev => prev === dmp ? null : dmp)
  }

  // 해당 월 스냅샷 존재 여부
  const hasSnapshot = snapshots.some(s => s.month === month)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-gray-900">DMP 수수료</h1>
            <p className="text-xs text-gray-400 mt-0.5">정산 리포트 · DMP 수수료</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImportPanel(v => !v)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                showImportPanel
                  ? 'border-blue-300 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              데이터 가져오기
            </button>
            <button
              onClick={() => setShowSnapshots(v => !v)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                showSnapshots
                  ? 'border-green-300 bg-green-50 text-green-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              확정 내역
              {snapshots.length > 0 && (
                <span className="rounded-full bg-green-600 px-1.5 py-0.5 text-[10px] text-white leading-none">{snapshots.length}</span>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="p-6 space-y-6">

        {/* 알림 배너 */}
        {importResult && (
          <div className={`rounded-lg px-4 py-3 text-sm font-medium flex items-center gap-2 ${
            importResult.startsWith('✓')
              ? 'bg-green-50 border border-green-200 text-green-700'
              : 'bg-yellow-50 border border-yellow-200 text-yellow-700'
          }`}>
            {importResult}
          </div>
        )}

        {/* 데이터 가져오기 패널 */}
        {showImportPanel && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
            <p className="text-sm font-semibold text-blue-800">데일리 리포트에서 DMP 집행 금액 자동 가져오기</p>
            <p className="text-xs text-blue-600">
              저장된 데일리 리포트 데이터를 분석하여 {month} 월의 DMP별 집행 금액을 자동으로 입력합니다.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={importFromDailyReports}
                className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              >
                캠페인 매칭으로 가져오기
              </button>
              <button
                onClick={calcFromAllRows}
                className="rounded-lg border border-blue-300 bg-white px-4 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
              >
                전체 데이터 DMP 분석
              </button>
              <span className="text-xs text-blue-500">저장된 리포트 {savedReports.length}개</span>
            </div>
          </div>
        )}

        {/* 확정 내역 패널 */}
        {showSnapshots && (
          <div className="rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-5 py-3.5 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-800">정산 확정 내역</p>
              <span className="text-xs text-gray-400">{snapshots.length}개</span>
            </div>
            {snapshots.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-gray-400">확정된 정산 내역이 없습니다.</div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {snapshots.map(snap => {
                  const d = new Date(snap.snapshotAt)
                  return (
                    <li key={snap.id} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-gray-50">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{snap.month} 정산 확정</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {d.getFullYear()}.{String(d.getMonth()+1).padStart(2,'0')}.{String(d.getDate()).padStart(2,'0')} · 집행 {fmt(snap.totalSpend)}원 · 수수료 {fmt(snap.totalFee)}원
                        </p>
                      </div>
                      <button
                        onClick={() => downloadSnapshot(snap)}
                        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                      >
                        ↓ TSV
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}

        {/* 정산 월 선택 */}
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => shiftMonth(-1)} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">‹</button>
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button onClick={() => shiftMonth(1)} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">›</button>
          <span className="text-sm text-gray-400">정산 대상 캠페인 {filtered.length}개</span>
          {hasSnapshot && (
            <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 border border-green-200">
              ✓ 확정 완료
            </span>
          )}
        </div>

        {/* DMP별 요약 카드 */}
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
                  <button
                    onClick={confirmSettlement}
                    disabled={allResultRows.every(r => r.spend === 0)}
                    className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    ✓ 정산 확정
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
