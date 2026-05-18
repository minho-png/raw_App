
"use client"
import React from "react"
import { SubCampaign, calcSettingCost, applyMediaVat } from "@/lib/campaignTypes"

export function SubCampaignList({
  media,
  subCampaigns = [],
  csvNames = [],
  allSelectedCsvCount = 0,
  takenCsvNames = [],
  usedInMedia,
  onAddSubCampaign,
  onUpdateSubCampaign,
  onRemoveSubCampaign,
  onSetSubCampaignCsvNames,
}: {
  media: string
  subCampaigns?: SubCampaign[]
  /** 이 매체에 매칭되는 CSV 캠페인명 (이미 매체별 필터 적용됨) */
  csvNames?: string[]
  /** 상위에서 전체 선택된 CSV 캠페인 개수 — '없음' 안내 분기 */
  allSelectedCsvCount?: number
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
        <span className="text-xs font-medium text-gray-600">캠페인</span>
        <button
          type="button"
          onClick={onAddSubCampaign}
          className="text-[11px] text-blue-600 hover:text-blue-700 font-medium"
        >
          + 추가
        </button>
      </div>
      {subCampaigns.length === 0 ? (
        <p className="text-[11px] text-gray-400">캠페인 없음 — 위에서 선택한 CSV 캠페인명 전체가 이 매체에 매핑됩니다</p>
      ) : (
        <div className="space-y-2">
          {subCampaigns.map((sc, idx) => (
            <div key={sc.id} className="rounded-lg border border-gray-200 bg-white p-3 space-y-2">
              <div className="flex items-center justify-between">
                <input
                  type="text"
                  value={sc.name}
                  onChange={e => onUpdateSubCampaign(idx, 'name', e.target.value)}
                  placeholder="캠페인명"
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
                  <p className="text-[10px] text-gray-400 mb-1">
                    CSV 캠페인명 매핑 — <span className="font-medium text-gray-500">{media}</span> 매체에 잡힌 항목만 표시
                  </p>
                  {csvNames.map(name => {
                    const checked = (sc.csvCampaignNames ?? []).includes(name)
                    const isTakenByOther = takenCsvNames.includes(name)
                    const isUsedInThisMedia = usedInMedia.has(name)
                    const isDisabled = isTakenByOther || (isUsedInThisMedia && !checked)
                    const lockedTitle = isDisabled
                      ? (isTakenByOther ? '다른 캠페인에서 사용 중' : '같은 매체의 다른 서브캠페인에서 사용 중')
                      : undefined

                    return (
                      <label key={name} title={lockedTitle} className={`flex items-center gap-2 rounded px-2 py-1 text-[11px] transition-colors ${
                        isDisabled
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : checked
                          ? 'bg-blue-50 text-blue-700 cursor-pointer'
                          : 'text-gray-600 hover:bg-white cursor-pointer'
                      }`}>
                        {isDisabled ? (
                          <span className="flex-shrink-0 inline-flex h-3 w-3 items-center justify-center text-gray-400" aria-label="사용 중">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="h-3 w-3">
                              <rect x="5" y="11" width="14" height="9" rx="1.5" />
                              <path d="M8 11V8a4 4 0 0 1 8 0v3" strokeLinecap="round" />
                            </svg>
                          </span>
                        ) : (
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={e => {
                              const cur = sc.csvCampaignNames ?? []
                              const next = e.target.checked ? [...cur, name] : cur.filter(n => n !== name)
                              onSetSubCampaignCsvNames(idx, next)
                            }}
                            className="rounded flex-shrink-0"
                          />
                        )}
                        <span className="truncate">{name}</span>
                        {isTakenByOther && <span className="text-[10px] text-gray-400">(사용 중)</span>}
                        {isUsedInThisMedia && !checked && <span className="text-[10px] text-gray-400">(다른 서브캠)</span>}
                      </label>
                    )
                  })}
                </div>
              ) : allSelectedCsvCount > 0 ? (
                <p className="text-[11px] text-amber-600 italic">
                  위 &apos;DB 데이터 연결&apos;에서 선택한 CSV 캠페인 중 <span className="font-medium">{media}</span> 매체에 잡힌 항목이 없습니다.
                </p>
              ) : (
                <p className="text-[11px] text-gray-400 italic">위 &apos;DB 데이터 연결&apos;에서 CSV 캠페인명을 먼저 선택하세요</p>
              )}
              {/* 예산/수수료 + 세팅금액 미리보기 */}
              <SubBudgetRow sc={sc} idx={idx} onUpdateSubCampaign={onUpdateSubCampaign} media={media} />

              {/* 캠페인 목표 (CPC / CPM / CTR·VTR) */}
              <div>
                <p className="text-[10px] font-medium text-gray-400 mb-1">캠페인 목표</p>
                <div className="grid grid-cols-3 gap-2">
                  <FieldWithSuffix label="CPC" suffix="원">
                    <input
                      type="number" min="0"
                      value={sc.cpcTarget ?? ''}
                      onChange={e => onUpdateSubCampaign(idx, 'cpcTarget', parseFloat(e.target.value) || undefined)}
                      placeholder="0"
                      className="w-full text-xs rounded border border-gray-300 px-2 py-1 pr-7 focus:outline-none focus:ring-1 focus:ring-blue-400 tabular-nums"
                    />
                  </FieldWithSuffix>
                  <FieldWithSuffix label="CPM" suffix="원">
                    <input
                      type="number" min="0"
                      value={sc.cpmTarget ?? ''}
                      onChange={e => onUpdateSubCampaign(idx, 'cpmTarget', parseFloat(e.target.value) || undefined)}
                      placeholder="0"
                      className="w-full text-xs rounded border border-gray-300 px-2 py-1 pr-7 focus:outline-none focus:ring-1 focus:ring-blue-400 tabular-nums"
                    />
                  </FieldWithSuffix>
                  {sc.isVideo ? (
                    <FieldWithSuffix label="VTR" suffix="%">
                      <input
                        type="number" min="0" max="100" step="0.1"
                        value={sc.vtrTarget ?? ''}
                        onChange={e => onUpdateSubCampaign(idx, 'vtrTarget', parseFloat(e.target.value) || undefined)}
                        placeholder="0"
                        className="w-full text-xs rounded border border-gray-300 px-2 py-1 pr-6 focus:outline-none focus:ring-1 focus:ring-blue-400 tabular-nums"
                      />
                    </FieldWithSuffix>
                  ) : (
                    <FieldWithSuffix label="CTR" suffix="%">
                      <input
                        type="number" min="0" max="100" step="0.01"
                        value={sc.ctrTarget ?? ''}
                        onChange={e => onUpdateSubCampaign(idx, 'ctrTarget', parseFloat(e.target.value) || undefined)}
                        placeholder="0"
                        className="w-full text-xs rounded border border-gray-300 px-2 py-1 pr-6 focus:outline-none focus:ring-1 focus:ring-blue-400 tabular-nums"
                      />
                    </FieldWithSuffix>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// 세부 캠페인 예산/수수료 + 세팅금액(자동) 미리보기.
// 사용자 요구 — 라벨/그룹/자동 산출 가시화로 UX 명확화.
function SubBudgetRow({
  sc, idx, media, onUpdateSubCampaign,
}: {
  sc: SubCampaign
  idx: number
  media: string
  onUpdateSubCampaign: (idx: number, field: string, value: string | number | boolean | undefined) => void
}) {
  const settingCost = React.useMemo(() => {
    if (!sc.budget) return 0
    const base = calcSettingCost(sc.budget, sc.totalFeeRate ?? 0)
    return applyMediaVat(media, base)
  }, [sc.budget, sc.totalFeeRate, media])
  return (
    <div>
      <p className="text-[10px] font-medium text-gray-400 mb-1">예산 · 수수료</p>
      <div className="grid grid-cols-[1fr_120px] gap-2">
        <FieldWithSuffix label="예산" suffix="원">
          <input
            type="number" min="0" step="1"
            value={sc.budget || ''}
            onChange={e => onUpdateSubCampaign(idx, 'budget', parseFloat(e.target.value) || 0)}
            placeholder="0"
            className="w-full text-xs rounded border border-gray-300 px-2 py-1 pr-7 focus:outline-none focus:ring-1 focus:ring-blue-400 tabular-nums"
          />
        </FieldWithSuffix>
        <FieldWithSuffix label="수수료율" suffix="%">
          <input
            type="number" min="0" max="100" step="0.1"
            value={sc.totalFeeRate ?? ''}
            onChange={e => onUpdateSubCampaign(idx, 'totalFeeRate', parseFloat(e.target.value) || undefined)}
            placeholder="0"
            className="w-full text-xs rounded border border-gray-300 px-2 py-1 pr-6 focus:outline-none focus:ring-1 focus:ring-blue-400 tabular-nums"
          />
        </FieldWithSuffix>
      </div>
      <p className="mt-1 text-[10px] text-gray-400">
        세팅금액(자동) <span className="ml-1 font-semibold text-gray-600 tabular-nums">₩{settingCost.toLocaleString('ko-KR')}</span>
        <span className="ml-1 text-gray-300">= 예산 × (1 − 수수료율) {media === '네이버 GFA' ? '× 1.1 (VAT)' : ''}</span>
      </p>
    </div>
  )
}

// 입력 상단 라벨 + 우측 단위 suffix 를 같이 표시하는 작은 wrapper.
function FieldWithSuffix({
  label, suffix, children,
}: {
  label: string
  suffix: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="block text-[10px] font-medium text-gray-500 mb-0.5">{label}</span>
      <span className="relative block">
        {children}
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-gray-400">{suffix}</span>
      </span>
    </label>
  )
}
