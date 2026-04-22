"use client"
import React, { useState, useMemo, useEffect } from "react"
import {
  Campaign, Operator, Agency, Advertiser, MediaBudget, SubCampaign,
  CampaignType, CAMPAIGN_TYPES, AVAILABLE_MEDIA, getMediaTotals } from "@/lib/campaignTypes"
import { loadAllRawRows } from "@/lib/rawDataStore"
import type { RawRow } from "@/lib/rawDataParser"
import { inputCls, emptyMB, MF } from "./statusUtils"

export function CampaignModal({ initial, operators, agencies, advertisers, onSave, onClose, takenCsvNames = [] }: {
  initial: Campaign | null
  operators: Operator[]
  agencies: Agency[]
  advertisers: Advertiser[]
  onSave: (c: Campaign) => void
  onClose: () => void
  takenCsvNames?: string[]
}) {
  const [agencyId,        setAgencyId]        = useState(initial?.agencyId        ?? "")
  const [advertiserId,    setAdvertiserId]    = useState(initial?.advertiserId    ?? "")
  const [campaignName,    setCampaignName]    = useState(initial?.campaignName    ?? "")
  const [campaignType,    setCampaignType]    = useState<CampaignType | "">(initial?.campaignType ?? "")
  const [managerId,       setManagerId]       = useState(initial?.managerId       ?? "")
  const [startDate,       setStartDate]       = useState(initial?.startDate       ?? "")
  const [endDate,         setEndDate]         = useState(initial?.endDate         ?? "")
  const [settlementMonth, setSettlementMonth] = useState(initial?.settlementMonth ?? "")
  const [status,          setStatus]          = useState<"집행 중" | "종료">(initial?.status ?? "집행 중")
  const [mediaBudgets,    setMediaBudgets]    = useState<MediaBudget[]>(initial?.mediaBudgets ?? [])
  const [memo,            setMemo]            = useState(initial?.memo ?? "")
  const [csvNames,        setCsvNames]        = useState<string[]>(initial?.csvNames ?? [])
  const [csvSearch,       setCsvSearch]       = useState('')
  const [csvMediaFilter,  setCsvMediaFilter]  = useState('')
  const [rawRows,         setRawRows]         = useState<RawRow[]>([])
  const [confirmMode,     setConfirmMode]     = useState<null | "save" | "close">(null)
  const [isDirty,         setIsDirty]         = useState(false)

  // rawRows 로드
  useEffect(() => {
    setRawRows(loadAllRawRows())
  }, [])

  // Track dirty state (any change triggers isDirty)
  useEffect(() => {
    setIsDirty(true)
  }, [agencyId, advertiserId, campaignName, campaignType, managerId, startDate, endDate, settlementMonth, status, mediaBudgets, memo, csvNames])

  // 각 캠페인명 → 연관 매체 메타 계산
  const reportNameMeta = useMemo(() => {
    const meta = new Map<string, { media: Set<string> }>()
    for (const row of rawRows) {
      const name = row.campaignName
      if (!name) continue
      if (!meta.has(name)) meta.set(name, { media: new Set() })
      meta.get(name)!.media.add(row.media)
    }
    return meta
  }, [rawRows])

  const allReportCampaignNames = useMemo(
    () => Array.from(reportNameMeta.keys()).sort(),
    [reportNameMeta]
  )

  const filteredAdvertisers = agencyId ? advertisers.filter(a => a.agencyId === agencyId) : advertisers

  function handleAgencyChange(id: string) {
    setAgencyId(id)
    setAdvertiserId("")
  }

  function toggleMedia(media: string) {
    if (mediaBudgets.some(mb => mb.media === media)) {
      setMediaBudgets(mediaBudgets.filter(mb => mb.media !== media))
    } else {
      setMediaBudgets([...mediaBudgets, emptyMB(media)])
    }
  }

  function updateMBField(media: string, field: string, value: number | boolean | undefined) {
    setMediaBudgets(mediaBudgets.map(mb =>
      mb.media !== media ? mb : { ...mb, [field]: value }
    ))
  }

  function addSubCampaign(media: string) {
    setMediaBudgets(mediaBudgets.map(mb => {
      if (mb.media !== media) return mb
      const sub: SubCampaign = { id: Date.now().toString(), name: '', budget: 0, spend: 0 }
      return { ...mb, subCampaigns: [...(mb.subCampaigns ?? []), sub] }
    }))
  }

  function updateSubCampaign(media: string, idx: number, field: string, value: string | number | boolean | undefined) {
    setMediaBudgets(mediaBudgets.map(mb => {
      if (mb.media !== media) return mb
      const subs = [...(mb.subCampaigns ?? [])]
      if (field === 'csvCampaignNames') {
        const arr = (value as string).split('\n').map((s: string) => s.trim()).filter(Boolean)
        subs[idx] = { ...subs[idx], csvCampaignNames: arr }
      } else {
        subs[idx] = { ...subs[idx], [field]: value }
      }
      return { ...mb, subCampaigns: subs }
    }))
  }

  function removeSubCampaign(media: string, idx: number) {
    setMediaBudgets(mediaBudgets.map(mb => {
      if (mb.media !== media) return mb
      const subs = (mb.subCampaigns ?? []).filter((_, i) => i !== idx)
      return { ...mb, subCampaigns: subs }
    }))
  }

  function setSubCampaignCsvNames(media: string, idx: number, names: string[]) {
    setMediaBudgets(mediaBudgets.map(mb => {
      if (mb.media !== media) return mb
      const subs = [...(mb.subCampaigns ?? [])]
      subs[idx] = { ...subs[idx], csvCampaignNames: names }
      return { ...mb, subCampaigns: subs }
    }))
  }

  // Get CSV names already used in THIS media's other sub-campaigns
  function getCsvNamesUsedInMedia(media: string, currentSubIdx: number): Set<string> {
    const used = new Set<string>()
    const mb = mediaBudgets.find(m => m.media === media)
    if (!mb) return used
    for (let i = 0; i < (mb.subCampaigns ?? []).length; i++) {
      if (i === currentSubIdx) continue
      const sc = mb.subCampaigns![i]
      for (const name of sc.csvCampaignNames ?? []) {
        used.add(name)
      }
    }
    return used
  }

  function handleSaveClick() {
    if (!campaignName.trim() || !agencyId || !advertiserId || !managerId || !startDate || !endDate || !settlementMonth) {
      alert("필수 항목을 입력하세요.")
      return
    }
    setConfirmMode("save")
  }

  function handleConfirmSave() {
    onSave({
      id: initial?.id ?? Date.now().toString(),
      campaignName,
      campaignType: campaignType || undefined,
      agencyId, advertiserId, managerId, startDate, endDate, settlementMonth, status, mediaBudgets, memo,
      csvNames,
      createdAt: initial?.createdAt ?? new Date().toISOString() } as Campaign)
    setConfirmMode(null)
  }

  function handleCloseClick() {
    if (isDirty) {
      setConfirmMode("close")
    } else {
      onClose()
    }
  }

  function handleConfirmClose() {
    onClose()
    setConfirmMode(null)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">{initial ? "캠페인 수정" : "캠페인 추가"}</h2>

        <div className="grid grid-cols-2 gap-4">
          <MF label="대행사 *">
            <select value={agencyId} onChange={e => handleAgencyChange(e.target.value)} className={inputCls}>
              <option value="">선택하세요</option>
              {agencies.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </MF>
          <MF label="광고주 *">
            <select value={advertiserId} onChange={e => setAdvertiserId(e.target.value)} className={inputCls}>
              <option value="">선택하세요</option>
              {filteredAdvertisers.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </MF>
        </div>

        <MF label="캠페인명 *">
          <input type="text" value={campaignName} onChange={e => setCampaignName(e.target.value)} className={inputCls} />
        </MF>

        <div className="grid grid-cols-3 gap-4">
          <MF label="캠페인 유형">
            <select value={campaignType} onChange={e => setCampaignType(e.target.value as CampaignType | "")} className={inputCls}>
              <option value="">미분류</option>
              {CAMPAIGN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </MF>
          <MF label="담당자 *">
            <select value={managerId} onChange={e => setManagerId(e.target.value)} className={inputCls}>
              <option value="">선택하세요</option>
              {operators.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </MF>
          <MF label="상태">
            <select value={status} onChange={e => setStatus(e.target.value as "집행 중" | "종료")} className={inputCls}>
              <option value="집행 중">집행 중</option>
              <option value="종료">종료</option>
            </select>
          </MF>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <MF label="시작일 *">
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputCls} />
          </MF>
          <MF label="종료일 *">
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={inputCls} />
          </MF>
          <MF label="정산월 *">
            <input type="month" value={settlementMonth} onChange={e => setSettlementMonth(e.target.value)} className={inputCls} />
          </MF>
        </div>

        <MF label="매체 선택">
          <div className="flex flex-wrap gap-2">
            {AVAILABLE_MEDIA.map(m => (
              <button key={m} onClick={() => toggleMedia(m)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${mediaBudgets.some(mb => mb.media === m) ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {m}
              </button>
            ))}
          </div>
        </MF>

        {mediaBudgets.map(mb => (
          <div key={mb.media} className="rounded-lg border border-gray-200 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">{mb.media}</h3>

            {/* 총 수수료율 + 예산 */}
            <div className="grid grid-cols-2 gap-3">
              <MF label="총 수수료율 (%)">
                <input
                  type="number" min="0" max="100" step="0.1"
                  value={mb.totalFeeRate ?? ''}
                  onChange={e => updateMBField(mb.media, 'totalFeeRate', parseFloat(e.target.value) || 0)}
                  className={inputCls}
                  placeholder="예: 15"
                />
              </MF>
              <MF label="총 예산">
                <input
                  type="number" min="0"
                  value={mb.totalBudget ?? mb.dmp.budget + mb.nonDmp.budget}
                  onChange={e => updateMBField(mb.media, 'totalBudget', parseFloat(e.target.value) || 0)}
                  className={inputCls}
                />
              </MF>
            </div>

            {/* 실 소진 데이터 입력 */}
            {mb.totalBudget && mb.totalFeeRate && (() => {
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
                        onChange={e => updateMBField(mb.media, 'actualSettingCost', parseFloat(e.target.value) || undefined)}
                        className={inputCls}
                        placeholder="원"
                      />
                    </MF>
                    <MF label="실 소진액">
                      <input
                        type="number" min="0"
                        value={actualNetAmount}
                        onChange={e => updateMBField(mb.media, 'actualNetAmount', parseFloat(e.target.value) || undefined)}
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
            })()}

            {/* 동영상 여부 */}
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
                <input
                  type="checkbox"
                  checked={mb.isVideo ?? false}
                  onChange={e => updateMBField(mb.media, 'isVideo', e.target.checked)}
                  className="rounded"
                />
                동영상 캠페인
              </label>
            </div>

            {/* KPI 목표 */}
            <div className="grid grid-cols-3 gap-3">
              <MF label="CPC 목표">
                <input
                  type="number" min="0"
                  value={mb.cpcTarget ?? ''}
                  onChange={e => updateMBField(mb.media, 'cpcTarget', parseFloat(e.target.value) || undefined)}
                  className={inputCls}
                  placeholder="원"
                />
              </MF>
              <MF label="CPM 목표">
                <input
                  type="number" min="0"
                  value={mb.cpmTarget ?? ''}
                  onChange={e => updateMBField(mb.media, 'cpmTarget', parseFloat(e.target.value) || undefined)}
                  className={inputCls}
                  placeholder="원"
                />
              </MF>
              {mb.isVideo ? (
                <MF label="VTR 목표 (%)">
                  <input
                    type="number" min="0" max="100" step="0.01"
                    value={mb.vtrTarget ?? ''}
                    onChange={e => updateMBField(mb.media, 'vtrTarget', parseFloat(e.target.value) || undefined)}
                    className={inputCls}
                    placeholder="예: 50"
                  />
                </MF>
              ) : (
                <MF label="CTR 목표 (%)">
                  <input
                    type="number" min="0" max="100" step="0.01"
                    value={mb.ctrTarget ?? ''}
                    onChange={e => updateMBField(mb.media, 'ctrTarget', parseFloat(e.target.value) || undefined)}
                    className={inputCls}
                    placeholder="예: 0.05"
                  />
                </MF>
              )}
            </div>

            {/* 예상 노출수 계산 */}
            {(mb.cpmTarget || mb.cpcTarget) && (
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 space-y-1">
                <p className="text-xs font-semibold text-blue-900">예상 노출수 계산:</p>
                {mb.cpmTarget && (
                  <p className="text-[11px] text-blue-700">
                    CPM 기준: ({(mb.totalBudget ?? 0).toLocaleString()} / {mb.cpmTarget}) × 1000 = {((mb.totalBudget ?? 0) / mb.cpmTarget * 1000).toLocaleString('ko-KR', { maximumFractionDigits: 0 })}회
                  </p>
                )}
                {mb.cpcTarget && mb.ctrTarget && (
                  <p className="text-[11px] text-blue-700">
                    CPC+CTR 기준: ({(mb.totalBudget ?? 0).toLocaleString()} / {mb.cpcTarget}) / ({mb.ctrTarget} / 100) = {((mb.totalBudget ?? 0) / mb.cpcTarget / (mb.ctrTarget / 100)).toLocaleString('ko-KR', { maximumFractionDigits: 0 })}회
                  </p>
                )}
              </div>
            )}

            {/* 서브 캠페인 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-600">서브 캠페인</span>
                <button
                  type="button"
                  onClick={() => addSubCampaign(mb.media)}
                  className="text-[11px] text-blue-600 hover:text-blue-700 font-medium"
                >
                  + 추가
                </button>
              </div>
              {(mb.subCampaigns ?? []).length === 0 ? (
                <p className="text-[11px] text-gray-400">서브 캠페인 없음 — 위에서 선택한 CSV 캠페인명 전체가 이 매체에 매핑됩니다</p>
              ) : (
                <div className="space-y-2">
                  {(mb.subCampaigns ?? []).map((sc, idx) => {
                    const usedInMedia = getCsvNamesUsedInMedia(mb.media, idx)
                    return (
                      <div key={sc.id} className="rounded-lg border border-gray-200 bg-white p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <input
                            type="text"
                            value={sc.name}
                            onChange={e => updateSubCampaign(mb.media, idx, 'name', e.target.value)}
                            placeholder="서브 캠페인명"
                            className="text-xs font-medium flex-1 rounded border border-gray-300 bg-white px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                          <div className="flex items-center gap-2 ml-2">
                            <label className="flex items-center gap-1 text-[11px] text-gray-500">
                              <input
                                type="checkbox"
                                checked={sc.isVideo ?? false}
                                onChange={e => updateSubCampaign(mb.media, idx, 'isVideo', e.target.checked)}
                                className="rounded"
                              />
                              동영상
                            </label>
                            <button
                              type="button"
                              onClick={() => removeSubCampaign(mb.media, idx)}
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
                                        setSubCampaignCsvNames(mb.media, idx, next)
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
                            onChange={e => updateSubCampaign(mb.media, idx, 'budget', parseFloat(e.target.value) || 0)}
                            placeholder="예산"
                            className="text-xs rounded border border-gray-300 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                          <input
                            type="number"
                            value={sc.totalFeeRate ?? ''}
                            onChange={e => updateSubCampaign(mb.media, idx, 'totalFeeRate', parseFloat(e.target.value) || undefined)}
                            placeholder="수수료율 %"
                            className="text-xs rounded border border-gray-300 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <input
                            type="number"
                            value={sc.cpcTarget ?? ''}
                            onChange={e => updateSubCampaign(mb.media, idx, 'cpcTarget', parseFloat(e.target.value) || undefined)}
                            placeholder="CPC"
                            className="text-xs rounded border border-gray-300 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                          <input
                            type="number"
                            value={sc.cpmTarget ?? ''}
                            onChange={e => updateSubCampaign(mb.media, idx, 'cpmTarget', parseFloat(e.target.value) || undefined)}
                            placeholder="CPM"
                            className="text-xs rounded border border-gray-300 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                          {sc.isVideo ? (
                            <input
                              type="number"
                              value={sc.vtrTarget ?? ''}
                              onChange={e => updateSubCampaign(mb.media, idx, 'vtrTarget', parseFloat(e.target.value) || undefined)}
                              placeholder="VTR %"
                              className="text-xs rounded border border-gray-300 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                            />
                          ) : (
                            <input
                              type="number"
                              value={sc.ctrTarget ?? ''}
                              onChange={e => updateSubCampaign(mb.media, idx, 'ctrTarget', parseFloat(e.target.value) || undefined)}
                              placeholder="CTR %"
                              className="text-xs rounded border border-gray-300 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                            />
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* DB 데이터 연결 */}
        {allReportCampaignNames.length > 0 && (() => {
          // 모든 매체 목록 수집
          const allMedia = Array.from(new Set(
            allReportCampaignNames.flatMap(n => Array.from(reportNameMeta.get(n)?.media ?? []))
          )).sort()

          // 검색 + 매체 필터 적용
          const filtered = allReportCampaignNames.filter(name => {
            if (csvSearch && !name.toLowerCase().includes(csvSearch.toLowerCase())) return false
            if (csvMediaFilter) {
              const meta = reportNameMeta.get(name)
              if (!meta?.media.has(csvMediaFilter)) return false
            }
            return true
          })

          return (
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-2">DB 데이터 연결</label>
              <p className="text-[11px] text-gray-500 mb-2">업로드된 데이터 중 이 캠페인에 해당하는 항목을 선택하세요.</p>

              {/* 검색 + 매체 필터 */}
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={csvSearch}
                  onChange={e => setCsvSearch(e.target.value)}
                  placeholder="캠페인명 검색..."
                  className="flex-1 rounded-md border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <select
                  value={csvMediaFilter}
                  onChange={e => setCsvMediaFilter(e.target.value)}
                  className="rounded-md border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                >
                  <option value="">전체 매체</option>
                  {allMedia.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 p-2 space-y-1">
                {filtered.length === 0 && (
                  <p className="text-[11px] text-gray-400 text-center py-2">검색 결과 없음</p>
                )}
                {filtered.map(name => {
                  const checked = csvNames.includes(name)
                  const meta = reportNameMeta.get(name)
                  const mediaTags = meta ? Array.from(meta.media) : []
                  const isTaken = takenCsvNames.includes(name)

                  return (
                    <label key={name} className={`flex items-start gap-2 rounded-md px-2 py-1.5 cursor-${isTaken && !checked ? 'not-allowed' : 'pointer'} transition-colors ${
                      isTaken && !checked
                        ? 'bg-gray-100'
                        : checked
                        ? "bg-blue-50"
                        : "hover:bg-gray-50"
                    }`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={isTaken && !checked}
                        onChange={e => {
                          if (e.target.checked) setCsvNames(prev => [...prev, name])
                          else setCsvNames(prev => prev.filter(n => n !== name))
                        }}
                        className="rounded mt-0.5 flex-shrink-0"
                      />
                      <div className="min-w-0">
                        <span className={`text-xs block truncate ${isTaken && !checked ? 'text-gray-400' : checked ? "text-blue-700 font-medium" : "text-gray-700"}`}>
                          {name}
                          {isTaken && !checked && ' (사용 중)'}
                        </span>
                        {mediaTags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {mediaTags.map(t => (
                              <span key={t} className="inline-block rounded px-1 py-0 text-[10px] bg-gray-100 text-gray-500">{t}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </label>
                  )
                })}
              </div>
              {csvNames.length > 0 && (
                <p className="mt-1.5 text-[11px] text-blue-600">{csvNames.length}개 선택됨</p>
              )}
            </div>
          )
        })()}

        <MF label="특이사항">
          <textarea value={memo} onChange={e => setMemo(e.target.value)} className={inputCls} rows={3} />
        </MF>

        {/* 확인 섹션 */}
        {confirmMode === "save" && (
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 space-y-3">
            <p className="text-sm font-semibold text-blue-900">저장하시겠습니까?</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmMode(null)} className="rounded-lg border border-blue-300 bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 transition-colors">취소</button>
              <button onClick={handleConfirmSave} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors">확인</button>
            </div>
          </div>
        )}

        {confirmMode === "close" && (
          <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-4 space-y-3">
            <p className="text-sm font-semibold text-yellow-900">변경사항이 있습니다. 닫으시겠습니까?</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmMode(null)} className="rounded-lg border border-yellow-300 bg-white px-4 py-2 text-sm font-medium text-yellow-700 hover:bg-yellow-50 transition-colors">계속 편집</button>
              <button onClick={handleConfirmClose} className="rounded-lg bg-yellow-600 px-4 py-2 text-sm font-medium text-white hover:bg-yellow-700 transition-colors">닫기</button>
            </div>
          </div>
        )}

        <div className="flex gap-2 justify-end pt-4 border-t border-gray-200">
          <button onClick={handleCloseClick} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">취소</button>
          <button onClick={handleSaveClick} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors">저장</button>
        </div>
      </div>
    </div>
  )
}
