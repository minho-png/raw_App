"use client"
import React from "react"
import { MediaBudget } from "@/lib/campaignTypes"
import { inputCls, MF } from "./statusUtils"

// 실 세팅금액이 VAT 포함으로 계산되는 매체 (CampaignModal.updateMBField 자동계산 기준과 일치)
const VAT_INCLUDED_MEDIA = ['네이버 GFA', '카카오모먼트']

/**
 * feature/ui-improvements-v2 브랜치 정의 정렬:
 *   - 실 세팅금액(actualSettingCost) 1개만 입력 (VAT 라벨 매체별 분기)
 *   - 실 소진액(actualNetAmount) 입력 제거
 *   - actualSettingCost 는 totalBudget × (1 - totalFeeRate/100) 으로 자동 채움
 *     (네이버 GFA · 카카오모먼트는 ×1.1 VAT 포함)
 *   - 사용자는 자동 채움 값을 수동 override 가능
 *   - 매입 산정 기준값으로 사용됨 (lib/export/settlementExcel.ts).
 */
export function ActualSpendSection({
  mb,
  onUpdateMBField,
}: {
  mb: MediaBudget
  onUpdateMBField: (media: string, field: string, value: number | boolean | undefined) => void
}) {
  if (!mb.totalBudget || !mb.totalFeeRate) return null
  const actualSettingCost = mb.actualSettingCost ?? 0

  return (
    <MF label={
      VAT_INCLUDED_MEDIA.includes(mb.media)
        ? <span>실 세팅금액 <span className="font-bold text-red-500">(VAT포함)</span></span>
        : <span>실 세팅금액 <span className="text-gray-400 font-normal">(VAT별도)</span></span>
    }>
      <input
        type="number" min="0"
        value={actualSettingCost}
        onChange={e => onUpdateMBField(mb.media, 'actualSettingCost', parseFloat(e.target.value) || undefined)}
        className={inputCls}
        placeholder="원 (총예산·수수료율 입력 시 자동 계산)"
      />
    </MF>
  )
}
