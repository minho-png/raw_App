"use client"
import React from "react"
import { Campaign, Operator, Agency, Advertiser, AVAILABLE_MEDIA } from "@/lib/campaignTypes"
import { selectCls, inputCls, FilterStatus } from "./statusUtils"

export function CampaignFilterBar({
  filterStatus, setFilterStatus,
  filterMonth, setFilterMonth,
  filterOperator, setFilterOperator,
  filterMedia, setFilterMedia,
  searchQuery, setSearchQuery,
  isFiltered, onReset,
  campaigns, operators, agencies, advertisers
}: {
  filterStatus: FilterStatus
  setFilterStatus: (s: FilterStatus) => void
  filterMonth: string
  setFilterMonth: (m: string) => void
  filterOperator: string
  setFilterOperator: (o: string) => void
  filterMedia: string
  setFilterMedia: (m: string) => void
  searchQuery: string
  setSearchQuery: (q: string) => void
  isFiltered: boolean
  onReset: () => void
  campaigns: Campaign[]
  operators: Operator[]
  agencies: Agency[]
  advertisers: Advertiser[]
}) {
  const settlementMonths = React.useMemo(() =>
    Array.from(new Set(campaigns.map(c => c.settlementMonth).filter(Boolean))).sort().reverse()
  , [campaigns])

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1">
        {(["전체", "집행 중", "종료"] as FilterStatus[]).map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${filterStatus === s ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            {s}
          </button>
        ))}
      </div>
      <div className="h-4 w-px bg-gray-200" />
      <select value={filterMonth}    onChange={e => setFilterMonth(e.target.value)}    className={selectCls}>
        <option value="">정산 월 전체</option>
        {settlementMonths.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <select value={filterOperator} onChange={e => setFilterOperator(e.target.value)} className={selectCls}>
        <option value="">담당자 전체</option>
        {operators.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      <select value={filterMedia}    onChange={e => setFilterMedia(e.target.value)}    className={selectCls}>
        <option value="">매체 전체</option>
        {AVAILABLE_MEDIA.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <input type="text" placeholder="캠페인명·광고주·대행사명 검색" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 placeholder-gray-400 hover:border-gray-400 transition-colors flex-1 min-w-40" />
      {isFiltered && <button onClick={onReset}
        className="text-xs text-blue-600 hover:text-blue-700 font-medium">초기화</button>}
    </div>
  )
}
