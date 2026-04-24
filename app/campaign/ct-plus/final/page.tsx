"use client"

import { useState, useMemo } from "react"
import { useMasterData } from "@/lib/hooks/useMasterData"
import { useRawData } from "@/lib/hooks/useRawData"
import { applyMarkupToRows } from "@/lib/markupService"
import { getMediaTotals, getCampaignTotals } from "@/lib/campaignTypes"
import type { Campaign } from "@/lib/campaignTypes"
import type { RawRow } from "@/lib/rawDataParser"
import { MotivSettlementTable } from "@/components/settlement/MotivSettlementTable"
import { useMotivAssignments } from "@/lib/hooks/useMotivAssignments"
import { useMotivSettlementCampaignsByProduct } from "@/lib/hooks/useMotivSettlementCampaigns"

function fmt(n: number) { return n.toLocaleString("ko-KR") }
function fmtRate(n: number) { return n.toFixed(1) + "%" }
function spendCls(rate: number) {
  if (rate > 100) return "text-red-600 font-semibold"
  if (rate >= 80)  return "text-green-600 font-semibold"
  if (rate >= 50)  return "text-blue-600"
  return "text-gray-500"
}

// ── 캠페인별 정산 집계 ────────────────────────────────
interface CampSettlement {
  campaign: Campaign
  advName: string
  agName: string
  mediaRows: {
    media: string
    budget: number
    feeRate: number
    settingCost: number
    netAmount: number
    executionAmount: number
    spendRate: number
    rowCount: number
    isNaver: boolean
  }[]
  totals: { budget: number; settingCost: number; netAmount: number; executionAmount: number; spendRate: number }
  hasData: boolean
}

function buildSettlement(
  campaign: Campaign,
  computedRows: RawRow[],
  advName: string,
  agName: string,
): CampSettlement {
  const campRows = computedRows.filter(r => r.matchedCampaignId === campaign.id)
  const mediaRows = campaign.mediaBudgets.map(mb => {
    const t       = getMediaTotals(mb)
    const rows    = campRows.filter(r => r.media === mb.media)
    const net     = rows.reduce((s, r) => s + (r.netAmount       ?? 0), 0)
    const exec    = rows.reduce((s, r) => s + (r.executionAmount ?? 0), 0)
    const rate    = t.totalSettingCost > 0 ? Math.round((net / t.totalSettingCost) * 1000) / 10 : 0
    return {
      media: mb.media,
      budget: t.totalBudget,
      feeRate: mb.totalFeeRate ?? t.dmpMarkup,
      settingCost: t.totalSettingCost,
      netAmount: Math.round(net),
      executionAmount: Math.round(exec),
      spendRate: rate,
      rowCount: rows.length,
      isNaver: mb.media === "naver",
    }
  })
  const tot = getCampaignTotals(campaign)
  const totalNet  = mediaRows.reduce((s, r) => s + r.netAmount, 0)
  const totalExec = mediaRows.reduce((s, r) => s + r.executionAmount, 0)
  const totalRate = tot.totalSettingCost > 0
    ? Math.round((totalNet / tot.totalSettingCost) * 1000) / 10 : 0
  return {
    campaign, advName, agName, mediaRows,
    totals: {
      budget:          tot.totalBudget,
      settingCost:     tot.totalSettingCost,
      netAmount:       totalNet,
      executionAmount: totalExec,
      spendRate:       totalRate,
    },
    hasData: campRows.length > 0,
  }
}

export default function CtPlusFinalPage() {
  const { campaigns, agencies, advertisers, operators, loading: masterLoading } = useMasterData()
  const { allRows: rawRows, loading: rawLoading } = useRawData()
  const loading = masterLoading || rawLoading

  // Motiv CT/CTV 데이터 + assignments — 대행사 지정 편집 UI
  const { data: assignments, upsert: upsertAssignment } = useMotivAssignments()

  // ── 월 선택 ───────────────────────────────────────
  const availableMonths = useMemo(() => {
    const months = [...new Set(campaigns.map(c => c.settlementMonth).filter(Boolean))].sort().reverse()
    return months
  }, [campaigns])

  const defaultMonth = useMemo(() => {
    if (availableMonths.length > 0) return availableMonths[0]
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  }, [availableMonths])

  const [selectedMonth, setSelectedMonth] = useState<string>("")
  const activeMonth = selectedMonth || defaultMonth

  // ── 전체 computed rows (1회만 계산) ────────────────
  const allComputed = useMemo(
    () => rawRows.length > 0 && campaigns.length > 0
      ? applyMarkupToRows(rawRows, campaigns)
      : [],
    [rawRows, campaigns]
  )

  // ── 선택 월 캠페인 정산 집계 ─────────────────────
  const settlements = useMemo((): CampSettlement[] => {
    if (!activeMonth) return []
    const filtered = campaigns.filter(c => c.settlementMonth === activeMonth)
    return filtered.map(c => {
      const adv = advertisers.find(a => a.id === c.advertiserId)?.name ?? "-"
      const ag  = agencies.find(a => a.id === c.agencyId)?.name      ?? "-"
      return buildSettlement(c, allComputed, adv, ag)
    }).sort((a, b) => a.advName.localeCompare(b.advName) || a.campaign.campaignName.localeCompare(b.campaign.campaignName))
  }, [activeMonth, campaigns, allComputed, advertisers, agencies])

  // ── 월 합계 ───────────────────────────────────────
  const monthTotals = useMemo(() => ({
    budget:          settlements.reduce((s, r) => s + r.totals.budget, 0),
    settingCost:     settlements.reduce((s, r) => s + r.totals.settingCost, 0),
    netAmount:       settlements.reduce((s, r) => s + r.totals.netAmount, 0),
    executionAmount: settlements.reduce((s, r) => s + r.totals.executionAmount, 0),
  }), [settlements])

  const monthSpendRate = monthTotals.settingCost > 0
    ? Math.round((monthTotals.netAmount / monthTotals.settingCost) * 1000) / 10 : 0

  // Motiv CT/CTV fetch — 정산 월 기준
  const motivFetch = useMotivSettlementCampaignsByProduct('CT_CTV_BOTH', activeMonth, !!activeMonth)

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const toggleExpand = (id: string) =>
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const expandAll  = () => setExpandedIds(new Set(settlements.map(s => s.campaign.id)))
  const collapseAll = () => setExpandedIds(new Set())

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4 print:hidden">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-gray-900">정산 확인</h1>
            <p className="text-xs text-gray-400 mt-0.5">월별 캠페인 정산 현황 · CSV 실적 자동 집계</p>
          </div>
          <button
            onClick={() => window.print()}
            className="rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700 transition-colors"
          >
            인쇄 / PDF
          </button>
        </div>
      </header>

      <main className="p-6 space-y-5">
        {/* 월 선택 */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm print:hidden">
          <div className="flex items-end gap-4 flex-wrap">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-700">정산 월 선택</label>
              {loading ? (
                <p className="text-xs text-gray-400">로딩 중...</p>
              ) : (
                <div className="flex items-center gap-2">
                  <select
                    value={activeMonth}
                    onChange={e => setSelectedMonth(e.target.value)}
                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    {availableMonths.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  <input
                    type="month"
                    value={activeMonth}
                    onChange={e => setSelectedMonth(e.target.value)}
                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
              )}
            </div>
            {settlements.length > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-gray-400">{settlements.length}개 캠페인</span>
                <button onClick={expandAll}   className="text-blue-600 hover:underline">전체 펼치기</button>
                <span className="text-gray-300">|</span>
                <button onClick={collapseAll} className="text-gray-500 hover:underline">전체 접기</button>
              </div>
            )}
          </div>
        </div>

        {/* 월 요약 카드 */}
        {settlements.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { label: "캠페인 수",    value: `${settlements.length}개` },
              { label: "총 부킹금액",  value: `${fmt(monthTotals.budget)}원` },
              { label: "총 세팅금액",  value: `${fmt(monthTotals.settingCost)}원` },
              { label: "총 순집행금액", value: `${fmt(monthTotals.netAmount)}원`, blue: true },
              { label: "전체 소진율",  value: fmtRate(monthSpendRate), blue: monthSpendRate >= 50 },
            ].map(({ label, value, blue }) => (
              <div key={label} className="rounded-lg border border-gray-200 bg-white p-3 text-center shadow-sm">
                <p className="text-[10px] text-gray-500 mb-0.5">{label}</p>
                <p className={`text-sm font-bold ${blue ? "text-blue-700" : "text-gray-900"}`}>{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* CT · CTV 정산 리스트 (Motiv) — 대행사·광고주·운영자 지정 */}
        <MotivSettlementTable
          title="CT · CTV 캠페인 (Motiv) — 대행사 지정"
          loading={motivFetch.loading}
          error={motivFetch.error}
          campaigns={motivFetch.data}
          exchangeRate={motivFetch.exchangeRate}
          agencies={agencies}
          advertisers={advertisers}
          operators={operators}
          assignments={assignments}
          onUpsertAssignment={upsertAssignment}
        />

        {/* CT+ 정산 테이블 */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          </div>
        ) : settlements.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="rounded-full bg-gray-100 p-6 mb-4">
              <svg className="h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500">
              {activeMonth ? `${activeMonth} 월에 등록된 캠페인이 없습니다` : "정산 월을 선택하세요"}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 print:hidden">
              <h2 className="text-sm font-semibold text-gray-900">{activeMonth} 정산 내역</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium text-gray-500 w-5"></th>
                    <th className="px-4 py-2.5 text-left font-medium text-gray-500">광고주</th>
                    <th className="px-4 py-2.5 text-left font-medium text-gray-500">대행사</th>
                    <th className="px-4 py-2.5 text-left font-medium text-gray-500">캠페인명</th>
                    <th className="px-4 py-2.5 text-left font-medium text-gray-500">기간</th>
                    <th className="px-4 py-2.5 text-left font-medium text-gray-500">매체</th>
                    <th className="px-4 py-2.5 text-right font-medium text-gray-500">부킹금액</th>
                    <th className="px-4 py-2.5 text-right font-medium text-gray-500">세팅금액</th>
                    <th className="px-4 py-2.5 text-right font-medium text-gray-500 text-blue-600">순집행금액</th>
                    <th className="px-4 py-2.5 text-right font-medium text-gray-500">소진율</th>
                    <th className="px-4 py-2.5 text-right font-medium text-gray-500">집행금액</th>
                    <th className="px-4 py-2.5 text-center font-medium text-gray-500">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {settlements.map(s => {
                    const isOpen = expandedIds.has(s.campaign.id)
                    return (
                      <>
                        {/* 캠페인 요약 행 */}
                        <tr
                          key={s.campaign.id}
                          className={`border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${
                            !s.hasData ? "opacity-60" : ""
                          }`}
                          onClick={() => toggleExpand(s.campaign.id)}
                        >
                          <td className="px-4 py-3 text-gray-400">
                            <svg
                              className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-90" : ""}`}
                              fill="none" viewBox="0 0 24 24" stroke="currentColor"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </td>
                          <td className="px-4 py-3 font-medium text-gray-800 max-w-[100px] truncate">{s.advName}</td>
                          <td className="px-4 py-3 text-gray-600 max-w-[80px] truncate">{s.agName}</td>
                          <td className="px-4 py-3 font-medium text-gray-900 max-w-[160px]">
                            <div className="truncate">{s.campaign.campaignName}</div>
                            {s.campaign.campaignType && (
                              <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold bg-purple-100 text-purple-700 mt-0.5">
                                {s.campaign.campaignType}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap tabular-nums">
                            <div>{s.campaign.startDate.slice(2)}</div>
                            <div>{s.campaign.endDate.slice(2)}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {s.campaign.mediaBudgets.map(mb => (
                                <span key={mb.media} className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
                                  {mb.media}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-700">{fmt(s.totals.budget)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-700">{fmt(s.totals.settingCost)}</td>
                          <td className="px-4 py-3 text-right tabular-nums font-semibold text-blue-700">
                            {s.hasData ? fmt(s.totals.netAmount) : <span className="text-gray-300 font-normal">데이터 없음</span>}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {s.hasData ? (
                              <span className={spendCls(s.totals.spendRate)}>{fmtRate(s.totals.spendRate)}</span>
                            ) : <span className="text-gray-300">-</span>}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                            {s.hasData ? fmt(s.totals.executionAmount) : <span className="text-gray-300">-</span>}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              s.campaign.status === "집행 중"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-gray-100 text-gray-500"
                            }`}>{s.campaign.status}</span>
                          </td>
                        </tr>

                        {/* 매체별 상세 행 (expandable) */}
                        {isOpen && s.mediaRows.map(mr => (
                          <tr key={`${s.campaign.id}-${mr.media}`}
                            className="border-b border-gray-50 bg-blue-50/30">
                            <td className="px-4 py-2" />
                            <td colSpan={4} className="px-4 py-2" />
                            <td className="px-4 py-2 text-[11px] font-medium text-gray-700">
                              {mr.media}
                              {mr.isNaver && <span className="ml-1 text-[9px] text-amber-600">(VAT포함)</span>}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums text-gray-500 text-[11px]">{fmt(mr.budget)}</td>
                            <td className="px-4 py-2 text-right tabular-nums text-gray-500 text-[11px]">
                              {fmt(mr.settingCost)}
                              <div className="text-[9px] text-gray-400">{fmtRate(mr.feeRate ?? 0)} 수수료</div>
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums font-medium text-blue-600 text-[11px]">
                              {mr.rowCount > 0 ? fmt(mr.netAmount) : <span className="text-gray-300">-</span>}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums text-[11px]">
                              {mr.rowCount > 0 ? (
                                <span className={spendCls(mr.spendRate)}>{fmtRate(mr.spendRate)}</span>
                              ) : <span className="text-gray-300">-</span>}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums text-gray-500 text-[11px]">
                              {mr.rowCount > 0 ? fmt(mr.executionAmount) : <span className="text-gray-300">-</span>}
                            </td>
                            <td className="px-4 py-2 text-center text-[10px] text-gray-400">{mr.rowCount}행</td>
                          </tr>
                        ))}
                      </>
                    )
                  })}
                </tbody>
                <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                  <tr>
                    <td colSpan={6} className="px-4 py-3 font-semibold text-gray-900">
                      합계 ({activeMonth})
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">{fmt(monthTotals.budget)}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">{fmt(monthTotals.settingCost)}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-blue-700">{fmt(monthTotals.netAmount)}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      <span className={spendCls(monthSpendRate)}>{fmtRate(monthSpendRate)}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-700">{fmt(monthTotals.executionAmount)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
