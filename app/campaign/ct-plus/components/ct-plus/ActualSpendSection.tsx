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
  // 사용자 결정 — 매체 단위 fee rate 폐지. 하위 캠페인 합산 budget 이 있으면 노출.
  // actualSettingCost 는 CampaignModal.recalcMbBudget 가 sub 합 × (1-feeRate/100) ± VAT 로
  // 자동 채워 넣고, 사용자가 override 가능.
  if (!mb.totalBudget) return null
  const actualSettingCost = mb.actualSettingCost ?? 0
  // 사용자 QA BUG-02 — actualSettingCost > totalBudget 데이터 이상 방지.
  // 수식 budget × (1-fee/100) 으로는 actualSettingCost ≤ totalBudget × 1.1 (VAT 포함) 이 상한.
  // 그 이상 입력 시 경고 (cap 은 PM 결정으로 미적용 — 사용자 의도 보존).
  const upperBound = Math.round(mb.totalBudget * (VAT_INCLUDED_MEDIA.includes(mb.media) ? 1.1 : 1))
  const exceedsBudget = actualSettingCost > upperBound

  return (
    <MF label={
      VAT_INCLUDED_MEDIA.includes(mb.media)
        ? <span>실 세팅금액 <span className="font-bold text-red-500">(VAT 포함)</span></span>
        : <span>실 세팅금액 <span className="text-gray-400 font-normal">(VAT 별도)</span></span>
    }>
      <input
        type="number" min="0"
        value={actualSettingCost}
        onChange={e => onUpdateMBField(mb.media, 'actualSettingCost', parseFloat(e.target.value) || undefined)}
        className={`${inputCls} ${exceedsBudget ? 'border-rose-300 bg-rose-50' : ''}`}
        placeholder="원 (총예산·수수료율 입력 시 자동 계산)"
        title={exceedsBudget ? `실 세팅금액이 부킹 예산(${mb.totalBudget.toLocaleString('ko-KR')})을 초과합니다 — 데이터 오류 가능성` : undefined}
      />
      {exceedsBudget && (
        <p className="mt-1 text-[10px] text-rose-700">
          ⚠ 실 세팅금액이 부킹 예산({mb.totalBudget.toLocaleString('ko-KR')}원)을 초과합니다. 입력값을 확인하세요.
        </p>
      )}
    </MF>
  )
}
