"use client"
import React, { useState, useEffect } from "react"
import {
  Campaign, Operator, Agency, Advertiser, getMediaTotals, getCampaignTotals, 
  getCampaignProgress, getDday
} from "@/lib/campaignTypes"
import { loadComputedRows } from "@/lib/markupService"
import type { RawRow } from "@/lib/rawDataParser"
import { fmt, spendRateStyle, getDailySuggestion } from "./statusUtils"

function DetailKPICard({ label, value, color }: { label: string; value: string; color?: 'red' | 'blue' | 'green' }) {
  const cls = color === 'red' ? 'text-red-600' : color === 'green' ? 'text-green-600' : color === 'blue' ? 'text-blue-600' : 'text-gray-900'
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
      <p className="text-[11px] text-gray-500 font-medium">{label}</p>
      <p className={`text-sm font-semibold mt-1 ${cls}`}>{value}</p>
    </div>
  )
}

export function CampaignDetailPanel({
  campaign, operators, agencies, advertisers, onClose, onEdit, onUpdate }: {
  campaign: Campaign
  operators: Operator[]
  agencies: Agency[]
  advertisers: Advertiser[]
  onClose: () => void
  onEdit: (c: Campaign) => void
  onUpdate?: (c: Campaign) => void
}) {
  // 업로드된 실적 데이터 (raw → computed)
  const [computedRows, setComputedRows] = useState<RawRow[]>([])
  const [dashboardInput, setDashboardInput] = useState<string>(
    campaign.dashboardNetAmount != null ? String(campaign.dashboardNetAmount) : ""
  )
  useEffect(() => {
    const rows = loadComputedRows(campaign.id)
    setComputedRows(rows)
  }, [campaign.id])

  const totals   = getCampaignTotals(campaign)
  const progress = getCampaignProgress(campaign.startDate, campaign.endDate)
  const dday     = getDday(campaign.endDate)
  const sc       = spendRateStyle(totals.spendRate)
  const lag      = progress - totals.spendRate

  const opName  = operators.find(o => o.id === campaign.managerId)?.name  ?? '-'
  const agN     = agencies.find(a => a.id === campaign.agencyId)?.name    ?? '-'
  const advN    = advertisers.find(a => a.id === campaign.advertiserId)?.name ?? '-'

  function fmtAbbr(n: number): string {
    if (n >= 100000000) return `${(n / 100000000).toFixed(1)}억`
    if (n >= 10000)     return `${(n / 10000).toFixed(0)}만`
    return fmt(n)
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">

        {/* 헤더 */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {campaign.campaignType && (
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-purple-100 text-purple-700">
                  {campaign.campaignType}
                </span>
              )}
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${campaign.status === "집행 중" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"}`}>
                {campaign.status}
              </span>
              {dday.label && (
                <span className={`text-xs font-medium ${dday.urgent ? "text-red-600" : dday.expired ? "text-gray-400" : "text-gray-500"}`}>
                  {dday.label}
                </span>
              )}
            </div>
            <h2 className="text-base font-semibold text-gray-900 truncate">{campaign.campaignName}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{advN} · {agN} · 담당: {opName}</p>
          </div>
          <button onClick={onClose} className="ml-3 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition-colors flex-shrink-0">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* KPI 카드 */}
          <div className="grid grid-cols-2 gap-2.5">
            <DetailKPICard label="부킹 금액" value={fmt(totals.totalBudget) + '원'} />
            <DetailKPICard label="세팅 금액" value={fmt(totals.totalSettingCost) + '원'} />
            <DetailKPICard label="집행 금액" value={fmt(totals.totalSpend) + '원'} color={totals.spendRate > 100 ? 'red' : 'blue'} />
            <DetailKPICard label="미소진 잔액" value={fmt(Math.max(0, totals.totalSettingCost - totals.totalSpend)) + '원'} />
          </div>

          {/* 진행률 vs 소진율 */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-4">
            <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">진행률 vs 소진율</h3>

            {/* 진행률 */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-gray-600">진행률</span>
                <span className="text-xs font-semibold text-blue-600">{progress}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-gray-200">
                <div className="h-full rounded-full bg-blue-400 transition-all" style={{ width: `${Math.min(progress, 100)}%` }} />
              </div>
              <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                <span>{campaign.startDate.slice(5)}</span>
                <span>{campaign.endDate.slice(5)}</span>
              </div>
            </div>

            {/* 리포트 소진율 */}
            {(() => {
              const reportLag = progress - totals.spendRate
              const barW = Math.min(totals.spendRate, 100)
              const bubbleLeft = Math.min(Math.max(barW, 8), 92)
              return (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-gray-600">리포트 소진율</span>
                    <span className={`text-xs font-semibold ${sc.text}`}>{totals.spendRate}%</span>
                  </div>
                  <div className="relative pt-7">
                    {Math.abs(reportLag) >= 5 && (
                      <div className="absolute top-0" style={{ left: `${bubbleLeft}%`, transform: 'translateX(-50%)' }}>
                        <div className={`relative px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap
                          ${reportLag > 0 ? 'bg-orange-500 text-white' : 'bg-green-500 text-white'}`}>
                          {reportLag > 0 ? `${reportLag.toFixed(1)}% 지연` : `${Math.abs(reportLag).toFixed(1)}% 빠름`}
                          <div className={`absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent
                            ${reportLag > 0 ? 'border-t-orange-500' : 'border-t-green-500'}`} />
                        </div>
                      </div>
                    )}
                    <div className="h-2 w-full rounded-full bg-gray-200">
                      <div className={`h-full rounded-full transition-all ${sc.bar}`} style={{ width: `${barW}%` }} />
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* 대시보드 소진율 */}
            {(() => {
              const dashAmt = parseFloat(dashboardInput) || 0
              const settingCost = totals.totalSettingCost
              const dashRate = settingCost > 0 ? Math.round((dashAmt / settingCost) * 1000) / 10 : 0
              const dashSc = spendRateStyle(dashRate)
              const dashLag = progress - dashRate
              const barW = Math.min(dashRate, 100)
              const bubbleLeft = Math.min(Math.max(barW, 8), 92)
              return (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-gray-600">대시보드 소진율</span>
                    <span className={`text-xs font-semibold ${dashSc.text}`}>{dashRate}%</span>
                  </div>
                  <div className="relative pt-7">
                    {Math.abs(dashLag) >= 5 && dashAmt > 0 && (
                      <div className="absolute top-0" style={{ left: `${bubbleLeft}%`, transform: 'translateX(-50%)' }}>
                        <div className={`relative px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap
                          ${dashLag > 0 ? 'bg-orange-500 text-white' : 'bg-green-500 text-white'}`}>
                          {dashLag > 0 ? `${dashLag.toFixed(1)}% 지연` : `${Math.abs(dashLag).toFixed(1)}% 빠름`}
                          <div className={`absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent
                            ${dashLag > 0 ? 'border-t-orange-500' : 'border-t-green-500'}`} />
                        </div>
                      </div>
                    )}
                    <div className="h-2 w-full rounded-full bg-gray-200">
                      <div className={`h-full rounded-full transition-all ${dashSc.bar}`} style={{ width: `${barW}%` }} />
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-gray-600 whitespace-nowrap">대시보드 소진액 :</span>
                    <input
                      type="number" min="0"
                      value={dashboardInput}
                      onChange={e => {
                        setDashboardInput(e.target.value)
                        onUpdate?.({ ...campaign, dashboardNetAmount: parseFloat(e.target.value) || 0 })
                      }}
                      placeholder="금액 입력 (원)"
                      className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                  </div>
                </div>
              )
            })()}
          </div>

          {/* 매체별 상세 테이블 */}
          {campaign.mediaBudgets.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <h3 className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">매체별 상세</h3>
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-gray-500 font-medium">매체</th>
                    <th className="px-3 py-2 text-right text-gray-500 font-medium">세팅</th>
                    <th className="px-3 py-2 text-right text-gray-500 font-medium">집행</th>
                    <th className="px-3 py-2 text-right text-gray-500 font-medium">소진율</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {campaign.mediaBudgets.map(mb => {
                    const t = getMediaTotals(mb)
                    const msc = spendRateStyle(t.spendRate)
                    return (
                      <tr key={mb.media} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium text-gray-700">{mb.media}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-600">{fmtAbbr(t.totalSettingCost)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-600">{fmtAbbr(t.totalSpend)}</td>
                        <td className={`px-3 py-2 text-right tabular-nums font-semibold ${msc.text}`}>{t.spendRate}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* 일일 예산 제안 */}
          {campaign.status === "집행 중" && (
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
              <h3 className="text-[11px] font-semibold text-blue-600 mb-1">일일 예산 제안</h3>
              <p className="text-xs text-blue-800">{getDailySuggestion(campaign)}</p>
            </div>
          )}

          {/* 업로드 실적 데이터 (raw → markup computed) */}
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
              <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">업로드 실적 데이터</h3>
              {computedRows.length > 0 && (
                <span className="text-[10px] text-gray-400">{computedRows.length}행</span>
              )}
            </div>
            {computedRows.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="text-xs text-gray-400">데이터 없음</p>
                <p className="text-[10px] text-gray-300 mt-1">데이터 입력 탭에서 CSV를 업로드하면 자동으로 연결됩니다</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                {/* 매체별 집계 요약 */}
                {(() => {
                  const byMedia = new Map<string, { rows: number; impressions: number; clicks: number; executionAmount: number; netAmount: number }>()
                  for (const r of computedRows) {
                    const cur = byMedia.get(r.media) ?? { rows: 0, impressions: 0, clicks: 0, executionAmount: 0, netAmount: 0 }
                    cur.rows++
                    cur.impressions += r.impressions
                    cur.clicks += r.clicks
                    cur.executionAmount += r.executionAmount
                    cur.netAmount += r.netAmount
                    byMedia.set(r.media, cur)
                  }
                  const entries = Array.from(byMedia.entries())
                  return (
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-gray-500 font-medium">매체</th>
                          <th className="px-3 py-2 text-right text-gray-500 font-medium">노출</th>
                          <th className="px-3 py-2 text-right text-gray-500 font-medium">클릭</th>
                          <th className="px-3 py-2 text-right text-gray-500 font-medium">집행금액</th>
                          <th className="px-3 py-2 text-right text-gray-500 font-medium">순금액</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {entries.map(([media, agg]) => (
                          <tr key={media} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-medium text-gray-700">{media}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-600">{fmt(agg.impressions)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-600">{fmt(agg.clicks)}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium text-blue-700">{fmt(agg.executionAmount)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-600">{fmt(agg.netAmount)}</td>
                          </tr>
                        ))}
                        <tr className="bg-gray-50 font-semibold">
                          <td className="px-3 py-2 text-gray-700">합계</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmt(computedRows.reduce((s, r) => s + r.impressions, 0))}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmt(computedRows.reduce((s, r) => s + r.clicks, 0))}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-blue-700">{fmt(computedRows.reduce((s, r) => s + r.executionAmount, 0))}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmt(computedRows.reduce((s, r) => s + r.netAmount, 0))}</td>
                        </tr>
                      </tbody>
                    </table>
                  )
                })()}
              </div>
            )}
          </div>

          {/* 연결 데이터 */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">연결 데이터</h3>
            {campaign.csvNames && campaign.csvNames.length > 0 ? (
              <div className="space-y-1.5">
                {campaign.csvNames.map(n => (
                  <div key={n} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full flex-shrink-0 bg-green-500" />
                    <span className="text-xs text-gray-700 truncate">{n}</span>
                  </div>
                ))}
                <p className="mt-1 text-[11px] text-green-600">{campaign.csvNames.length}개 CSV 캠페인명 매핑</p>
              </div>
            ) : (
              <p className="text-xs text-gray-400">연결된 데이터 없음 — 캠페인 수정에서 CSV명을 연결하세요</p>
            )}
          </div>

          {/* 특이사항 */}
          {campaign.memo && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <h3 className="text-[11px] font-semibold text-amber-700 mb-1">특이사항</h3>
              <p className="text-xs text-amber-900 whitespace-pre-wrap">{campaign.memo}</p>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="border-t border-gray-100 px-5 py-3 flex justify-end">
          <button
            onClick={() => onEdit(campaign)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            캠페인 수정
          </button>
        </div>
      </div>
      </div>
    </>
  )
}
