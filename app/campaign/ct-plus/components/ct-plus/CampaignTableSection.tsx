"use client"
import React from "react"
import { Campaign, Agency, Advertiser, Operator, getCampaignTotals, getCampaignProgress, getDday } from "@/lib/campaignTypes"
import { fmt, spendRateStyle } from "./statusUtils"

export function CampaignTableSection({
  filtered, agencies, advertisers, operators, computedSpendMap,
  onEdit, onDelete, onStatusToggle,
  selectedDetailId, setSelectedDetailId
}: {
  filtered: Campaign[]
  agencies: Agency[]
  advertisers: Advertiser[]
  operators: Operator[]
  computedSpendMap: Map<string, { netAmount: number; executionAmount: number; rowCount: number }>
  onEdit: (c: Campaign) => void
  onDelete: (id: string) => void
  onStatusToggle: (id: string) => void
  selectedDetailId: string | null
  setSelectedDetailId: (id: string | null) => void
}) {
  const opName = (id: string) => operators.find(o => o.id === id)?.name ?? "-"
  const agName = (id: string) => agencies.find(a => a.id === id)?.name ?? "-"
  const advName = (id: string) => advertisers.find(a => a.id === id)?.name ?? "-"

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {filtered.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-gray-500">캠페인이 없습니다.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
                <th className="px-4 py-3 text-left">캠페인명</th>
                <th className="px-4 py-3 text-left">광고주</th>
                <th className="px-4 py-3 text-left">대행사</th>
                <th className="px-4 py-3 text-left">담당자</th>
                <th className="px-4 py-3 text-left">기간</th>
                <th className="px-4 py-3 text-center">진행률</th>
                <th className="px-4 py-3 text-center">소진율 <span className="text-[9px] font-normal text-gray-400">(raw)</span></th>
                <th className="px-4 py-3 text-right">집행금액 <span className="text-[9px] font-normal text-gray-400">(세팅금액)</span></th>
                <th className="px-4 py-3 text-center">연결</th>
                <th className="px-4 py-3 text-center">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(c => {
                const totals   = getCampaignTotals(c)
                const dday     = getDday(c.endDate)
                const progress = getCampaignProgress(c.startDate, c.endDate)
                const computed = computedSpendMap.get(c.id)
                // 소진율 = raw data 기반 (CSV 업로드 집행금액 ÷ 세팅금액)
                const rawSpendRate = computed && totals.totalSettingCost > 0
                  ? Math.round((computed.netAmount / totals.totalSettingCost) * 1000) / 10
                  : 0
                const isLagging = c.status === "집행 중" && computed && (progress - rawSpendRate) >= 15
                const sc       = spendRateStyle(rawSpendRate)
                const csvCount = c.csvNames?.length ?? 0

                return (
                  <tr
                    key={c.id}
                    className={`hover:bg-gray-50 transition-colors cursor-pointer ${isLagging ? "bg-yellow-50/60" : ""} ${selectedDetailId === c.id ? "ring-1 ring-inset ring-blue-200 bg-blue-50/60" : ""}`}
                    onClick={() => setSelectedDetailId(selectedDetailId === c.id ? null : c.id)}
                  >
                    <td className="px-4 py-3 max-w-[200px]">
                      <div className="font-medium text-gray-900 truncate" title={c.campaignName}>{c.campaignName}</div>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {c.campaignType && (
                          <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold bg-purple-100 text-purple-700">
                            {c.campaignType}
                          </span>
                        )}
                        <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${c.status === "집행 중" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"}`}>
                          {c.status}
                        </span>
                        {dday.label && (
                          <span className={`text-[10px] font-medium ${dday.urgent ? "text-red-600" : dday.expired ? "text-gray-400" : "text-gray-500"}`}>
                            {dday.label}
                          </span>
                        )}
                        {isLagging && <span className="text-[10px] font-semibold text-yellow-700">⚠ 지연</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 max-w-[120px] truncate" title={advName(c.advertiserId)}>
                      {advName(c.advertiserId)}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 max-w-[120px] truncate" title={agName(c.agencyId)}>
                      {agName(c.agencyId)}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{opName(c.managerId)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap tabular-nums">
                      <div>{c.startDate.slice(2)}</div>
                      <div>{c.endDate.slice(2)}</div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="text-xs font-semibold text-blue-600">{progress}%</div>
                      <div className="mt-1 h-1.5 w-16 mx-auto rounded-full bg-gray-200">
                        <div className="h-full rounded-full bg-blue-400 transition-all" style={{ width: `${Math.min(progress, 100)}%` }} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {computed ? (
                        <>
                          <div className={`text-xs font-semibold ${sc.text}`}>{rawSpendRate.toFixed(1)}%</div>
                          <div className="mt-1 h-1.5 w-16 mx-auto rounded-full bg-gray-200">
                            <div className={`h-full rounded-full transition-all ${sc.bar}`} style={{ width: `${Math.min(rawSpendRate, 100)}%` }} />
                          </div>
                        </>
                      ) : (
                        <span className="text-[10px] text-gray-300">데이터 없음</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-xs">
                      {computed ? (
                        <div>
                          <div className="font-medium text-blue-700">{fmt(computed.netAmount)}</div>
                          <div className="text-[10px] text-gray-400">/ {fmt(totals.totalSettingCost)}</div>
                        </div>
                      ) : (
                        <span className="text-gray-300 text-[11px]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {csvCount > 0 ? (
                        <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">
                          DB {csvCount}
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => onEdit(c)}
                          className="rounded-md border border-blue-300 bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-100 transition-colors"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => onStatusToggle(c.id)}
                          className="rounded-md border border-gray-300 bg-white px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                          {c.status === "집행 중" ? "종료" : "재개"}
                        </button>
                        <button
                          onClick={() => onDelete(c.id)}
                          className="rounded-md border border-red-300 bg-red-50 px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-100 transition-colors"
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
