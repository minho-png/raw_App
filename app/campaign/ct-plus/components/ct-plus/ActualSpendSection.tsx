
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
  const settingCost = totals.totalSettingCost
  const actualSettingCost = mb.actualSettingCost ?? 0
  const actualNetAmount = mb.actualNetAmount ?? 0
  const markupSpendRate = totals.spendRate
  const actualSpendRate = actualSettingCost > 0 ? (actualNetAmount / actualSettingCost * 100) : 0
  const spendRateDiff = Math.abs(actualSpendRate - markupSpendRate)
  const showWarning = spendRateDiff > 5

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
        <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2 flex items-center gap-2">
          <span className="text-[11px] font-semibold text-yellow-700">
            소진율 차이 {spendRateDiff.toFixed(1)}%p
          </span>
          <span className="text-[10px] text-yellow-600">
            (설정: {markupSpendRate.toFixed(1)}% vs 실제: {actualSpendRate.toFixed(1)}%)
          </span>
        </div>
      )}
    </div>
  )
}
