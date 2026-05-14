"use client"
import React from "react"
import { Campaign, Operator, Agency, Advertiser, AVAILABLE_MEDIA } from "@/lib/campaignTypes"
import { selectCls, FilterStatus } from "./statusUtils"
import { FilterBar, FilterChipGroup, FilterSearch, FilterReset, FilterDivider } from "@/components/atoms/filters"

// CT-Plus 상태 페이지 전용 필터 바.
// 공통 atoms (FilterBar/FilterChipGroup/FilterSearch/FilterReset) 사용해 다른 페이지와 톤 일치.
// select 드롭다운(월/담당자/매체)은 데이터 종속이라 native select 유지.
export function CampaignFilterBar({
  filterStatus, setFilterStatus,
  filterMonth, setFilterMonth,
  filterOperator, setFilterOperator,
  filterMedia, setFilterMedia,
  filterDateStart, setFilterDateStart,
  filterDateEnd, setFilterDateEnd,
  searchQuery, setSearchQuery,
  isFiltered, onReset,
  campaigns, operators,
}: {
  filterStatus: FilterStatus
  setFilterStatus: (s: FilterStatus) => void
  filterMonth: string
  setFilterMonth: (m: string) => void
  filterOperator: string
  setFilterOperator: (o: string) => void
  filterMedia: string
  setFilterMedia: (m: string) => void
  /** 신규: 캠페인 운영 기간 overlap 필터 (시작일/종료일). 빈 값이면 무필터. */
  filterDateStart: string
  setFilterDateStart: (d: string) => void
  filterDateEnd: string
  setFilterDateEnd: (d: string) => void
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
    <FilterBar>
      <FilterChipGroup<FilterStatus>
        options={[
          { value: "전체",    label: "전체" },
          { value: "집행 중", label: "집행 중" },
          { value: "종료",    label: "종료" },
        ]}
        value={filterStatus}
        onChange={setFilterStatus}
      />
      <FilterDivider />
      <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className={selectCls}>
        <option value="">정산 월 전체</option>
        {settlementMonths.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <select value={filterOperator} onChange={e => setFilterOperator(e.target.value)} className={selectCls}>
        <option value="">담당자 전체</option>
        {operators.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      <select value={filterMedia} onChange={e => setFilterMedia(e.target.value)} className={selectCls}>
        <option value="">매체 전체</option>
        {AVAILABLE_MEDIA.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <FilterDivider />
      {/* 운영 기간 필터 — 입력된 범위와 overlap 있는 캠페인만 표시 */}
      <div className="flex items-center gap-1" title="캠페인 운영 기간이 이 범위와 겹치는 항목만 표시">
        <span className="text-[11px] text-gray-500">기간</span>
        <input
          type="date"
          value={filterDateStart}
          max={filterDateEnd || undefined}
          onChange={e => setFilterDateStart(e.target.value)}
          className="rounded-md border border-gray-200 px-2 py-1 text-xs"
        />
        <span className="text-gray-300 text-xs">~</span>
        <input
          type="date"
          value={filterDateEnd}
          min={filterDateStart || undefined}
          onChange={e => setFilterDateEnd(e.target.value)}
          className="rounded-md border border-gray-200 px-2 py-1 text-xs"
        />
      </div>
      <FilterSearch
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="캠페인명·광고주·대행사명 검색"
        minWidth="220px"
      />
      <FilterReset visible={isFiltered} onClick={onReset} />
    </FilterBar>
  )
}
