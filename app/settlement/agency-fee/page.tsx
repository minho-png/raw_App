"use client"

import { useState, useMemo, useEffect } from "react"
import type { Campaign, Agency } from "@/lib/campaignTypes"
import { useMasterData } from "@/lib/hooks/useMasterData"
import { useRawData } from "@/lib/hooks/useRawData"
import { applyMarkupToRows } from "@/lib/markupService"

const SNAPSHOTS_KEY  = "agency-fee-snapshots-v1"

interface ResultRow {
  advertiserName: string
  agencyName: string
  agencyId: string
  campaignName: string
  media: string
  kind: "DMP" | "비DMP"
  spend: number
  feeRate: number
  fee: number
}

interface SettlementSnapshot {
  id: string
  month: string
  snapshotAt: string
  rows: ResultRow[]
  totalSpend: number
  totalFee: number
}

function toMonthStr(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

function overlapsMonth(campaign: Campaign, month: string): boolean {
  const [y, m] = month.split("-").map(Number)
  const mStart = new Date(y, m - 1, 1)
  const mEnd   = new Date(y, m, 0)
  const cStart = new Date(campaign.startDate)
  const cEnd   = new Date(campaign.endDate)
  return cStart <= mEnd && cEnd >= mStart
}

function fmt(n: number) { return n.toLocaleString("ko-KR") }

const AGENCY_PALETTE = [
  { card: "border-blue-300 bg-blue-50",     badge: "bg-blue-100 text-blue-700 border-blue-200"       },
  { card: "border-violet-300 bg-violet-50", badge: "bg-violet-100 text-violet-700 border-violet-200" },
  { card: "border-teal-300 bg-teal-50",     badge: "bg-teal-100 text-teal-700 border-teal-200"       },
  { card: "border-orange-300 bg-orange-50", badge: "bg-orange-100 text-orange-700 border-orange-200" },
  { card: "border-pink-300 bg-pink-50",     badge: "bg-pink-100 text-pink-700 border-pink-200"       },
  { card: "border-yellow-300 bg-yellow-50", badge: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  { card: "border-cyan-300 bg-cyan-50",     badge: "bg-cyan-100 text-cyan-700 border-cyan-200"       },
  { card: "border-red-300 bg-red-50",       badge: "bg-red-100 text-red-700 border-red-200"           },
]

export default function AgencyFeePage() {
  const today = new Date()
  const { campaigns, agencies, advertisers } = useMasterData()
  const { allRows: rawRows } = useRawData()

  const [month, setMonth]             = useState(toMonthStr(today))
  const [snapshots, setSnapshots]     = useState<SettlementSnapshot[]>([])
  const [showSnapshots, setShowSnapshots] = useState(false)
  const [selectedAgencyId, setSelectedAgencyId] = useState<string | null>(null)
  const [copied, setCopied]           = useState(false)
  const [notice, setNotice]           = useState<string | null>(null)

  useEffect(() => {
    try {
      const sn = localStorage.getItem(SNAPSHOTS_KEY)
      if (sn) setSnapshots(JSON.parse(sn))
    } catch {}
  }, [])

  function shiftMonth(dir: -1 | 1) {
    const [y, m] = month.split("-").map(Number)
    setMonth(toMonthStr(new Date(y, m - 1 + dir, 1)))
  }

  function getAdvertiserName(c: Campaign): string {
    return advertisers.find(a => a.id === c.advertiserId)?.name ?? "-"
  }
  function resolveAgencyId(c: Campaign): string {
    const adv = advertisers.find(a => a.id === c.advertiserId)
    return adv?.agencyId ?? c.agencyId ?? ""
  }
  function getAgencyName(agencyId: string): string {
    return agencies.find(a => a.id === agencyId)?.name ?? "-"
  }

  const filtered = campaigns.filter(c => overlapsMonth(c, month))

  // raw data 기반 실제 집행금액 계산
  const computedRows = useMemo(
    () => applyMarkupToRows(rawRows, campaigns),
    [rawRows, campaigns]
  )

  // campaign × media 별 DMP/비DMP netAmount 합산
  const spendMap = useMemo(() => {
    const [y, m] = month.split("-").map(Number)
    const mStart = new Date(y, m - 1, 1)
    const mEnd   = new Date(y, m, 0, 23, 59, 59)
    const map = new Map<string, { dmp: number; nonDmp: number }>()
    for (const row of computedRows) {
      if (!row.matchedCampaignId) continue
      const dt = new Date(row.date)
      if (dt < mStart || dt > mEnd) continue
      const key  = `${row.matchedCampaignId}:${row.media}`
      const prev = map.get(key) ?? { dmp: 0, nonDmp: 0 }
      const isDmpRow = row.dmpType !== "DIRECT" && row.dmpType !== "MEDIA_TARGETING"
      if (isDmpRow) prev.dmp    += row.netAmount ?? 0
      else          prev.nonDmp += row.netAmount ?? 0
      map.set(key, prev)
    }
    return map
  }, [computedRows, month])

  // 전체 결과 행 생성 (raw data 기반)
  const allRows: ResultRow[] = []
  for (const c of filtered) {
    const agencyId   = resolveAgencyId(c)
    const agencyName = getAgencyName(agencyId)
    const advName    = getAdvertiserName(c)
    for (const mb of c.mediaBudgets) {
      const spend   = spendMap.get(`${c.id}:${mb.media}`) ?? { dmp: 0, nonDmp: 0 }
      const dmpRate = mb.dmp.agencyFeeRate > 0 ? mb.dmp.agencyFeeRate : (c.agencyFeeRate ?? 0)
      const nonRate = mb.nonDmp.agencyFeeRate > 0 ? mb.nonDmp.agencyFeeRate : (c.agencyFeeRate ?? 0)

      if (spend.dmp > 0 && dmpRate > 0) {
        allRows.push({
          advertiserName: advName, agencyName, agencyId,
          campaignName: c.campaignName, media: mb.media,
          kind: "DMP",
          spend: Math.round(spend.dmp),
          feeRate: dmpRate,
          fee: Math.round(spend.dmp * dmpRate / 100),
        })
      }
      if (spend.nonDmp > 0 && nonRate > 0) {
        allRows.push({
          advertiserName: advName, agencyName, agencyId,
          campaignName: c.campaignName, media: mb.media,
          kind: "비DMP",
          spend: Math.round(spend.nonDmp),
          feeRate: nonRate,
          fee: Math.round(spend.nonDmp * nonRate / 100),
        })
      }
    }
  }

  const agencyStats: Record<string, { spend: number; fee: number; count: number }> = {}
  for (const r of allRows) {
    if (!agencyStats[r.agencyId]) agencyStats[r.agencyId] = { spend: 0, fee: 0, count: 0 }
    agencyStats[r.agencyId].spend += r.spend
    agencyStats[r.agencyId].fee   += r.fee
    agencyStats[r.agencyId].count++
  }

  const agencyList = agencies.filter(ag => agencyStats[ag.id])
  const agencyColorMap: Record<string, typeof AGENCY_PALETTE[number]> = {}
  agencyList.forEach((ag, i) => {
    agencyColorMap[ag.id] = AGENCY_PALETTE[i % AGENCY_PALETTE.length]
  })

  const visibleRows = selectedAgencyId
    ? allRows.filter(r => r.agencyId === selectedAgencyId)
    : allRows

  const totalSpend = visibleRows.reduce((s, r) => s + r.spend, 0)
  const totalFee   = visibleRows.reduce((s, r) => s + r.fee, 0)
  const hasSnapshot = snapshots.some(s => s.month === month)

  const selectedAgency = agencies.find(a => a.id === selectedAgencyId) ?? null
  const selectedFee    = selectedAgencyId ? (agencyStats[selectedAgencyId]?.fee ?? 0) : 0
  const taxBase        = selectedFee
  const taxAmount      = Math.round(taxBase * 0.1)
  const taxTotal       = taxBase + taxAmount

  function downloadRegistrationPdf(ag: Agency) {
    if (!ag.registrationPdfBase64) return
    const binary = atob(ag.registrationPdfBase64)
    const bytes  = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const blob = new Blob([bytes], { type: "application/pdf" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href     = url
    a.download = ag.registrationPdfName ?? `사업자등록증_${ag.name}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  function copyAsExcel() {
    const header = ["광고주", "대행사", "캐페인", "매체", "구분", "집행금액", "수수료율(%)", "정산금액"].join("\t")
    const rows   = visibleRows.map(r =>
      [r.advertiserName, r.agencyName, r.campaignName, r.media, r.kind, r.spend, r.feeRate, r.fee].join("\t")
    )
    const total = ["합계", "", "", "", "", totalSpend, "", totalFee].join("\t")
    navigator.clipboard.writeText([header, ...rows, total].join("\n")).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function confirmSettlement() {
    if (allRows.length === 0) return
    if (!confirm(`${month} 정산을 확정하시겠습니까?\n현재 집행 금액을 스냅샷으로 저장합니다.`)) return
    const snapshot: SettlementSnapshot = {
      id: Date.now().toString(),
      month,
      snapshotAt: new Date().toISOString(),
      rows: allRows,
      totalSpend: allRows.reduce((s, r) => s + r.spend, 0),
      totalFee:   allRows.reduce((s, r) => s + r.fee, 0),
    }
    const next = [snapshot, ...snapshots]
    setSnapshots(next)
    try { localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(next)) } catch {}
    setNotice(`✓ ${month} 정산이 확정되었습니다.`)
    setTimeout(() => setNotice(null), 3000)
  }

  function downloadSnapshot(snap: SettlementSnapshot) {
    const header = "광고주\t대행사\t캐페인\t매체\t구분\t집행금액\t수수료율(%)\t정산금액\n"
    const rows = snap.rows.map(r =>
      `${r.advertiserName}\t${r.agencyName}\t${r.campaignName}\t${r.media}\t${r.kind}\t${r.spend}\t${r.feeRate}\t${r.fee}`
    ).join("\n")
    const total = `합계\t\t\t\t\t${snap.totalSpend}\t\t${snap.totalFee}`
    const blob = new Blob(["\ufeff" + header + rows + "\n" + total], { type: "text/tab-separated-values;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `대행수수료_${snap.month}.tsv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-gray-900">대행사별 대행수수료</h1>
            <p className="text-xs text-gray-400 mt-0.5">정산 리포트 · 대행사별 대행수수료</p>
          </div>
          <button
            onClick={() => setShowSnapshots(v => !v)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              showSnapshots
                ? "border-green-300 bg-green-50 text-green-700"
                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
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
      </header>

      <main className="p-6 space-y-6">
        {notice && (
          <div className={`rounded-lg border px-4 py-3 text-sm font-medium ${
            notice.startsWith("✓")
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-yellow-200 bg-yellow-50 text-yellow-700"
          }`}>
            {notice}
          </div>
        )}

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
                          {d.getFullYear()}.{String(d.getMonth()+1).padStart(2,"0")}.{String(d.getDate()).padStart(2,"0")}
                          {" · "}집행 {fmt(snap.totalSpend)}원 · 수수료 {fmt(snap.totalFee)}원
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

        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => shiftMonth(-1)} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">‹</button>
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button onClick={() => shiftMonth(1)} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">›</button>
          <span className="text-sm text-gray-400">집행 캐페인 {filtered.length}개</span>
          {hasSnapshot && (
            <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 border border-green-200">
              ✓ 확정 완료
            </span>
          )}
          {allRows.length === 0 && filtered.length > 0 && (
            <span className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-700 border border-yellow-200">
              raw 데이터 없음
            </span>
          )}
        </div>

        {agencyList.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">대행사 선택</span>
              {selectedAgencyId && (
                <button
                  onClick={() => setSelectedAgencyId(null)}
                  className="rounded-full border border-gray-200 bg-white px-3 py-0.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
                >
                  전체 보기
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {agencyList.map(ag => {
                const stats   = agencyStats[ag.id]
                const clr     = agencyColorMap[ag.id]
                const isOn    = selectedAgencyId === ag.id
                const isDimmed = selectedAgencyId !== null && !isOn
                return (
                  <button
                    key={ag.id}
                    onClick={() => setSelectedAgencyId(prev => prev === ag.id ? null : ag.id)}
                    className={`relative rounded-xl border-2 px-4 py-3 text-left shadow-sm transition-all duration-150 ${
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
                    <p className="text-xs font-bold text-gray-700 truncate">{ag.name}</p>
                    <p className="mt-0.5 text-xs text-gray-400">{stats.count}건</p>
                    <p className="mt-2 text-sm font-semibold text-gray-800">{fmt(stats.fee)}원</p>
                    <p className="text-xs text-gray-400">집행 {fmt(stats.spend)}원</p>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {selectedAgency && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b border-blue-100 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-sm font-semibold text-blue-800">세금계산서 발행 정보</p>
                <span className="rounded-full bg-blue-100 border border-blue-200 px-2 py-0.5 text-xs font-semibold text-blue-700">{selectedAgency.name}</span>
              </div>
              {selectedAgency.registrationPdfBase64 && (
                <button
                  onClick={() => downloadRegistrationPdf(selectedAgency)}
                  className="flex items-center gap-1.5 rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 transition-colors"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  사업자등록증 PDF
                </button>
              )}
            </div>
            <div className="p-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-3">공급받는자 정보</p>
                <dl className="space-y-2">
                  {[
                    { label: "상호(법인명)",   value: selectedAgency.corporateName  || selectedAgency.name },
                    { label: "사업자등록번호", value: selectedAgency.businessNumber || "-" },
                    { label: "대표자명",         value: selectedAgency.representative || "-" },
                    { label: "주소",             value: selectedAgency.address        || "-" },
                    { label: "업태",             value: selectedAgency.businessType   || "-" },
                    { label: "종목",             value: selectedAgency.businessItem   || "-" },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-baseline gap-2">
                      <dt className="w-28 shrink-0 text-xs text-blue-500 font-medium">{label}</dt>
                      <dd className="text-xs text-gray-800 font-medium">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div>
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-3">금액 정보 ({month})</p>
                <dl className="space-y-2">
                  <div className="flex items-baseline justify-between border-b border-blue-100 pb-2">
                    <dt className="text-xs text-blue-500 font-medium">공급가액 (수수료 합계)</dt>
                    <dd className="text-sm font-semibold text-gray-800">{fmt(taxBase)}원</dd>
                  </div>
                  <div className="flex items-baseline justify-between border-b border-blue-100 pb-2">
                    <dt className="text-xs text-blue-500 font-medium">세액 (10%)</dt>
                    <dd className="text-sm font-semibold text-gray-800">{fmt(taxAmount)}원</dd>
                  </div>
                  <div className="flex items-baseline justify-between pt-1">
                    <dt className="text-sm font-bold text-blue-700">합계금액</dt>
                    <dd className="text-base font-bold text-blue-700">{fmt(taxTotal)}원</dd>
                  </div>
                </dl>
                {!selectedAgency.businessNumber && (
                  <p className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-700">
                    ⚠ 사업자 정보가 등록되지 않았습니다. 대행사 관리에서 세금계산서 등록 정보를 입력해주세요.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white py-16 text-center text-sm text-gray-400">
            해당 월에 해당하는 캐페인이 없습니다.
          </div>
        ) : allRows.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white py-16 text-center">
            <p className="text-sm text-gray-400">해당 월 raw 데이터가 없거나 수수료율이 설정되지 않았습니다.</p>
            <p className="mt-1 text-xs text-gray-500">CSV를 업로드하고, 캀페인 설정에서 대행수수료율을 입력해주세요.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">정산 결과</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {selectedAgencyId
                    ? `${agencies.find(a => a.id === selectedAgencyId)?.name} 선택됨`
                    : "전체 대행사"
                  }
                  {" · "}광고주 · 캐페인 · 매체별 대행수수료 내역
                </p>
              </div>
              <div className="flex items-center gap-2">
                {selectedAgencyId && (
                  <button
                    onClick={() => setSelectedAgencyId(null)}
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
                  {copied ? "✓ 복사됨" : "엑셀 복사"}
                </button>
                <button
                  onClick={confirmSettlement}
                  disabled={allRows.length === 0}
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
                    <th className="px-4 py-2.5 text-left font-medium">캐페인</th>
                    <th className="px-4 py-2.5 text-left font-medium">매체</th>
                    <th className="px-4 py-2.5 text-left font-medium">구분</th>
                    <th className="px-4 py-2.5 text-right font-medium">집행 금액</th>
                    <th className="px-4 py-2.5 text-right font-medium">수수료율</th>
                    <th className="px-4 py-2.5 text-right font-medium">정산 금액</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {visibleRows.map((r, i) => {
                    const clr = agencyColorMap[r.agencyId] ?? AGENCY_PALETTE[0]
                    const isOn = selectedAgencyId === r.agencyId
                    return (
                      <tr
                        key={i}
                        className={`transition-colors ${isOn ? "bg-blue-50/40" : "hover:bg-gray-50/50"}`}
                      >
                        <td className="px-4 py-2.5 font-medium text-gray-800">{r.advertiserName}</td>
                        <td className="px-4 py-2.5">
                          <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${clr.badge}`}>
                            {r.agencyName}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-700">{r.campaignName}</td>
                        <td className="px-4 py-2.5 text-gray-500">{r.media}</td>
                        <td className="px-4 py-2.5">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            r.kind === "DMP"
                              ? "bg-purple-50 text-purple-700 border border-purple-200"
                              : "bg-gray-50 text-gray-600 border border-gray-200"
                          }`}>
                            {r.kind}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-700">{fmt(r.spend)}</td>
                        <td className="px-4 py-2.5 text-right text-gray-500">{r.feeRate}%</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-blue-700">{fmt(r.fee)}</td>
                      </tr>
                    )
                  })}
                  <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                    <td colSpan={5} className="px-4 py-2.5 text-gray-700">
                      합계 {selectedAgencyId ? `(${agencies.find(a => a.id === selectedAgencyId)?.name})` : "(전체)"}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-800">{fmt(totalSpend)}</td>
                    <td className="px-4 py-2.5" />
                    <td className="px-4 py-2.5 text-right text-blue-700">{fmt(totalFee)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

      </main>
    </div>
  )
}
