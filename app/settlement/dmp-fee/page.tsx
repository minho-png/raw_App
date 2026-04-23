"use client"

import { useState, useMemo, useCallback } from "react"
import { DMP_FEE_RATES, DMP_TARGETS } from "@/lib/campaignTypes"
import { useMasterData } from "@/lib/hooks/useMasterData"
import { useRawData } from "@/lib/hooks/useRawData"

// ── 상수 ──────────────────────────────────────────────
const BILLABLE_DMPS = new Set(DMP_TARGETS as readonly string[])

const DMP_COLORS: Record<string, { badge: string; bar: string; card: string }> = {
  SKP:        { badge: "bg-blue-100 text-blue-700 border-blue-200",       bar: "bg-blue-500",   card: "border-blue-300 bg-blue-50" },
  LOTTE:      { badge: "bg-red-100 text-red-700 border-red-200",          bar: "bg-red-500",    card: "border-red-300 bg-red-50" },
  TG360:      { badge: "bg-orange-100 text-orange-700 border-orange-200", bar: "bg-orange-500", card: "border-orange-300 bg-orange-50" },
  WIFI:       { badge: "bg-teal-100 text-teal-700 border-teal-200",       bar: "bg-teal-500",   card: "border-teal-300 bg-teal-50" },
  KB:         { badge: "bg-yellow-100 text-yellow-700 border-yellow-200", bar: "bg-yellow-500", card: "border-yellow-300 bg-yellow-50" },
  HyperLocal: { badge: "bg-purple-100 text-purple-700 border-purple-200", bar: "bg-purple-500", card: "border-purple-300 bg-purple-50" },
  BC:         { badge: "bg-gray-100 text-gray-700 border-gray-200",       bar: "bg-gray-500",   card: "border-gray-300 bg-gray-50" },
  SH:         { badge: "bg-slate-100 text-slate-700 border-slate-200",    bar: "bg-slate-500",  card: "border-slate-300 bg-slate-50" },
}
function dmpClr(dmp: string) {
  return DMP_COLORS[dmp] ?? { badge: "bg-gray-100 text-gray-600 border-gray-200", bar: "bg-gray-400", card: "border-gray-300 bg-gray-50" }
}

// ── 타입 ──────────────────────────────────────────────
interface DmpLine {
  dmpType: string
  execAmount: number
  feeRate: number
  fee: number
  rowCount: number
}

interface CampaignGroup {
  key: string
  matchedCampaignId: string | null
  campaignName: string
  advertiserName: string
  agencyName: string
  isMatched: boolean
  dmps: DmpLine[]
  totalExec: number
  totalFee: number
}

// ── 유틸 ──────────────────────────────────────────────
function toMonthStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}
function shiftMonth(month: string, dir: number) {
  const [y, m] = month.split("-").map(Number)
  return toMonthStr(new Date(y, m - 1 + dir, 1))
}
function fmt(n: number) { return Math.round(n).toLocaleString() }

// ── 컴포넌트 ──────────────────────────────────────────
export default function DmpFeePage() {
  const { campaigns, agencies, advertisers } = useMasterData()
  const { allRows } = useRawData()

  const [month, setMonth]           = useState(() => toMonthStr(new Date()))
  const [selectedDmp, setSelectedDmp] = useState<string | null>(null)
  const [copied, setCopied]         = useState(false)
  const [expandAll, setExpandAll]   = useState(true)
  const [expanded, setExpanded]     = useState<Set<string>>(new Set())

  // ── 월별 필터 + DMP 행만 추출 ────────────────────────
  const monthRows = useMemo(() => {
    const [y, m] = month.split("-").map(Number)
    const mStart = new Date(y, m - 1, 1)
    const mEnd   = new Date(y, m, 0, 23, 59, 59)
    return allRows.filter(r => {
      if (!r.dmpType || r.dmpType === "DIRECT" || r.dmpType === "MEDIA_TARGETING") return false
      const dt = new Date(r.date)
      return dt >= mStart && dt <= mEnd
    })
  }, [allRows, month])

  // ── 캠페인 그룹화 ────────────────────────────────────
  const campaignGroups = useMemo((): CampaignGroup[] => {
    // key → { matchedId, rawCampaignName, dmpMap }
    const map = new Map<string, {
      matchedId: string | null
      rawName: string
      dmpMap: Map<string, { exec: number; count: number }>
    }>()

    for (const row of monthRows) {
      const key = row.matchedCampaignId ?? `__raw__${row.campaignName}`
      if (!map.has(key)) {
        map.set(key, { matchedId: row.matchedCampaignId ?? null, rawName: row.campaignName, dmpMap: new Map() })
      }
      const grp = map.get(key)!
      const prev = grp.dmpMap.get(row.dmpType) ?? { exec: 0, count: 0 }
      grp.dmpMap.set(row.dmpType, { exec: prev.exec + row.executionAmount, count: prev.count + 1 })
    }

    return Array.from(map.entries()).map(([key, grp]) => {
      const camp = grp.matchedId ? (campaigns.find(c => c.id === grp.matchedId) ?? null) : null
      const adv  = camp ? (advertisers.find(a => a.id === camp.advertiserId) ?? null) : null
      const ag   = adv  ? (agencies.find(a => a.id === adv.agencyId) ?? null) : null

      const dmps: DmpLine[] = Array.from(grp.dmpMap.entries())
        .map(([dmpType, { exec, count }]) => ({
          dmpType,
          execAmount: exec,
          feeRate:    DMP_FEE_RATES[dmpType] ?? 0,
          fee:        Math.round(exec * (DMP_FEE_RATES[dmpType] ?? 0) / 100),
          rowCount:   count,
        }))
        .sort((a, b) => b.execAmount - a.execAmount)

      const totalExec = dmps.reduce((s, d) => s + d.execAmount, 0)
      const totalFee  = dmps.reduce((s, d) => s + d.fee, 0)

      return {
        key,
        matchedCampaignId: grp.matchedId,
        campaignName:  camp?.campaignName ?? grp.rawName,
        advertiserName: adv?.name ?? (grp.matchedId ? "-" : "미매칭"),
        agencyName:    ag?.name ?? "-",
        isMatched:     !!grp.matchedId,
        dmps,
        totalExec,
        totalFee,
      }
    }).sort((a, b) => {
      if (a.isMatched !== b.isMatched) return a.isMatched ? -1 : 1
      return b.totalExec - a.totalExec
    })
  }, [monthRows, campaigns, advertisers, agencies])

  // ── DMP 합계 카드 ─────────────────────────────────────
  const dmpSummary = useMemo(() => {
    const s: Record<string, { exec: number; fee: number }> = {}
    for (const grp of campaignGroups)
      for (const d of grp.dmps) {
        if (!s[d.dmpType]) s[d.dmpType] = { exec: 0, fee: 0 }
        s[d.dmpType].exec += d.execAmount
        s[d.dmpType].fee  += d.fee
      }
    return s
  }, [campaignGroups])

  const activeDmps = useMemo(
    () => Object.entries(dmpSummary).filter(([, v]) => v.exec > 0).sort((a, b) => b[1].exec - a[1].exec),
    [dmpSummary]
  )

  // ── DMP 필터 적용 그룹 ────────────────────────────────
  const visibleGroups = useMemo(() => {
    if (!selectedDmp) return campaignGroups
    return campaignGroups
      .map(grp => ({
        ...grp,
        dmps: grp.dmps.filter(d => d.dmpType === selectedDmp),
      }))
      .filter(grp => grp.dmps.length > 0)
      .map(grp => ({
        ...grp,
        totalExec: grp.dmps.reduce((s, d) => s + d.execAmount, 0),
        totalFee:  grp.dmps.reduce((s, d) => s + d.fee,  0),
      }))
  }, [campaignGroups, selectedDmp])

  const grandExec = visibleGroups.reduce((s, g) => s + g.totalExec, 0)
  const grandFee  = visibleGroups.reduce((s, g) => s + g.totalFee,  0)

  const toggleExpand = useCallback((key: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }, [])

  function isOpen(key: string) { return expandAll || expanded.has(key) }

  function copyExcel() {
    const lines = ["광고주	대행사	캠페인	DMP	집행금액	수수료율(%)	정산금액"]
    for (const grp of visibleGroups)
      for (const d of grp.dmps)
        lines.push([grp.advertiserName, grp.agencyName, grp.campaignName, d.dmpType,
          Math.round(d.execAmount), d.feeRate, d.fee].join("\t"))
    lines.push(["합계","","","", Math.round(grandExec), "", Math.round(grandFee)].join("\t"))
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* 헤더 */}
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-gray-900">DMP 수수료</h1>
            <p className="text-xs text-gray-400 mt-0.5">raw 데이터 자동 집계 · 캠페인별 DMP 비용 확인</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">raw {allRows.length.toLocaleString()}행</span>
            <button
              onClick={copyExcel}
              disabled={visibleGroups.length === 0}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${
                copied ? "border-green-200 bg-green-50 text-green-700" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {copied ? "✓ 복사됨" : "📋 엑셀 복사"}
            </button>
          </div>
        </div>
      </header>

      <main className="p-6 space-y-5">

        {/* 월 선택 */}
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setMonth(m => shiftMonth(m, -1))}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">‹</button>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400" />
          <button onClick={() => setMonth(m => shiftMonth(m, 1))}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">›</button>
          <span className="text-sm text-gray-400">
            집계 행 {monthRows.length.toLocaleString()}개 · 캠페인 {visibleGroups.length}개
          </span>
        </div>

        {/* DMP 요약 카드 */}
        {activeDmps.length > 0 && (
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">
              DMP 필터 {selectedDmp && <button onClick={() => setSelectedDmp(null)} className="ml-2 normal-case rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-medium text-gray-500 hover:bg-gray-50">전체 보기</button>}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {activeDmps.map(([dmp, s]) => {
                const clr    = dmpClr(dmp)
                const rate   = DMP_FEE_RATES[dmp] ?? 0
                const isOn   = selectedDmp === dmp
                const dimmed = selectedDmp !== null && !isOn
                return (
                  <button key={dmp} onClick={() => setSelectedDmp(p => p === dmp ? null : dmp)}
                    className={`rounded-xl border-2 px-3 py-3 text-left transition-all ${
                      isOn    ? `${clr.card} ring-2 scale-[1.02] shadow-md`
                      : dimmed ? "border-gray-200 bg-white opacity-40"
                      : "border-gray-200 bg-white hover:border-gray-300 hover:shadow"
                    }`}>
                    <div className="flex items-center justify-between">
                      <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${clr.badge}`}>{dmp}</span>
                      {rate > 0 && <span className="text-[10px] text-gray-400">{rate}%</span>}
                    </div>
                    <p className="mt-2 text-sm font-bold text-gray-800">{fmt(s.fee)}원</p>
                    <p className="text-[10px] text-gray-400">집행 {fmt(s.exec)}원</p>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* 총계 배너 */}
        {visibleGroups.length > 0 && (
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-5 py-3 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-[10px] text-blue-500 font-medium uppercase tracking-wider">총 집행금액</p>
                <p className="text-lg font-bold text-blue-800">{fmt(grandExec)}<span className="text-xs font-normal ml-0.5">원</span></p>
              </div>
              <div>
                <p className="text-[10px] text-blue-500 font-medium uppercase tracking-wider">총 DMP 수수료</p>
                <p className="text-lg font-bold text-blue-700">{fmt(grandFee)}<span className="text-xs font-normal ml-0.5">원</span></p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setExpandAll(true); setExpanded(new Set()) }}
                className="rounded-lg border border-blue-200 bg-white px-2.5 py-1 text-[11px] text-blue-600 hover:bg-blue-50"
              >전체 펼침</button>
              <button
                onClick={() => { setExpandAll(false); setExpanded(new Set()) }}
                className="rounded-lg border border-blue-200 bg-white px-2.5 py-1 text-[11px] text-blue-600 hover:bg-blue-50"
              >전체 접기</button>
            </div>
          </div>
        )}

        {/* 캠페인별 테이블 */}
        {visibleGroups.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white py-16 text-center text-sm text-gray-400">
            {allRows.length === 0
              ? "raw 데이터가 없습니다. 데일리 리포트를 먼저 업로드해 주세요."
              : `${month} 월에 DMP 집행 데이터가 없습니다.`}
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-gray-100 px-5 py-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800">
                캠페인별 DMP 수수료
                {selectedDmp && <span className="ml-2 text-xs font-normal text-gray-400">({selectedDmp} 필터 적용)</span>}
              </h2>
              <span className="text-xs text-gray-400">
                {visibleGroups.filter(g => g.isMatched).length}개 매칭
                {visibleGroups.filter(g => !g.isMatched).length > 0 && ` · ${visibleGroups.filter(g => !g.isMatched).length}개 미매칭`}
              </span>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500">
                  <th className="px-4 py-2.5 text-left font-medium w-8"></th>
                  <th className="px-4 py-2.5 text-left font-medium">캠페인</th>
                  <th className="px-4 py-2.5 text-left font-medium">광고주</th>
                  <th className="px-4 py-2.5 text-left font-medium">대행사</th>
                  <th className="px-4 py-2.5 text-right font-medium">집행금액</th>
                  <th className="px-4 py-2.5 text-right font-medium">DMP 수수료</th>
                  <th className="px-4 py-2.5 text-left font-medium pl-6">DMP 상세</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibleGroups.map(grp => {
                  const open = isOpen(grp.key)
                  return (
                    <>
                      {/* 캠페인 행 */}
                      <tr
                        key={grp.key}
                        onClick={() => toggleExpand(grp.key)}
                        className={`cursor-pointer transition-colors hover:bg-gray-50 ${!grp.isMatched ? "bg-yellow-50/40" : ""}`}
                      >
                        <td className="px-4 py-2.5 text-center">
                          <span className={`text-xs text-gray-400 transition-transform inline-block ${open ? "rotate-90" : ""}`}>▶</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5">
                            {!grp.isMatched && (
                              <span className="rounded-full bg-yellow-100 border border-yellow-200 px-1.5 py-0.5 text-[9px] font-medium text-yellow-700">미매칭</span>
                            )}
                            <span className={`font-medium ${grp.isMatched ? "text-gray-800" : "text-yellow-800"}`}>
                              {grp.campaignName}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">{grp.advertiserName}</td>
                        <td className="px-4 py-2.5 text-gray-400 text-xs">{grp.agencyName}</td>
                        <td className="px-4 py-2.5 text-right font-medium text-gray-800">{fmt(grp.totalExec)}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-blue-700">{fmt(grp.totalFee)}</td>
                        <td className="px-4 py-2.5 pl-6">
                          <div className="flex flex-wrap gap-1">
                            {grp.dmps.map(d => (
                              <span key={d.dmpType} className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${dmpClr(d.dmpType).badge}`}>
                                {d.dmpType}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>

                      {/* DMP 상세 행 (펼침) */}
                      {open && grp.dmps.map(d => (
                        <tr key={`${grp.key}|${d.dmpType}`} className="bg-gray-50/60">
                          <td className="pl-8 pr-2 py-2">
                            <div className={`h-full w-0.5 mx-auto ${dmpClr(d.dmpType).bar} opacity-40 rounded`} />
                          </td>
                          <td colSpan={3} className="px-4 py-2">
                            <div className="flex items-center gap-2">
                              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${dmpClr(d.dmpType).badge}`}>{d.dmpType}</span>
                              <span className="text-xs text-gray-400">{d.feeRate > 0 ? `수수료 ${d.feeRate}%` : "수수료 없음"} · {d.rowCount}행</span>
                            </div>
                          </td>
                          <td className="px-4 py-2 text-right text-xs text-gray-600">{fmt(d.execAmount)}</td>
                          <td className="px-4 py-2 text-right text-xs font-semibold text-blue-600">{d.fee > 0 ? fmt(d.fee) : "-"}</td>
                          <td className="px-4 py-2">
                            {d.feeRate > 0 && (
                              <div className="h-1.5 w-24 rounded-full bg-gray-200 overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${dmpClr(d.dmpType).bar}`}
                                  style={{ width: `${Math.min(100, (d.execAmount / (dmpSummary[d.dmpType]?.exec || 1)) * 100).toFixed(1)}%` }}
                                />
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </>
                  )
                })}

                {/* 합계 행 */}
                <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                  <td colSpan={4} className="px-4 py-3 text-gray-700">
                    합계 {selectedDmp ? `(${selectedDmp})` : "(전체)"}
                    <span className="ml-2 text-xs font-normal text-gray-400">{visibleGroups.length}개 캠페인</span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-800">{fmt(grandExec)}</td>
                  <td className="px-4 py-3 text-right text-blue-700">{fmt(grandFee)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}

      </main>
    </div>
  )
}
