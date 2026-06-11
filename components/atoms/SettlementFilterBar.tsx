"use client"
import React from "react"
import { MEDIA_PRODUCT_FILTERS, type MediaProductFilter } from "@/lib/motivApi/productMapping"
import { FilterBar, FilterChipGroup, FilterMonth, FilterDivider } from "@/components/atoms/filters"
import { OpenApiStatusBadge } from "@/components/atoms/OpenApiStatusBadge"

interface Props {
  month: string
  onMonthChange: (next: string) => void
  product: MediaProductFilter
  onProductChange: (next: MediaProductFilter) => void
  /** 오른쪽 슬롯 (스냅샷 버튼, 저장 버튼 등) */
  rightSlot?: React.ReactNode
}

/**
 * 정산 페이지 4종(agency-fee / dmp-fee / media-cost / sales-purchase) 공통 필터 바.
 *  - 월 이동 (◀ / ▶)
 *  - 제품(탭): 전체 | CT+ | CT | CTV
 *  - Open API 토큰 상태 badge (우측 끝 고정) — Phase 1 (2026-06-11) 추가.
 *    /me 헬스체크 결과를 한눈에 표시. badge 자체는 정보 표시 전용 (클릭 X).
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
      <div className="flex-1" />
      {rightSlot}
      <OpenApiStatusBadge />
    </FilterBar>
  )
}
