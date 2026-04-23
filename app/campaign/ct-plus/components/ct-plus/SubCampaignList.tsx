
"use client"
import React from "react"
import { SubCampaign } from "@/lib/campaignTypes"

export function SubCampaignList({
  media,
  subCampaigns = [],
  csvNames = [],
  takenCsvNames = [],
  usedInMedia,
  onAddSubCampaign,
  onUpdateSubCampaign,
  onRemoveSubCampaign,
  onSetSubCampaignCsvNames,
}: {
  media: string
  subCampaigns?: SubCampaign[]
  csvNames?: string[]
  takenCsvNames?: string[]
  usedInMedia: Set<string>
  onAddSubCampaign: () => void
  onUpdateSubCampaign: (idx: number, field: string, value: string | number | boolean | undefined) => void
  onRemoveSubCampaign: (idx: number) => void
  onSetSubCampaignCsvNames: (idx: number, names: string[]) => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-600">서브 캠페인</span>
        <button
          type="button"
          onClick={onAddSubCampaign}
          className="text-[11px] text-blue-600 hover:text-blue-700 font-medium"
        >
          + 추가
        </button>
      </div>
      {subCampaigns.length === 0 ? (
        <p className="text-[11px] text-gray-400">서브 캠페인 없음 — 위에서 선택한 CSV 캠페인명 전체가 이 매체에 매핑됩니다</p>
      ) : (
        <div className="space-y-2">
          {subCampaigns.map((sc, idx) => (
            <div key={sc.id} className="rounded-lg border border-gray-200 bg-white p-3 space-y-2">
              <div className="flex items-center justify-between">
                <input
                  type="text"
                  value={sc.name}
                  onChange={e => onUpdateSubCampaign(idx, 'name', e.target.value)}
                  placeholder="서브 캠페인명"
                  className="text-xs font-medium flex-1 rounded border border-gray-300 bg-white px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <div className="flex items-center gap-2 ml-2">
                  <label className="flex items-center gap-1 text-[11px] text-gray-500">
                    <input
                      type="checkbox"
                      checked={sc.isVideo ?? false}
                      onChange={e => onUpdateSubCampaign(idx, 'isVideo', e.target.checked)}
                      className="rounded"
                    />
                    동영상
                  </label>
                  <button
                    type="button"
                    onClick={() => onRemoveSubCampaign(idx)}
                    className="text-gray-300 hover:text-red-400 transition-colors"
                  >
                    ×
                  </button>
                </div>
              </div>
              {csvNames.length > 0 ? (
                <div className="rounded border border-gray-200 p-2 space-y-1 max-h-28 overflow-y-auto bg-gray-50">
                  <p className="text-[10px] text-gray-400 mb-1">CSV 캠페인명 매핑 (복수 선택 가능)</p>
                  {csvNames.map(name => {
                    const checked = (sc.csvCampaignNames ?? []).includes(name)
                    const isTakenByOther = takenCsvNames.includes(name)
                    const isUsedInThisMedia = usedInMedia.has(name)
                    const isDisabled = isTakenByOther || (isUsedInThisMedia && !checked)

                    return (
                      <label key={name} className={`flex items-center gap-2 rounded px-2 py-1 cursor-${isDisabled ? 'not-allowed' : 'pointer'} text-[11px] transition-colors ${
                        isDisabled
                          ? 'bg-gray-100 text-gray-400'
                          : checked
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-gray-600 hover:bg-white'
                      }`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={isDisabled}
                          onChange={e => {
                            if (!isDisabled) {
                              const cur = sc.csvCampaignNames ?? []
                              const next = e.target.checked ? [...cur, name] : cur.filter(n => n !== name)
                              onSetSubCampaignCsvNames(idx, next)
                            }
                          }}
                          className="rounded flex-shrink-0"
                        />
                        <span className="truncate">{name}</span>
                        {isTakenByOther && <span className="text-[10px] text-gray-400">(사용 중)</span>}
                        {isUsedInThisMedia && !checked && <span className="text-[10px] text-gray-400">(다른 서브캠에서 사용)</span>}
                      </label>
                    )
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-gray-400 italic">위 &apos;DB 데이터 연결&apos;에서 CSV 캠페인명을 먼저 선택하세요</p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  value={sc.budget || ''}
                  onChange={e => onUpdateSubCampaign(idx, 'budget', parseFloat(e.target.value) || 0)}
                  placeholder="예산"
                  className="text-xs rounded border border-gray-300 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <input
                  type="number"
                  value={sc.totalFeeRate ?? ''}
                  onChange={e => onUpdateSubCampaign(idx, 'totalFeeRate', parseFloat(e.target.value) || undefined)}
                  placeholder="수수료율 %"
                  className="text-xs rounded border border-gray-300 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="number"
                  value={sc.cpcTarget ?? ''}
                  onChange={e => onUpdateSubCampaign(idx, 'cpcTarget', parseFloat(e.target.value) || undefined)}
                  placeholder="CPC"
                  className="text-xs rounded border border-gray-300 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <input
                  type="number"
                  value={sc.cpmTarget ?? ''}
                  onChange={e => onUpdateSubCampaign(idx, 'cpmTarget', parseFloat(e.target.value) || undefined)}
                  placeholder="CPM"
                  className="text-xs rounded border border-gray-300 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                {sc.isVideo ? (
                  <input
                    type="number"
                    value={sc.vtrTarget ?? ''}
                    onChange={e => onUpdateSubCampaign(idx, 'vtrTarget', parseFloat(e.target.value) || undefined)}
                    placeholder="VTR %"
                    className="text-xs rounded border border-gray-300 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                ) : (
                  <input
                    type="number"
                    value={sc.ctrTarget ?? ''}
                    onChange={e => onUpdateSubCampaign(idx, 'ctrTarget', parseFloat(e.target.value) || undefined)}
                    placeholder="CTR %"
                    className="text-xs rounded border border-gray-300 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
