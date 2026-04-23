"use client"
import React from "react"
import { SCard, fmt } from "./statusUtils"

// 이상치 로직은 AnomalyBanner로 분리됨. 이 컴포넌트는 통계 카드만 표시.
export function CampaignSummaryBanner({
  summary,
}: {
  summary: {
    total: number
    active: number
    ended: number
    totalBudget: number
    totalSettingCost: number
  }
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <SCard label="전체 캠페인"  value={`${summary.total}개`} />
      <SCard label="집행 중"      value={`${summary.active}개`} color="blue" />
      <SCard label="종료"         value={`${summary.ended}개`}  color="gray" />
      <SCard label="부킹 금액"    value={fmt(summary.totalBudget)}      sub="원" />
      <SCard label="세팅 금액"    value={fmt(summary.totalSettingCost)} sub="원" />
    </div>
  )
}
