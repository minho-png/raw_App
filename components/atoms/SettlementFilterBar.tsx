"use client"
import React from "react"
import { MEDIA_PRODUCT_FILTERS, type MediaProductFilter } from "@/lib/motivApi/productMapping"
import { FilterBar, FilterChipGroup, FilterMonth, FilterDivider } from "@/components/atoms/filters"

interface Props {
  month: string
  onMonthChange: (next: string) => void
  product: MediaProductFilter
  onProductChange: (next: MediaProductFilter) => void
  /** 오른쪽 슬롯 (스냅샷 버튼, 저장 버튼 등) */
  rightSlot?: React.ReactNode
}

/**
 * 정산 페이지 3종(agency-fee / dmp-fee / media-cost) 공통 필터 바.
 *  - 월 이동 (◀ / ▶)
 *  - 제품(탭): 전체 | CT+ | CT | CTV
 *
 * 내부적으로 공통 atoms (FilterBar / FilterChipGroup / FilterMonth) 사용해
 * 다른 페이지(분석/상태)와 외관·UX 일치.
 */
export function SettlementFilterBar({ month, onMonthChange, product, onProductChange, rightSlot }: Props) {
  return (
    <FilterBar className="gap-3">
      <FilterMonth month={month} onChange={onMonthChange} />
      <FilterDivider />
      <FilterChipGroup<MediaProductFilter>
        options={MEDIA_PRODUCT_FILTERS.map(f => ({ value: f.value, label: f.label }))}
        value={product}
        onChange={onProductChange}
      />
      {rightSlot && (
        <>
          <div className="flex-1" />
          {rightSlot}
        </>
      )}
    </FilterBar>
  )
}
