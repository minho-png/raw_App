"use client"
import React from "react"
import { Campaign, getCampaignProgress, getCampaignTotals, getDday } from "@/lib/campaignTypes"
import { SCard, fmt, spendRateStyle, getDailySuggestion } from "./statusUtils"

export function CampaignSummaryBanner({
  summary, laggingCampaigns, alertOpen, setAlertOpen
}: {
  summary: { total: number; active: number; ended: number; totalBudget: number; totalSettingCost: number }
  laggingCampaigns: Campaign[]
  alertOpen: boolean
  setAlertOpen: (v: boolean | ((prev: boolean) => boolean)) => void
}) {
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <SCard label="전체 캠페인" value={`${summary.total}개`} />
        <SCard label="집행 중" value={`${summary.active}개`} color="blue" />
        <SCard label="종료" value={`${summary.ended}개`} color="gray" />
        <SCard label="부킹 금액" value={fmt(summary.totalBudget)} sub="원" />
        <SCard label="세팅 금액" value={fmt(summary.totalSettingCost)} sub="원" />
      </div>

      {laggingCampaigns.length > 0 && (
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 overflow-hidden">
          <button onClick={() => setAlertOpen(!alertOpen)} className="flex w-full items-center justify-between px-4 py-3 hover:bg-yellow-100 transition-colors">
            <div className="flex items-center gap-2">
              <span className="text-base">⚠️</span>
              <span className="text-sm font-semibold text-yellow-800">집행 속도 점검 필요 · {laggingCampaigns.length}개 캠페인</span>
              <span className="text-xs text-yellow-600">진행률 대비 소진율 15%p 이상 지연</span>
            </div>
            <svg className={`h-4 w-4 text-yellow-500 transition-transform ${alertOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {alertOpen && (
            <div className="border-t border-yellow-200 divide-y divide-yellow-100">
              {laggingCampaigns.map(c => {
                const progress = getCampaignProgress(c.startDate, c.endDate)
                const { spendRate } = getCampaignTotals(c)
                return (
                  <div key={c.id} className="px-4 py-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-semibold text-yellow-900">{c.campaignName}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-blue-600">진행률 <strong>{progress}%</strong></span>
                        <span className={spendRateStyle(spendRate).text}>소진율 <strong>{spendRate}%</strong></span>
                        <span className="rounded-full bg-yellow-200 px-2 py-0.5 font-semibold text-yellow-800">
                          -{(progress - spendRate).toFixed(1)}%p
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-yellow-700 rounded-lg bg-yellow-100 px-3 py-1.5">{getDailySuggestion(c)}</p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
