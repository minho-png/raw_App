"use client"

import { useState, useEffect } from "react"
import type { Campaign, Agency, Advertiser } from "@/lib/campaignTypes"
import { useMasterData } from "@/lib/hooks/useMasterData"

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

  // 전체 결과 행 생성
  const allRows: ResultRow[] = []
  for (const c of filtered) {
    const agencyId   = resolveAgencyId(c)
    const agencyName = getAgencyName(agencyId)
    const advName    = getAdvertiserName(c)
    for (const mb of c.mediaBudgets) {
      if (mb.dmp.spend > 0 && mb.dmp.agencyFeeRate > 0) {
        allRows.push({
          advertiserName: advName,
          agencyName,
          agencyId,
          campaignName: c.campaignName,
          media: mb.media,
          kind: "DMP",
          spend: mb.dmp.spend,
          feeRate: mb.dmp.agencyFeeRate,
          fee: Math.round(mb.dmp.spend * mb.dmp.agencyFeeRate / 100),
        })
      }
      if (mb.nonDmp.spend > 0 && mb.nonDmp.agencyFeeRate > 0) {
        allRows.push({
          advertiserName: advName,
          agencyName,
          agencyId,
          campaignName: c.campaignName,
          media: mb.media,
          kind: "비DMP",
          spend: mb.nonDmp.spend,
          feeRate: mb.nonDmp.agencyFeeRate,
          fee: Math.round(mb.nonDmp.spend * mb.nonDmp.agencyFeeRate / 100),
        })
      }
    }
  }

  // 대행사별 집계
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

  function copyAsExcel() {
    const header = ["광고주", "대행사", "캠페인", "매체", "구분", "집행금액", "수수료율(%)", "정산금액"].join("\t")
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
    const header = "광고주\t대행사\t캠페인\t매체\t구분\t집행금액\t수수료율(%)\t정산금액\n"
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
      {/* 헤더 */}
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

        {/* 알림 배너 */}
        {notice && (
          <div className={`rounded-lg border px-4 py-3 text-sm font-medium ${
            notice.startsWith("✓")
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-yellow-200 bg-yellow-50 text-yellow-700"
          }`}>
            {notice}
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
          <span className="text-sm text-gray-400">집행 캠페인 {filtered.length}개</span>
          {hasSnapshot && (
            <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 border border-green-200">
              ✓ 확정 완료
            </span>
          )}
        </div>

        {/* 대행사별 요약 카드 */}
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

        {/* 결과 없음 */}
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white py-16 text-center text-sm text-gray-400">
            해당 월에 해당하는 캠페인이 없습니다.
          </div>
        ) : allRows.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white py-16 text-center">
            <p className="text-sm text-gray-400">해당 월 캠페인의 집행 금액 또는 대행수수료율이 없습니다.</p>
            <p className="mt-1 text-xs text-gray-500">캠페인 집행 현황에서 집행 금액과 수수료율을 입력해주세요.</p>
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
                  {" · "}광고주 · 캠페인 · 매체별 대행수수료 내역
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
                  {copied ? "✓ 복사됨" : "📋 엑셀 복사"}
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
                    <th className="px-4 py-2.5 text-left font-medium">캠페인</th>
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
