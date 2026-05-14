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
