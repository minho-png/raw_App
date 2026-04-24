"use client"
import React from "react"
import { MEDIA_PRODUCT_FILTERS, type MediaProductFilter } from "@/lib/motivApi/productMapping"

interface Props {
  month: string
  onMonthChange: (next: string) => void
  product: MediaProductFilter
  onProductChange: (next: MediaProductFilter) => void
  /** 오른쪽 슬롯 (스냅샷 버튼, 저장 버튼 등) */
  rightSlot?: React.ReactNode
}

function shift(month: string, dir: -1 | 1): string {
  const [y, m] = month.split("-").map(Number)
  const d = new Date(y, m - 1 + dir, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

/**
 * 정산 페이지 3종(agency-fee / dmp-fee / media-cost) 공통 필터 바.
 *  - 월 이동 (◀ / ▶)
 *  - 제품(탭): 전체 | CT+ | CT | CTV
 */
export function SettlementFilterBar({ month, onMonthChange, product, onProductChange, rightSlot }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-3">
      {/* 월 네비게이션 */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onMonthChange(shift(month, -1))}
          className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-600 hover:bg-gray-50"
          aria-label="이전 월"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <input
          type="month"
          value={month}
          onChange={e => onMonthChange(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
        />
        <button
          onClick={() => onMonthChange(shift(month, 1))}
          className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-600 hover:bg-gray-50"
          aria-label="다음 월"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* 구분선 */}
      <div className="h-5 w-px bg-gray-200" />

      {/* 제품 탭 */}
      <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
        {MEDIA_PRODUCT_FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => onProductChange(f.value)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              product === f.value
                ? "bg-white text-blue-700 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {rightSlot && (
        <>
          <div className="flex-1" />
          {rightSlot}
        </>
      )}
    </div>
  )
}
