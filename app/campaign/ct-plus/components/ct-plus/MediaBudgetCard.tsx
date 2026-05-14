
"use client"
import React from "react"
import { MediaBudget } from "@/lib/campaignTypes"
import type { RawRow } from "@/lib/rawDataParser"
import { inputCls, MF } from "./statusUtils"
import { SubCampaignList } from "./SubCampaignList"
import { KpiTargetSection } from "./KpiTargetSection"
import { ActualSpendSection } from "./ActualSpendSection"

export function MediaBudgetCard({
  mb,
  rawRows = [],
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
  rawRows?: RawRow[]
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

  // 신규: 매체별 CSV 캠페인 필터 — raw 데이터에서 이 매체로 잡힌 캠페인명만 노출/선택 가능.
  const csvNamesForThisMedia = React.useMemo(() => {
    const mediaSet = new Set<string>()
    for (const row of rawRows) {
      if (row.media === mb.media && row.campaignName) mediaSet.add(row.campaignName)
    }
    return csvNames.filter(n => mediaSet.has(n))
  }, [rawRows, mb.media, csvNames])

  // 서브 캠페인이 1개 이상이면 합산값 자동, 0개면 사용자 수동 입력
  const subCount = (mb.subCampaigns ?? []).length
  const hasSubs = subCount > 0
  const computedTotalBudget = React.useMemo(
    () => (mb.subCampaigns ?? []).reduce((s, sc) => s + (sc.budget ?? 0), 0),
    [mb.subCampaigns],
  )
  // sub 가 있을 때만 자동 동기화 — 수동 입력 모드일 때 값을 덮어쓰지 않음
  React.useEffect(() => {
    if (!hasSubs) return
    if (mb.totalBudget !== computedTotalBudget) {
      onUpdateMBField(mb.media, 'totalBudget', computedTotalBudget)
    }
  }, [hasSubs, computedTotalBudget, mb.totalBudget, mb.media, onUpdateMBField])

  return (
    <div className="rounded-lg border border-gray-200 p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-900">{mb.media}</h3>

      {/* DMP 수수료율 + 거래처 수수료율 + 총 예산(자동) */}
      <div className="grid grid-cols-3 gap-3">
        <MF label="DMP 수수료율 (%)">
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
        <MF label={hasSubs ? `총 예산 (캠페인 ${subCount}건 합산 · 자동)` : '총 예산 (직접 입력)'}>
          <input
            type="number"
            min="0"
            step="1"
            value={hasSubs ? computedTotalBudget : (mb.totalBudget ?? '')}
            readOnly={hasSubs}
            onChange={hasSubs ? undefined : e => {
              const v = parseFloat(e.target.value)
              onUpdateMBField(mb.media, 'totalBudget', Number.isFinite(v) ? v : undefined)
            }}
            className={`${inputCls} ${hasSubs ? 'bg-gray-50 text-gray-700 cursor-not-allowed' : ''}`}
            title={hasSubs ? '하위 캠페인 예산의 합으로 자동 계산됩니다' : '하위 캠페인이 없어 직접 입력합니다'}
            placeholder={hasSubs ? undefined : '예: 10000000'}
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

      {/* 캠페인 (구 서브 캠페인) */}
      <SubCampaignList
        media={mb.media}
        subCampaigns={mb.subCampaigns}
        csvNames={csvNamesForThisMedia}
        allSelectedCsvCount={csvNames.length}
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
