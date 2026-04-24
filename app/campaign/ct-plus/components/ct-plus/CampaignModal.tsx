
"use client"
import React, { useState, useEffect, useRef } from "react"
import {
  Campaign, Operator, Agency, Advertiser, MediaBudget, SubCampaign,
  CampaignType, CAMPAIGN_TYPES, AVAILABLE_MEDIA } from "@/lib/campaignTypes"
import { useRawData } from "@/lib/hooks/useRawData"
import { useMasterData } from "@/lib/hooks/useMasterData"
import { ModalShell } from "@/components/atoms/ModalShell"
import { inputCls, emptyMB, MF } from "./statusUtils"
import { MediaBudgetCard } from "./MediaBudgetCard"
import { CsvMappingPanel } from "./CsvMappingPanel"

// VAT 포함 표시 매체 (실 세팅금액 자동계산 시 ×1.1)
const VAT_INCLUDED_MEDIA = ['네이버 GFA', '카카오모먼트']

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
  const [dashboardNetAmount, setDashboardNetAmount] = useState<number | "">(initial?.dashboardNetAmount ?? "")
  const [csvSearch,       setCsvSearch]       = useState('')
  const [csvMediaFilter,  setCsvMediaFilter]  = useState('')
  const { allRows: rawRows } = useRawData()
  const { saveOperators } = useMasterData()
  const [confirmMode,     setConfirmMode]     = useState<null | "save" | "close">(null)
  const [isDirty,         setIsDirty]         = useState(false)
  const [opDropOpen,      setOpDropOpen]      = useState(false)
  const [newOpName,       setNewOpName]       = useState("")
  const opDropRef = useRef<HTMLDivElement>(null)

  // Close operator dropdown when clicking outside
  useEffect(() => {
    if (!opDropOpen) return
    function onClick(e: MouseEvent) {
      if (opDropRef.current && !opDropRef.current.contains(e.target as Node)) {
        setOpDropOpen(false)
      }
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [opDropOpen])

  async function handleAddOperator() {
    const name = newOpName.trim()
    if (!name) return
    const newOp: Operator = { id: Date.now().toString(), name, email: "", phone: "" }
    await saveOperators([...operators, newOp])
    setManagerId(newOp.id)
    setNewOpName("")
    setOpDropOpen(false)
  }

  async function handleDeleteOperator(id: string) {
    await saveOperators(operators.filter(o => o.id !== id))
    if (managerId === id) setManagerId("")
  }

  // Track dirty state (any change triggers isDirty)
  useEffect(() => {
    setIsDirty(true)
  }, [agencyId, advertiserId, campaignName, campaignType, managerId, startDate, endDate, settlementMonth, status, mediaBudgets, memo, csvNames, dashboardNetAmount])

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
    setMediaBudgets(mediaBudgets.map(mb => {
      if (mb.media !== media) return mb
      const updated: MediaBudget = { ...mb, [field]: value }
      // 총예산/총수수료율 변경 시 실 세팅금액 자동계산 (VAT 매체는 ×1.1)
      if (field === 'totalBudget' || field === 'totalFeeRate') {
        const budget = field === 'totalBudget' ? (value as number) : (mb.totalBudget ?? 0)
        const rate   = field === 'totalFeeRate' ? (value as number) : (mb.totalFeeRate ?? 0)
        if (budget > 0 && rate >= 0) {
          const base = budget * (1 - rate / 100)
          updated.actualSettingCost = Math.round(VAT_INCLUDED_MEDIA.includes(media) ? base * 1.1 : base)
        }
      }
      return updated
    }))
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
      dashboardNetAmount: dashboardNetAmount === "" ? undefined : dashboardNetAmount,
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
    <ModalShell
      open={true}
      onClose={handleCloseClick}
      title={initial ? "캠페인 수정" : "캠페인 추가"}
      maxWidth="2xl"
      scrollable
    >
      <div className="space-y-4">

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
            <div ref={opDropRef} className="relative">
              <button
                type="button"
                onClick={() => setOpDropOpen(v => !v)}
                className={`${inputCls} flex items-center justify-between text-left`}
              >
                <span className={managerId ? "text-gray-900" : "text-gray-400"}>
                  {operators.find(o => o.id === managerId)?.name ?? "선택하세요"}
                </span>
                <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {opDropOpen && (
                <div className="absolute left-0 right-0 top-full mt-1 rounded-lg border border-gray-200 bg-white shadow-lg z-20 max-h-64 overflow-hidden flex flex-col">
                  <ul className="flex-1 overflow-y-auto">
                    {operators.length === 0 && (
                      <li className="px-3 py-2 text-xs text-gray-400">담당자가 없습니다</li>
                    )}
                    {operators.map(o => (
                      <li
                        key={o.id}
                        className={`flex items-center justify-between px-3 py-2 cursor-pointer text-sm hover:bg-gray-50 ${managerId === o.id ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700"}`}
                      >
                        <span onClick={() => { setManagerId(o.id); setOpDropOpen(false) }} className="flex-1">
                          {o.name}
                        </span>
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); handleDeleteOperator(o.id) }}
                          className="ml-2 text-gray-300 hover:text-red-400 transition-colors text-base leading-none"
                          aria-label="담당자 삭제"
                        >×</button>
                      </li>
                    ))}
                  </ul>
                  <div className="border-t border-gray-100 p-2">
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={newOpName}
                        onChange={e => setNewOpName(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddOperator() } }}
                        placeholder="새 담당자 이름"
                        className="flex-1 min-w-0 rounded border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                      <button
                        type="button"
                        onClick={handleAddOperator}
                        className="flex-shrink-0 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
                      >추가</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
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
          <MediaBudgetCard
            key={mb.media}
            mb={mb}
            onUpdateMBField={updateMBField}
            onAddSubCampaign={addSubCampaign}
            onUpdateSubCampaign={updateSubCampaign}
            onRemoveSubCampaign={removeSubCampaign}
            onSetSubCampaignCsvNames={setSubCampaignCsvNames}
            csvNames={csvNames}
            takenCsvNames={takenCsvNames}
            getCsvNamesUsedInMedia={getCsvNamesUsedInMedia}
          />
        ))}

        {/* DB 데이터 연결 */}
        {rawRows.length > 0 && (
          <CsvMappingPanel
            rawRows={rawRows}
            csvNames={csvNames}
            csvSearch={csvSearch}
            csvMediaFilter={csvMediaFilter}
            takenCsvNames={takenCsvNames}
            onCsvSearchChange={setCsvSearch}
            onCsvMediaFilterChange={setCsvMediaFilter}
            onCsvNamesChange={setCsvNames}
          />
        )}

        <MF label={<span>대시보드 소진액 <span className="text-[11px] text-gray-400 font-normal">(대시보드 소진율 계산용 — 직접 입력)</span></span>}>
          <input
            type="number" min="0"
            value={dashboardNetAmount}
            onChange={e => setDashboardNetAmount(e.target.value === "" ? "" : parseFloat(e.target.value) || 0)}
            placeholder="원 (비워두면 raw 데이터 기준)"
            className={inputCls}
          />
        </MF>

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
    </ModalShell>
  )
}
