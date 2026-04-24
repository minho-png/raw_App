
"use client"
import React from "react"
import { MediaBudget } from "@/lib/campaignTypes"
import { inputCls, MF } from "./statusUtils"
import { SubCampaignList } from "./SubCampaignList"
import { KpiTargetSection } from "./KpiTargetSection"
import { ActualSpendSection } from "./ActualSpendSection"

export function MediaBudgetCard({ 
  mb, 
  onUpdateMBField, 
  onAddSubCampaign,
  onUpdateSubCampaign,
  onRemoveSubCampaign,
  onSetSubCampaignCsvNames,
  csvNames = [],
  takenCsvNames = [],
  getCsvNamesUsedInMedia,
}: {
  mb: MediaBudget
  onUpdateMBField: (media: string, field: string, value: number | boolean | undefined) => void
  onAddSubCampaign: (media: string) => void
  onUpdateSubCampaign: (media: string, idx: number, field: string, value: string | number | boolean | undefined) => void
  onRemoveSubCampaign: (media: string, idx: number) => void
  onSetSubCampaignCsvNames: (media: string, idx: number, names: string[]) => void
  csvNames?: string[]
  takenCsvNames?: string[]
  getCsvNamesUsedInMedia: (media: string, currentSubIdx: number) => Set<string>
}) {
  const usedInMedia = React.useMemo(
    () => getCsvNamesUsedInMedia(mb.media, -1),
    [mb.media, getCsvNamesUsedInMedia]
  )

  return (
    <div className="rounded-lg border border-gray-200 p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-900">{mb.media}</h3>

      {/* 총 수수료율 + 거래처 수수료율 + 예산 */}
      <div className="grid grid-cols-3 gap-3">
        <MF label="총 수수료율 (%)">
          <input
            type="number" min="0" max="100" step="0.1"
            value={mb.totalFeeRate ?? ''}
            onChange={e => onUpdateMBField(mb.media, 'totalFeeRate', parseFloat(e.target.value) || 0)}
            className={inputCls}
            placeholder="예: 15"
          />
        </MF>
        <MF label="거래처 수수료율 (%)">
          <input
            type="number" min="0" max="100" step="0.1"
            value={mb.clientFeeRate ?? ''}
            onChange={e => onUpdateMBField(mb.media, 'clientFeeRate', parseFloat(e.target.value) || undefined)}
            className={inputCls}
            placeholder="예: 10"
          />
        </MF>
        <MF label="총 예산">
          <input
            type="number" min="0"
            value={mb.totalBudget ?? mb.dmp.budget + mb.nonDmp.budget}
            onChange={e => onUpdateMBField(mb.media, 'totalBudget', parseFloat(e.target.value) || 0)}
            className={inputCls}
          />
        </MF>
      </div>

      {/* 실 소진 데이터 입력 */}
      <ActualSpendSection mb={mb} onUpdateMBField={onUpdateMBField} />

      {/* 동영상 여부 */}
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
          <input
            type="checkbox"
            checked={mb.isVideo ?? false}
            onChange={e => onUpdateMBField(mb.media, 'isVideo', e.target.checked)}
            className="rounded"
          />
          동영상 캠페인
        </label>
      </div>

      {/* KPI 목표 */}
      <KpiTargetSection mb={mb} onUpdateMBField={onUpdateMBField} />

      {/* 서브 캠페인 */}
      <SubCampaignList
        media={mb.media}
        subCampaigns={mb.subCampaigns}
        csvNames={csvNames}
        takenCsvNames={takenCsvNames}
        usedInMedia={usedInMedia}
        onAddSubCampaign={() => onAddSubCampaign(mb.media)}
        onUpdateSubCampaign={(idx, field, value) => onUpdateSubCampaign(mb.media, idx, field, value)}
        onRemoveSubCampaign={(idx) => onRemoveSubCampaign(mb.media, idx)}
        onSetSubCampaignCsvNames={(idx, names) => onSetSubCampaignCsvNames(mb.media, idx, names)}
      />
    </div>
  )
}
