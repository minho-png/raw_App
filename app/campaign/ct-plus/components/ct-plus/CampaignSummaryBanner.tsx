"use client"
import React from "react"
import { SCard, fmt } from "./statusUtils"

// 이상치 로직은 AnomalyBanner로 분리됨. 이 컴포넌트는 통계 카드만 표시.
// 사용자 QA v4 V4-INFO-01 (R2 권고) — 매체 chip 등 필터 활성 시 '전체 합계' 보조 라인 표시.
export function CampaignSummaryBanner({
  summary, unfiltered, filterLabel,
}: {
  summary: {
    total: number
    active: number
    ended: number
    totalBudget: number
    totalSettingCost: number
  }
  /** 필터 적용 안 한 전체 합계 (있을 때만 보조 라인 노출). */
  unfiltered?: { totalBudget: number; totalSettingCost: number } | null
  /** 필터 라벨 (예: '네이버 GFA') — 카드 라벨 옆 chip 으로 노출. */
  filterLabel?: string
}) {
  const showSub = !!unfiltered && (
    unfiltered.totalBudget !== summary.totalBudget ||
    unfiltered.totalSettingCost !== summary.totalSettingCost
  )
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <SCard label="전체 캠페인"  value={`${summary.total}개`} />
      <SCard label="집행 중"      value={`${summary.active}개`} color="blue" />
      <SCard label="종료"         value={`${summary.ended}개`}  color="gray" />
      <SCard
        label={filterLabel ? `부킹 금액 (${filterLabel})` : '부킹 금액'}
        value={fmt(summary.totalBudget)}
        sub={showSub ? `원 · 전체 ${fmt(unfiltered!.totalBudget)}` : '원'}
      />
      <SCard
        label={filterLabel ? `세팅 금액 (${filterLabel})` : '세팅 금액'}
        value={fmt(summary.totalSettingCost)}
        sub={showSub ? `원 · 전체 ${fmt(unfiltered!.totalSettingCost)}` : '원'}
      />
    </div>
  )
}
