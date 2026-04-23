"use client"
import React from "react"
import { MediaBudget, getMediaTotals } from "@/lib/campaignTypes"
import { inputCls, MF } from "./statusUtils"

export function ActualSpendSection({
  mb,
  onUpdateMBField,
}: {
  mb: MediaBudget
  onUpdateMBField: (media: string, field: string, value: number | boolean | undefined) => void
}) {
  if (!mb.totalBudget || !mb.totalFeeRate) return null

  const totals = getMediaTotals(mb)
  const actualSettingCost = mb.actualSettingCost ?? 0
  const actualNetAmount = mb.actualNetAmount ?? 0
  // 실 소진율: 직접 입력한 실세팅금액 대비 실소진액
  const actualSpendRate = actualSettingCost > 0 ? (actualNetAmount / actualSettingCost * 100) : 0
  // 세팅 소진율: 부킹예산 기준 (config mb.dmp.spend 기반 — 참고용)
  const configSpendRate = totals.spendRate
  const spendRateDiff = Math.abs(actualSpendRate - configSpendRate)
  // 임계값 15%p (캠페인 현황 이상치 감지 기준과 동일)
  const showWarning = actualNetAmount > 0 && spendRateDiff >= 15

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3">
        <MF label="실 세팅금액">
          <input
            type="number" min="0"
            value={actualSettingCost}
            onChange={e => onUpdateMBField(mb.media, 'actualSettingCost', parseFloat(e.target.value) || undefined)}
            className={inputCls}
            placeholder="원"
          />
        </MF>
        <MF label="실 소진액">
          <input
            type="number" min="0"
            value={actualNetAmount}
            onChange={e => onUpdateMBField(mb.media, 'actualNetAmount', parseFloat(e.target.value) || undefined)}
            className={inputCls}
            placeholder="원"
          />
        </MF>
      </div>
      {showWarning && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 flex items-center gap-2">
          <span className="text-[11px] font-semibold text-red-700">
            ⚠ 소진율 차이 {spendRateDiff.toFixed(1)}%p
          </span>
          <span className="text-[10px] text-red-600">
            (세팅 기준: {configSpendRate.toFixed(1)}% vs 실 입력: {actualSpendRate.toFixed(1)}%)
          </span>
        </div>
      )}
    </div>
  )
}
