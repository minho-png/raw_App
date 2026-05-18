
"use client"
import React from "react"
import { MediaBudget } from "@/lib/campaignTypes"
import type { RawRow } from "@/lib/rawDataParser"
import { SubCampaignList } from "./SubCampaignList"
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

  // 사용자 결정 — 매체 단위 직접 입력 제거. mb.totalBudget 는 항상 세부 합으로 동기화.
  // 사용자 보고 예산 버그(매체 / 세부 budget 이 모든 매체 합으로 잡힘) — sub=0 일 때도
  // mb.totalBudget=0 으로 강제 동기화해 stale 값 제거.
  const subCount = (mb.subCampaigns ?? []).length
  const computedTotalBudget = React.useMemo(
    () => (mb.subCampaigns ?? []).reduce((s, sc) => s + (sc.budget ?? 0), 0),
    [mb.subCampaigns],
  )
  React.useEffect(() => {
    if (mb.totalBudget !== computedTotalBudget) {
      onUpdateMBField(mb.media, 'totalBudget', computedTotalBudget)
    }
  }, [computedTotalBudget, mb.totalBudget, mb.media, onUpdateMBField])

  return (
    <div className="rounded-lg border border-gray-200 p-4 space-y-3">
      {/* 사용자 결정 — 매체 단위 설정(수수료율/총예산/동영상/CPC·CPM·CTR 목표) 모두 제거.
          이 값들은 세부 캠페인(SubCampaign) 카드에서 입력. 매체 카드는 매체명 +
          (자동 합산) 총 예산 표시 + 세부 캠페인 list + 실 소진 데이터 만. */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">{mb.media}</h3>
        <div className="text-[11px] text-gray-500">
          총 예산 (세부 {subCount}건 합산){' '}
          <span className="font-bold text-blue-700 tabular-nums ml-1">
            ₩{computedTotalBudget.toLocaleString('ko-KR')}
          </span>
        </div>
      </div>

      {/* 실 소진 데이터 입력 (유지) */}
      <ActualSpendSection mb={mb} onUpdateMBField={onUpdateMBField} />

      {/* 캠페인 (세부 캠페인) — 모든 매체 단위 설정은 여기로 귀속됨 */}
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
