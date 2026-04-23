"use client"
import { CampaignModal } from "@/app/campaign/ct-plus/components/ct-plus/CampaignModal"
import { CampaignDetailPanel } from "@/app/campaign/ct-plus/components/ct-plus/CampaignDetailPanel"
import { AgencyEditTab } from "@/app/campaign/ct-plus/components/ct-plus/AgencyEditTab"
import { CampaignFilterBar } from "@/app/campaign/ct-plus/components/ct-plus/CampaignFilterBar"
import { CampaignSummaryBanner } from "@/app/campaign/ct-plus/components/ct-plus/CampaignSummaryBanner"
import { CampaignTableSection } from "@/app/campaign/ct-plus/components/ct-plus/CampaignTableSection"
import { OperatorModal } from "@/app/campaign/ct-plus/components/ct-plus/OperatorModal"
import { AdvertiserModal } from "@/app/campaign/ct-plus/components/ct-plus/AdvertiserModal"
import { AgencyFormModal } from "@/app/campaign/ct-plus/components/ct-plus/AgencyFormModal"
import { AgencyListTab } from "@/app/campaign/ct-plus/components/ct-plus/AgencyListTab"
import { AdvertiserListTab } from "@/app/campaign/ct-plus/components/ct-plus/AdvertiserListTab"
import { OperatorListTab } from "@/app/campaign/ct-plus/components/ct-plus/OperatorListTab"
import { ConfirmModal, FilterStatus, btnPrimary } from "@/app/campaign/ct-plus/components/ct-plus/statusUtils"
import type { ConfirmCfg } from "@/app/campaign/ct-plus/components/ct-plus/statusUtils"

import React, { useState, useMemo, useRef, useEffect } from "react"
import dynamic from "next/dynamic"
import * as XLSX from 'xlsx'

const CTPlusOverviewTab = dynamic(() => import("../overview/page"), { ssr: false, loading: () => <div className="p-8 text-center text-sm text-gray-500">로딩 중…</div> })

type OuterTab = "overview" | "status"
type StatusTab = "campaigns" | "agencies" | "advertisers" | "operators"
type AgencySubTab = "list" | "edit"

import { Campaign, Operator, Agency, Advertiser, getCampaignTotals, getCampaignProgress } from "@/lib/campaignTypes"
import { useMasterData } from "@/lib/hooks/useMasterData"
import { useRawData } from "@/lib/hooks/useRawData"
import { applyMarkupToRows } from "@/lib/markupService"

export default function CampaignStatusOuter() {
  const [outerTab, setOuterTab] = useState<OuterTab>("status")
  const outerTabs: { key: OuterTab; label: string; emoji: string }[] = [
    { key: "overview", label: "CT+ 현황", emoji: "📊" },
    { key: "status", label: "집행 관리", emoji: "📋" },
  ]
  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <div className="border-b border-gray-200 bg-white px-6 pt-3 flex gap-1">
        {outerTabs.map(({ key, label, emoji }) => (
          <button key={key} onClick={() => setOuterTab(key)} className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${outerTab === key ? "border-orange-500 text-orange-700 bg-orange-50" : "border-transparent text-gray-600 hover:text-gray-800 hover:bg-gray-50"}`}>
            <span>{emoji}</span>{label}
          </button>
        ))}
      </div>
      <div className="flex-1">
        {outerTab === "overview" && <CTPlusOverviewTab />}
        {outerTab === "status" && <CampaignStatusPage />}
      </div>
    </div>
  )
}

function CampaignStatusPage() {
  const { campaigns, operators, agencies, advertisers, saveCampaigns, saveOperators, saveAgencies, saveAdvertisers } = useMasterData()
  const { allRows: rawRows } = useRawData()

  const [statusTab, setStatusTab] = useState<StatusTab>("campaigns")
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("전체")
  const [filterMonth, setFilterMonth] = useState("")
  const [filterOperator, setFilterOperator] = useState("")
  const [filterMedia, setFilterMedia] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Campaign | null>(null)
  const [opModalOpen, setOpModalOpen] = useState(false)
  const [editOp, setEditOp] = useState<Operator | null>(null)
  const [agencySubTab, setAgencySubTab] = useState<AgencySubTab>("list")
  const [editAg, setEditAg] = useState<Agency | null>(null)
  const [agModalOpen, setAgModalOpen] = useState(false)
  const [advModalOpen, setAdvModalOpen] = useState(false)
  const [editAdv, setEditAdv] = useState<Advertiser | null>(null)
  const [confirmCfg, setConfirmCfg] = useState<ConfirmCfg | null>(null)
  const [alertOpen, setAlertOpen] = useState(true)
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const takenCsvNames = useMemo(() => campaigns.filter(c => c.id !== editTarget?.id).flatMap(c => c.csvNames ?? []), [campaigns, editTarget])
  const [computedSpendMap, setComputedSpendMap] = useState<Map<string, { netAmount: number; executionAmount: number; rowCount: number }>>(new Map())
  const [selectedDetailId, setSelectedDetailId] = useState<string | null>(null)
  const selectedDetailCampaign = useMemo(() => campaigns.find(c => c.id === selectedDetailId) ?? null, [campaigns, selectedDetailId])

  useEffect(() => {
    if (campaigns.length === 0 || rawRows.length === 0) return
    const computed = applyMarkupToRows(rawRows, campaigns)
    const map = new Map<string, { netAmount: number; executionAmount: number; rowCount: number }>()
    for (const row of computed) {
      if (!row.matchedCampaignId) continue
      const prev = map.get(row.matchedCampaignId) ?? { netAmount: 0, executionAmount: 0, rowCount: 0 }
      map.set(row.matchedCampaignId, {
        netAmount: prev.netAmount + (row.netAmount ?? 0),
        executionAmount: prev.executionAmount + (row.executionAmount ?? 0),
        rowCount: prev.rowCount + 1,
      })
    }
    setComputedSpendMap(map)
  }, [campaigns, rawRows])

  const filtered = useMemo(() => campaigns.filter(c => {
    if (filterStatus !== "전체" && c.status !== filterStatus) return false
    if (filterMonth && c.settlementMonth !== filterMonth) return false
    if (filterOperator && c.managerId !== filterOperator) return false
    if (filterMedia && !c.mediaBudgets.some(mb => mb.media === filterMedia)) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const ag = agencies.find(a => a.id === c.agencyId)?.name ?? ""
      const adv = advertisers.find(a => a.id === c.advertiserId)?.name ?? ""
      if (!adv.toLowerCase().includes(q) && !c.campaignName.toLowerCase().includes(q) && !ag.toLowerCase().includes(q)) return false
    }
    return true
  }), [campaigns, filterStatus, filterMonth, filterOperator, filterMedia, searchQuery, agencies, advertisers])

  const summary = useMemo(() => {
    let totalBudget = 0, totalSettingCost = 0
    filtered.forEach(c => { const t = getCampaignTotals(c); totalBudget += t.totalBudget; totalSettingCost += t.totalSettingCost })
    return { total: filtered.length, active: filtered.filter(c => c.status === "집행 중").length, ended: filtered.filter(c => c.status === "종료").length, totalBudget, totalSettingCost }
  }, [filtered])

  const laggingCampaigns = useMemo(() => filtered.filter(c => {
    if (c.status !== "집행 중") return false
    return getCampaignProgress(c.startDate, c.endDate) - getCampaignTotals(c).spendRate >= 15
  }), [filtered])

  const isFiltered = !!(filterStatus !== "전체" || filterMonth || filterOperator || filterMedia || searchQuery)

  function confirm(cfg: ConfirmCfg) { setConfirmCfg(cfg) }
  function showToast(message: string, type: "success" | "error" = "success") { setToast({ message, type }); setTimeout(() => setToast(null), 3000) }
  function handleStatusToggle(id: string) {
    const c = campaigns.find(x => x.id === id)!
    const next = c.status === "집행 중" ? "종료" : "집행 중"
    confirm({ title: "상태 변경", message: `"${c.campaignName}"\n캠페인을 [${next}](으)로 변경하시겠습니까?`, onConfirm: () => { saveCampaigns(campaigns.map(x => x.id === id ? { ...x, status: next } : x)); setConfirmCfg(null) } })
  }
  function handleDelete(id: string) {
    const c = campaigns.find(x => x.id === id)!
    const advName = advertisers.find(a => a.id === c.advertiserId)?.name ?? "-"
    confirm({ title: "캠페인 삭제", message: `"${advName} - ${c.campaignName}"\n을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`, onConfirm: () => { saveCampaigns(campaigns.filter(x => x.id !== id)); setConfirmCfg(null) } })
  }
  function handleDeleteOp(id: string) {
    if (campaigns.some(c => c.managerId === id)) { alert("담당 캠페인이 있어 삭제할 수 없습니다."); return }
    confirm({ title: "운영자 삭제", message: "해당 운영자를 삭제하시겠습니까?", onConfirm: () => { saveOperators(operators.filter(o => o.id !== id)); setConfirmCfg(null) } })
  }
  function handleDeleteAg(id: string) {
    if (advertisers.some(a => a.agencyId === id)) { alert("소속 광고주가 있어 삭제할 수 없습니다."); return }
    if (campaigns.some(c => c.agencyId === id)) { alert("담당 캠페인이 있어 삭제할 수 없습니다."); return }
    confirm({ title: "대행사 삭제", message: "해당 대행사를 삭제하시겠습니까?", onConfirm: () => { saveAgencies(agencies.filter(a => a.id !== id)); setConfirmCfg(null) } })
  }
  function handleDeleteAdv(id: string) {
    if (campaigns.some(c => c.advertiserId === id)) { alert("담당 캠페인이 있어 삭제할 수 없습니다."); return }
    confirm({ title: "광고주 삭제", message: "해당 광고주를 삭제하시겠습니까?", onConfirm: () => { saveAdvertisers(advertisers.filter(a => a.id !== id)); setConfirmCfg(null) } })
  }
  async function handleAgencyExcelUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer)
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json<any>(sheet)
      const newAgencies = data.map((row: any) => ({ id: Date.now().toString() + Math.random(), name: row.대행사명 ?? "", contactName: row.담당자명 ?? "", email: row.이메일 ?? "", phone: row.전화번호 ?? "", corporateName: row.법인명, businessNumber: row.사업자등록번호, representative: row.대표자명, address: row.주소, businessType: row.업태, businessItem: row.종목, defaultMarkupRate: row['기본수수료율(%)'] ? parseFloat(row['기본수수료율(%)']) : undefined, createdAt: new Date().toISOString() } as Agency))
      saveAgencies([...agencies, ...newAgencies])
      showToast(`${newAgencies.length}개 대행사가 추가됐습니다.`)
      if (fileInputRef.current) fileInputRef.current.value = ""
    } catch (err) { showToast("Excel 파일 처리 중 오류가 발생했습니다.", "error"); console.error(err) }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-gray-900">집행 관리</h1>
            <p className="text-xs text-gray-400 mt-0.5">캠페인 · 대행사 · 광고주 · 운영자 관리</p>
          </div>
          <div className="flex gap-2">
            {statusTab === "campaigns" && <button onClick={() => { setEditTarget(null); setModalOpen(true) }} className={btnPrimary}>+ 캠페인 추가</button>}
            {statusTab === "operators" && <button onClick={() => { setEditOp(null); setOpModalOpen(true) }} className={btnPrimary}>+ 운영자 추가</button>}
            {statusTab === "agencies" && agencySubTab === "list" && (
              <div className="flex gap-2">
                <button onClick={() => { setEditAg(null); setAgencySubTab("edit") }} className={btnPrimary}>+ 새 대행사</button>
                <button onClick={() => fileInputRef.current?.click()} className={btnPrimary}>📊 Excel 일괄 등록</button>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleAgencyExcelUpload} className="hidden" />
              </div>
            )}
            {statusTab === "advertisers" && <button onClick={() => { setEditAdv(null); setAdvModalOpen(true) }} className={btnPrimary}>+ 광고주 추가</button>}
          </div>
        </div>
        <div className="mt-3 flex gap-1">
          {([["campaigns", "캠페인 관리"], ["agencies", "대행사 관리"], ["advertisers", "광고주 관리"], ["operators", "운영자 관리"]] as [StatusTab, string][]).map(([tab, label]) => (
            <button key={tab} onClick={() => { setStatusTab(tab); if (tab === "agencies") setAgencySubTab("list") }} className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${statusTab === tab ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-100"}`}>{label}</button>
          ))}
        </div>
      </header>

      {toast && <div className={`fixed top-4 right-4 px-4 py-2 rounded-lg text-sm font-medium text-white ${toast.type === "success" ? "bg-green-500" : "bg-red-500"}`}>{toast.message}</div>}

      <main className="p-6 space-y-4">
        {statusTab === "campaigns" && (
          <>
            {isFiltered && <p className="text-xs text-blue-600 font-medium">필터 적용 중 · {summary.total}개 캠페인 기준</p>}
            <CampaignSummaryBanner summary={summary} laggingCampaigns={laggingCampaigns} alertOpen={alertOpen} setAlertOpen={setAlertOpen} />
            <CampaignFilterBar filterStatus={filterStatus} setFilterStatus={setFilterStatus} filterMonth={filterMonth} setFilterMonth={setFilterMonth} filterOperator={filterOperator} setFilterOperator={setFilterOperator} filterMedia={filterMedia} setFilterMedia={setFilterMedia} searchQuery={searchQuery} setSearchQuery={setSearchQuery} isFiltered={isFiltered} onReset={() => { setFilterStatus("전체" as FilterStatus); setFilterMonth(""); setFilterOperator(""); setFilterMedia(""); setSearchQuery("") }} campaigns={campaigns} operators={operators} agencies={agencies} advertisers={advertisers} />
            <CampaignTableSection filtered={filtered} agencies={agencies} advertisers={advertisers} operators={operators} computedSpendMap={computedSpendMap} onEdit={(c) => { setEditTarget(c); setModalOpen(true) }} onDelete={handleDelete} onStatusToggle={handleStatusToggle} selectedDetailId={selectedDetailId} setSelectedDetailId={setSelectedDetailId} />
          </>
        )}
        {statusTab === "agencies" && (
          <>
            {agencySubTab === "list" && <AgencyListTab agencies={agencies} onEdit={(ag) => { setEditAg(ag); setAgencySubTab("edit") }} onDelete={handleDeleteAg} />}
            {agencySubTab === "edit" && <AgencyEditTab agency={editAg} agencies={agencies} onSave={(ag) => { if (editAg) { saveAgencies(agencies.map(a => a.id === ag.id ? ag : a)) } else { saveAgencies([...agencies, ag]) } setAgencySubTab("list"); showToast(editAg ? "대행사가 수정되었습니다." : "대행사가 추가되었습니다.") }} onCancel={() => setAgencySubTab("list")} />}
          </>
        )}
        {statusTab === "advertisers" && <AdvertiserListTab advertisers={advertisers} agencies={agencies} campaigns={campaigns} onEdit={(adv) => { setEditAdv(adv); setAdvModalOpen(true) }} onDelete={handleDeleteAdv} />}
        {statusTab === "operators" && <OperatorListTab operators={operators} campaigns={campaigns} onEdit={(op) => { setEditOp(op); setOpModalOpen(true) }} onDelete={handleDeleteOp} />}
      </main>

      {modalOpen && <CampaignModal initial={editTarget} operators={operators} agencies={agencies} advertisers={advertisers} takenCsvNames={takenCsvNames} onSave={(c) => { if (editTarget) saveCampaigns(campaigns.map(x => x.id === c.id ? c : x)); else saveCampaigns([...campaigns, { ...c, id: Date.now().toString() }]); setModalOpen(false) }} onClose={() => setModalOpen(false)} />}
      {opModalOpen && <OperatorModal open={opModalOpen} onClose={() => setOpModalOpen(false)} editOp={editOp} operators={operators} onSave={(op) => { if (editOp) saveOperators(operators.map(o => o.id === op.id ? op : o)); else saveOperators([...operators, { ...op, id: Date.now().toString() }]); setOpModalOpen(false) }} />}
      {advModalOpen && <AdvertiserModal open={advModalOpen} onClose={() => setAdvModalOpen(false)} editAdv={editAdv} agencies={agencies} onSave={(adv) => { if (editAdv) saveAdvertisers(advertisers.map(a => a.id === adv.id ? adv : a)); else saveAdvertisers([...advertisers, { ...adv, id: Date.now().toString() }]); setAdvModalOpen(false) }} />}
      {agModalOpen && <AgencyFormModal open={agModalOpen} onClose={() => setAgModalOpen(false)} editAg={editAg} onSave={(ag) => { if (editAg) saveAgencies(agencies.map(a => a.id === ag.id ? ag : a)); else saveAgencies([...agencies, { ...ag, id: Date.now().toString() }]); setAgModalOpen(false) }} />}
      {confirmCfg && <ConfirmModal title={confirmCfg.title} message={confirmCfg.message} onConfirm={confirmCfg.onConfirm} onCancel={() => setConfirmCfg(null)} />}
      {selectedDetailCampaign && (<CampaignDetailPanel campaign={selectedDetailCampaign} operators={operators} agencies={agencies} advertisers={advertisers} onClose={() => setSelectedDetailId(null)} onEdit={(c) => { setEditTarget(c); setModalOpen(true); setSelectedDetailId(null) }} />)}
    </div>
  )
}