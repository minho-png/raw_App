"use client"
import React, { useState } from "react"
import { useZeroSpendMotivCampaigns } from "@/lib/hooks/useZeroSpendMotivCampaigns"
import { MEDIA_PRODUCT_LABEL } from "@/lib/motivApi/productMapping"

/**
 * CT · CTV 캠페인·광고그룹 중 "미노출(win + v_impression = 0)" 알림 배너.
 *
 * 표시 조건:
 *   - 오전 9시 이후 (ready=false 이면 렌더 안 함)
 *   - 감지 대상 ≥ 1
 *
 * 상세 영역:
 *   - 캠페인 전체 노출 0 이면 빨간 뱃지 "캠페인 전체 노출 0"
 *   - 캠페인은 노출 > 0 이고 특정 광고그룹만 0 이면 해당 그룹 리스트
 *   - 무료(is_free) 캠페인은 초록 [무료] 뱃지
 */
export function ZeroSpendAlertBanner() {
  const { items, loading, error, ready } = useZeroSpendMotivCampaigns()
  const [expanded, setExpanded] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  if (!ready) return null
  if (loading) return null
  if (error) return null
  if (dismissed) return null
  if (items.length === 0) return null

  const totalGroups = items.reduce((s, i) => s + i.zeroAdGroups.length, 0)
  const fullDarkCount = items.filter(i => i.impressions === 0).length

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 shadow-sm">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex-shrink-0 rounded-full bg-amber-500 p-1.5">
            <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-900">
              미노출 CT · CTV 캠페인 {items.length}건{totalGroups > 0 && <> · 광고그룹 {totalGroups}개</>}
            </p>
            <p className="text-[11px] text-amber-700 mt-0.5">
              활성 · 기간 내 · 노출(win + v_impression) = 0
              {fullDarkCount > 0 && <> · <span className="text-red-700 font-medium">전체 노출 0: {fullDarkCount}건</span></>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setExpanded(v => !v)}
            className="rounded-lg border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 transition-colors"
          >
            {expanded ? "접기" : "상세 보기"}
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="rounded-lg p-1 text-amber-600 hover:bg-amber-100 transition-colors"
            aria-label="닫기"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {expanded && (
        <ul className="border-t border-amber-200 divide-y divide-amber-100">
          {items.map(({ campaign, product, impressions, zeroAdGroups }) => {
            const allDark = impressions === 0
            return (
              <li key={campaign.id} className="px-4 py-2 text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    product === 'CTV' ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {MEDIA_PRODUCT_LABEL[product]}
                  </span>
                  {campaign.is_free && (
                    <span className="inline-flex items-center rounded-full bg-green-100 px-1.5 py-0.5 text-[9px] font-semibold text-green-700">
                      무료
                    </span>
                  )}
                  <span className="font-medium text-gray-800 truncate flex-1 min-w-0" title={campaign.title ?? ''}>
                    {campaign.title ?? `#${campaign.id}`}
                  </span>
                  {allDark && (
                    <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 flex-shrink-0">
                      캠페인 전체 노출 0
                    </span>
                  )}
                  <span className="text-[10px] text-gray-500 tabular-nums flex-shrink-0">
                    캠페인 노출 {impressions.toLocaleString()}
                  </span>
                </div>
                {zeroAdGroups.length > 0 && (
                  <ul className="mt-1 ml-4 space-y-0.5">
                    {zeroAdGroups.map(g => (
                      <li key={g.id} className="text-[11px] text-gray-600 flex items-center gap-2">
                        <span className="text-gray-300">└</span>
                        <span className="font-medium">광고그룹:</span>
                        <span className="truncate" title={g.title ?? ''}>{g.title ?? `#${g.id}`}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
