"use client"
import { CampaignModal } from "@/app/campaign/ct-plus/components/ct-plus/CampaignModal"
import { CampaignDetailPanel } from "@/app/campaign/ct-plus/components/ct-plus/CampaignDetailPanel"
import { AgencyEditTab } from "@/app/campaign/ct-plus/components/ct-plus/AgencyEditTab"
import { ConfirmModal, SCard, MF, fmt, spendRateStyle, getDailySuggestion, btnPrimary, selectCls, inputCls } from "@/app/campaign/ct-plus/components/ct-plus/statusUtils"
import type { FilterStatus, ConfirmCfg } from "@/app/campaign/ct-plus/components/ct-plus/statusUtils"


import React, { useState, useMemo, useRef, useEffect } from "react"
import dynamic from "next/dynamic"
import * as XLSX from 'xlsx'

// 탭으로 병합된 페이지들 (코드 스플리팅으로 로드)
const CTPlusOverviewTab  = dynamic(() => import("../overview/page"),  { ssr: false, loading: () => <div className="p-8 text-center text-sm text-gray-500">로딩 중…</div> })

type OuterTab = "overview" | "status"
type StatusTab = "campaigns" | "agencies" | "advertisers" | "operators"
type AgencySubTab = "list" | "edit"

import {
  Campaign, Operator, Agency, Advertiser, AVAILABLE_MEDIA,
  getCampaignTotals, getCampaignProgress, getDday
} from "@/lib/campaignTypes"
import { useMasterData } from "@/lib/hooks/useMasterData"
import { useReports } from "@/lib/hooks/useReports"
import { loadAllRawRows } from "@/lib/rawDataStore"
import { recomputeAllCampaigns } from "@/lib/markupService"



// ════════════════════════════════════════════════════════
// 외부 탭 컨테이너
export default function CampaignStatusOuter() {
  const [outerTab, setOuterTab] = useState<OuterTab>("status")

  const outerTabs: { key: OuterTab; label: string; emoji: string }[] = [
    { key: "overview", label: "CT+ 현황",   emoji: "📊" },
    { key: "status",   label: "집행 관리",  emoji: "📋" },
  ]

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* 외부 탭 바 */}
      <div className="border-b border-gray-200 bg-white px-6 pt-3 flex gap-1">
        {outerTabs.map(({ key, label, emoji }) => (
          <button
            key={key}
            onClick={() => setOuterTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
              outerTab === key
                ? "border-orange-500 text-orange-700 bg-orange-50"
                : "border-transparent text-gray-600 hover:text-gray-800 hover:bg-gray-50"
            }`}
          >
            <span>{emoji}</span>{label}
          </button>
        ))}
      </div>

      {/* 탭 패널 */}
      <div className="flex-1">
        {outerTab === "overview" && <CTPlusOverviewTab />}
        {outerTab === "status"   && <CampaignStatusPage />}
      </div>
    </div>
  )
}

// ── 집행 관리 페이지 (내부 4개 탭) ────────────
function CampaignStatusPage() {
  const {
    campaigns, operators, agencies, advertisers,
    saveCampaigns, saveOperators, saveAgencies, saveAdvertisers
  } = useMasterData()
  const { reports } = useReports()

  const [statusTab,      setStatusTab]      = useState<StatusTab>("campaigns")
  const [filterStatus,   setFilterStatus]   = useState<FilterStatus>("전체")
  const [filterMonth,    setFilterMonth]    = useState("")
  const [filterOperator, setFilterOperator] = useState("")
  const [filterMedia,    setFilterMedia]    = useState("")
  const [searchQuery,    setSearchQuery]    = useState("")
  const [modalOpen,      setModalOpen]      = useState(false)
  const [editTarget,     setEditTarget]     = useState<Campaign | null>(null)
  const [opModalOpen,    setOpModalOpen]    = useState(false)
  const [editOp,         setEditOp]         = useState<Operator | null>(null)
  const [agencySubTab,   setAgencySubTab]   = useState<AgencySubTab>("list")
  const [editAg,         setEditAg]         = useState<Agency | null>(null)
  const [agModalOpen,    setAgModalOpen]    = useState(false)
  const [advModalOpen,   setAdvModalOpen]   = useState(false)
  const [editAdv,        setEditAdv]        = useState<Advertiser | null>(null)
  const [confirmCfg,     setConfirmCfg]     = useState<ConfirmCfg | null>(null)
  const [alertOpen,      setAlertOpen]      = useState(true)
  const [toast,          setToast]          = useState<{ message: string; type: "success" | "error" } | null>(null)
  const fileInputRef     = useRef<HTMLInputElement>(null)

  const [selectedDetailId, setSelectedDetailId] = useState<string | null>(null)
  const selectedDetailCampaign = useMemo(
    () => campaigns.find(c => c.id === selectedDetailId) ?? null,
    [campaigns, selectedDetailId]
  )

  useEffect(() => {
    if (campaigns.length === 0) return
    const rawRows = loadAllRawRows()
    if (rawRows.length === 0) return
    recomputeAllCampaigns(rawRows, campaigns)
  }, [campaigns])

  const filtered = useMemo(() => campaigns.filter(c => {
    if (filterStatus !== "전체" && c.status !== filterStatus) return false
    if (filterMonth    && c.settlementMonth !== filterMonth) return false
    if (filterOperator && c.managerId !== filterOperator) return false
    if (filterMedia    && !c.mediaBudgets.some(mb => mb.media === filterMedia)) return false
    if (searchQuery) {
      const q   = searchQuery.toLowerCase()
      const ag  = agencies.find(a => a.id === c.agencyId)?.name ?? ""
      const adv = advertisers.find(a => a.id === c.advertiserId)?.name ?? ""
      if (!adv.toLowerCase().includes(q) && !c.campaignName.toLowerCase().includes(q) && !ag.toLowerCase().includes(q)) return false
    }
    return true
  }), [campaigns, filterStatus, filterMonth, filterOperator, filterMedia, searchQuery, agencies, advertisers])

  const summary = useMemo(() => {
    let totalBudget = 0, totalSettingCost = 0
    filtered.forEach(c => { const t = getCampaignTotals(c); totalBudget += t.totalBudget; totalSettingCost += t.totalSettingCost })
    return { total: filtered.length, active: filtered.filter(c => c.status === "집행 중").length,
             ended: filtered.filter(c => c.status === "종료").length, totalBudget, totalSettingCost }
  }, [filtered])

  const laggingCampaigns = useMemo(() => filtered.filter(c => {
    if (c.status !== "집행 중") return false
    return getCampaignProgress(c.startDate, c.endDate) - getCampaignTotals(c).spendRate >= 15
  }), [filtered])

  // ── 액션 ──────────────────────────────────────────────
  function confirm(cfg: ConfirmCfg) { setConfirmCfg(cfg) }
  function showToast(message: string, type: "success" | "error" = "success") {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  function handleStatusToggle(id: string) {
    const c = campaigns.find(x => x.id === id)!
    const next = c.status === "집행 중" ? "종료" : "집행 중"
    confirm({ title: "상태 변경",
      message: `"${c.campaignName}"\n캠페인을 [${next}](으)로 변경하시겠습니까?`,
      onConfirm: () => { saveCampaigns(campaigns.map(x => x.id === id ? { ...x, status: next } : x)); setConfirmCfg(null) } })
  }
  function handleDelete(id: string) {
    const c = campaigns.find(x => x.id === id)!
    confirm({ title: "캠페인 삭제",
      message: `"${advName(c.advertiserId)} - ${c.campaignName}"\n을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`,
      onConfirm: () => { saveCampaigns(campaigns.filter(x => x.id !== id)); setConfirmCfg(null) } })
  }
  function handleDeleteOp(id: string) {
    if (campaigns.some(c => c.managerId === id)) { alert("담당 캠페인이 있어 삭제할 수 없습니다."); return }
    confirm({ title: "운영자 삭제", message: "해당 운영자를 삭제하시겠습니까?",
      onConfirm: () => { saveOperators(operators.filter(o => o.id !== id)); setConfirmCfg(null) } })
  }
  function handleDeleteAg(id: string) {
    if (advertisers.some(a => a.agencyId === id)) { alert("소속 광고주가 있어 삭제할 수 없습니다."); return }
    if (campaigns.some(c => c.agencyId === id))   { alert("담당 캠페인이 있어 삭제할 수 없습니다."); return }
    confirm({ title: "대행사 삭제", message: "해당 대행사를 삭제하시겠습니까?",
      onConfirm: () => { saveAgencies(agencies.filter(a => a.id !== id)); setConfirmCfg(null) } })
  }
  function handleDeleteAdv(id: string) {
    if (campaigns.some(c => c.advertiserId === id)) { alert("담당 캠페인이 있어 삭제할 수 없습니다."); return }
    confirm({ title: "광고주 삭제", message: "해당 광고주를 삭제하시겠습니까?",
      onConfirm: () => { saveAdvertisers(advertisers.filter(a => a.id !== id)); setConfirmCfg(null) } })
  }

  // 대행사 일괄 등록 (Excel)
  async function handleAgencyExcelUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer)
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json<{
        대행사명: string; 담당자명: string; 이메일: string; 전화번호: string
        법인명?: string; 사업자등록번호?: string; 대표자명?: string; 주소?: string
        업태?: string; 종목?: string; '기본수수료율(%)'?: string
      }>(sheet)

      const newAgencies = data.map(row => ({
        id: Date.now().toString() + Math.random(),
        name: row.대행사명 ?? "",
        contactName: row.담당자명 ?? "",
        email: row.이메일 ?? "",
        phone: row.전화번호 ?? "",
        corporateName: row.법인명,
        businessNumber: row.사업자등록번호,
        representative: row.대표자명,
        address: row.주소,
        businessType: row.업태,
        businessItem: row.종목,
        defaultMarkupRate: row['기본수수료율(%)'] ? parseFloat(row['기본수수료율(%)']) : undefined,
        createdAt: new Date().toISOString()
      } as Agency))

      saveAgencies([...agencies, ...newAgencies])
      showToast(`${newAgencies.length}개 대행사가 추가됐습니다.`)
      if (fileInputRef.current) fileInputRef.current.value = ""
    } catch (err) {
      showToast("Excel 파일 처리 중 오류가 발생했습니다.", "error")
      console.error(err)
    }
  }

  function opName(id: string)  { return operators.find(o => o.id === id)?.name  ?? "-" }
  function agName(id: string)  { return agencies.find(a => a.id === id)?.name   ?? "-" }
  function advName(id: string) { return advertisers.find(a => a.id === id)?.name ?? "-" }

  const settlementMonths = useMemo(() =>
    Array.from(new Set(campaigns.map(c => c.settlementMonth).filter(Boolean))).sort().reverse()
  , [campaigns])

  const isFiltered = filterStatus !== "전체" || filterMonth || filterOperator || filterMedia || searchQuery

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-gray-900">집행 관리</h1>
            <p className="text-xs text-gray-400 mt-0.5">캠페인 · 대행사 · 광고주 · 운영자 관리</p>
          </div>
          <div className="flex gap-2">
            {statusTab === "campaigns"   && <button onClick={() => { setEditTarget(null); setModalOpen(true) }}  className={btnPrimary}>+ 캠페인 추가</button>}
            {statusTab === "operators"   && <button onClick={() => { setEditOp(null);     setOpModalOpen(true) }} className={btnPrimary}>+ 운영자 추가</button>}
            {statusTab === "agencies"    && agencySubTab === "list" && (
              <div className="flex gap-2">
                <button onClick={() => { setEditAg(null); setAgencySubTab("edit") }} className={btnPrimary}>+ 새 대행사</button>
                <button onClick={() => fileInputRef.current?.click()} className={btnPrimary}>📊 Excel 일괄 등록</button>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleAgencyExcelUpload} className="hidden" />
              </div>
            )}
            {statusTab === "advertisers" && <button onClick={() => { setEditAdv(null);    setAdvModalOpen(true) }} className={btnPrimary}>+ 광고주 추가</button>}
          </div>
        </div>
        <div className="mt-3 flex gap-1">
          {([
            ["campaigns",   "캠페인 관리"],
            ["agencies",    "대행사 관리"],
            ["advertisers", "광고주 관리"],
            ["operators",   "운영자 관리"],
          ] as [StatusTab, string][]).map(([tab, label]) => (
            <button key={tab} onClick={() => { setStatusTab(tab); if (tab === "agencies") setAgencySubTab("list") }}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${statusTab === tab ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-100"}`}>
              {label}
            </button>
          ))}
        </div>
      </header>

      {/* 토스트 알림 */}
      {toast && (
        <div className={`fixed top-4 right-4 px-4 py-2 rounded-lg text-sm font-medium text-white ${toast.type === "success" ? "bg-green-500" : "bg-red-500"}`}>
          {toast.message}
        </div>
      )}

      <main className="p-6 space-y-4">

        {/* ══ 캠페인 관리 ══════════════════════════════ */}
        {statusTab === "campaigns" && (
          <>
            {/* 요약 카드 */}
            <div className="space-y-1.5">
              {isFiltered && <p className="text-xs text-blue-600 font-medium">필터 적용 중 · {summary.total}개 캠페인 기준</p>}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <SCard label="전체 캠페인" value={`${summary.total}개`} />
                <SCard label="집행 중"     value={`${summary.active}개`} color="blue" />
                <SCard label="종료"        value={`${summary.ended}개`}  color="gray" />
                <SCard label="부킹 금액"   value={fmt(summary.totalBudget)} sub="원" />
                <SCard label="세팅 금액"   value={fmt(summary.totalSettingCost)} sub="원" />
              </div>
            </div>

            {/* 집행 속도 지연 알림 */}
            {laggingCampaigns.length > 0 && (
              <div className="rounded-xl border border-yellow-200 bg-yellow-50 overflow-hidden">
                <button onClick={() => setAlertOpen(v => !v)}
                  className="flex w-full items-center justify-between px-4 py-3 hover:bg-yellow-100 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="text-base">⚠️</span>
                    <span className="text-sm font-semibold text-yellow-800">집행 속도 점검 필요 · {laggingCampaigns.length}개 캠페인</span>
                    <span className="text-xs text-yellow-600">진행률 대비 소진율 15%p 이상 지연</span>
                  </div>
                  <svg className={`h-4 w-4 text-yellow-500 transition-transform ${alertOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {alertOpen && (
                  <div className="border-t border-yellow-200 divide-y divide-yellow-100">
                    {laggingCampaigns.map(c => {
                      const progress      = getCampaignProgress(c.startDate, c.endDate)
                      const { spendRate } = getCampaignTotals(c)
                      return (
                        <div key={c.id} className="px-4 py-3 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-sm font-semibold text-yellow-900">{advName(c.advertiserId)}</span>
                              <span className="text-xs text-yellow-700 ml-2">{c.campaignName}</span>
                            </div>
                            <div className="flex items-center gap-3 text-xs">
                              <span className="text-gray-500">담당: <strong>{opName(c.managerId)}</strong></span>
                              <span className="text-blue-600">진행률 <strong>{progress}%</strong></span>
                              <span className={spendRateStyle(spendRate).text}>소진율 <strong>{spendRate}%</strong></span>
                              <span className="rounded-full bg-yellow-200 px-2 py-0.5 font-semibold text-yellow-800">
                                -{(progress - spendRate).toFixed(1)}%p
                              </span>
                            </div>
                          </div>
                          <p className="text-xs text-yellow-700 rounded-lg bg-yellow-100 px-3 py-1.5">{getDailySuggestion(c)}</p>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 필터 */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex gap-1">
                {(["전체", "집행 중", "종료"] as FilterStatus[]).map(s => (
                  <button key={s} onClick={() => setFilterStatus(s)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${filterStatus === s ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                    {s}
                  </button>
                ))}
              </div>
              <div className="h-4 w-px bg-gray-200" />
              <select value={filterMonth}    onChange={e => setFilterMonth(e.target.value)}    className={selectCls}>
                <option value="">정산 월 전체</option>
                {settlementMonths.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <select value={filterOperator} onChange={e => setFilterOperator(e.target.value)} className={selectCls}>
                <option value="">담당자 전체</option>
                {operators.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <select value={filterMedia}    onChange={e => setFilterMedia(e.target.value)}    className={selectCls}>
                <option value="">매체 전체</option>
                {AVAILABLE_MEDIA.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <input type="text" placeholder="캠페인명·광고주·대행사명 검색" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 placeholder-gray-400 hover:border-gray-400 transition-colors flex-1 min-w-40" />
              {isFiltered && <button onClick={() => { setFilterStatus("전체"); setFilterMonth(""); setFilterOperator(""); setFilterMedia(""); setSearchQuery("") }}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium">초기화</button>}
            </div>

            {/* 캠페인 목록 — 테이블 */}
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              {filtered.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-sm text-gray-500">캠페인이 없습니다.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
                        <th className="px-4 py-3 text-left">캠페인명</th>
                        <th className="px-4 py-3 text-left">광고주</th>
                        <th className="px-4 py-3 text-left">대행사</th>
                        <th className="px-4 py-3 text-left">담당자</th>
                        <th className="px-4 py-3 text-left">기간</th>
                        <th className="px-4 py-3 text-center">진행률</th>
                        <th className="px-4 py-3 text-center">소진율</th>
                        <th className="px-4 py-3 text-center">연결</th>
                        <th className="px-4 py-3 text-center">관리</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filtered.map(c => {
                        const totals   = getCampaignTotals(c)
                        const dday     = getDday(c.endDate)
                        const progress = getCampaignProgress(c.startDate, c.endDate)
                        const isLagging = c.status === "집행 중" && (progress - totals.spendRate) >= 15
                        const sc       = spendRateStyle(totals.spendRate)
                        const csvCount = c.csvNames?.length ?? 0

                        return (
                          <tr
                            key={c.id}
                            className={`hover:bg-gray-50 transition-colors cursor-pointer ${isLagging ? "bg-yellow-50/60" : ""} ${selectedDetailId === c.id ? "ring-1 ring-inset ring-blue-200 bg-blue-50/60" : ""}`}
                            onClick={() => setSelectedDetailId(prev => prev === c.id ? null : c.id)}
                          >
                            {/* 캠페인명 + 상태 */}
                            <td className="px-4 py-3 max-w-[200px]">
                              <div className="font-medium text-gray-900 truncate" title={c.campaignName}>{c.campaignName}</div>
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                {c.campaignType && (
                                  <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold bg-purple-100 text-purple-700">
                                    {c.campaignType}
                                  </span>
                                )}
                                <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${c.status === "집행 중" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"}`}>
                                  {c.status}
                                </span>
                                {dday.label && (
                                  <span className={`text-[10px] font-medium ${dday.urgent ? "text-red-600" : dday.expired ? "text-gray-400" : "text-gray-500"}`}>
                                    {dday.label}
                                  </span>
                                )}
                                {isLagging && <span className="text-[10px] font-semibold text-yellow-700">⚠ 지연</span>}
                              </div>
                            </td>
                            {/* 광고주 */}
                            <td className="px-4 py-3 text-xs text-gray-600 max-w-[120px] truncate" title={advName(c.advertiserId)}>
                              {advName(c.advertiserId)}
                            </td>
                            {/* 대행사 */}
                            <td className="px-4 py-3 text-xs text-gray-600 max-w-[120px] truncate" title={agName(c.agencyId)}>
                              {agName(c.agencyId)}
                            </td>
                            {/* 담당자 */}
                            <td className="px-4 py-3 text-xs text-gray-500">{opName(c.managerId)}</td>
                            {/* 기간 */}
                            <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap tabular-nums">
                              <div>{c.startDate.slice(2)}</div>
                              <div>{c.endDate.slice(2)}</div>
                            </td>
                            {/* 진행률 */}
                            <td className="px-4 py-3 text-center">
                              <div className="text-xs font-semibold text-blue-600">{progress}%</div>
                              <div className="mt-1 h-1.5 w-16 mx-auto rounded-full bg-gray-200">
                                <div className="h-full rounded-full bg-blue-400 transition-all" style={{ width: `${Math.min(progress, 100)}%` }} />
                              </div>
                            </td>
                            {/* 소진율 */}
                            <td className="px-4 py-3 text-center">
                              <div className={`text-xs font-semibold ${sc.text}`}>{totals.spendRate}%</div>
                              <div className="mt-1 h-1.5 w-16 mx-auto rounded-full bg-gray-200">
                                <div className={`h-full rounded-full transition-all ${sc.bar}`} style={{ width: `${Math.min(totals.spendRate, 100)}%` }} />
                              </div>
                            </td>
                            {/* 연결 데이터 */}
                            <td className="px-4 py-3 text-center">
                              {csvCount > 0 ? (
                                <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">
                                  DB {csvCount}
                                </span>
                              ) : (
                                <span className="text-[10px] text-gray-400">—</span>
                              )}
                            </td>
                            {/* 관리 버튼 */}
                            <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => { setEditTarget(c); setModalOpen(true) }}
                                  className="rounded-md border border-blue-300 bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-100 transition-colors"
                                >
                                  수정
                                </button>
                                <button
                                  onClick={() => handleStatusToggle(c.id)}
                                  className="rounded-md border border-gray-300 bg-white px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                                >
                                  {c.status === "집행 중" ? "종료" : "재개"}
                                </button>
                                <button
                                  onClick={() => handleDelete(c.id)}
                                  className="rounded-md border border-red-300 bg-red-50 px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-100 transition-colors"
                                >
                                  삭제
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* ══ 대행사 관리 ══════════════════════════════ */}
        {statusTab === "agencies" && (
          <>
            {agencySubTab === "list" && <AgencyListTab agencies={agencies} onEdit={(ag) => { setEditAg(ag); setAgencySubTab("edit") }} onDelete={handleDeleteAg} />}
            {agencySubTab === "edit" && <AgencyEditTab agency={editAg} agencies={agencies} onSave={(ag) => {
              if (editAg) {
                saveAgencies(agencies.map(a => a.id === ag.id ? ag : a))
              } else {
                saveAgencies([...agencies, ag])
              }
              setAgencySubTab("list")
              showToast(editAg ? "대행사가 수정되었습니다." : "대행사가 추가되었습니다.")
            }} onCancel={() => setAgencySubTab("list")} />}
          </>
        )}

        {/* ══ 광고주 관리 ══════════════════════════════ */}
        {statusTab === "advertisers" && (
          <div className="space-y-3">
            {advertisers.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 py-12 text-center">
                <p className="text-sm text-gray-500">광고주가 없습니다.</p>
              </div>
            ) : (
              advertisers.map(adv => {
                const agencyName = agName(adv.agencyId)
                const assigned = campaigns.filter(c => c.advertiserId === adv.id)
                return (
                  <div key={adv.id} className="rounded-lg border border-gray-200 bg-white p-4 hover:border-gray-300 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-gray-900">{adv.name}</h3>
                        <p className="text-xs text-gray-500 mt-0.5">{agencyName} · 캠페인 {assigned.length}개</p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button onClick={() => { setEditAdv(adv); setAdvModalOpen(true) }} className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors">수정</button>
                        <button onClick={() => handleDeleteAdv(adv.id)} className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors">삭제</button>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}

        {/* ══ 운영자 관리 ══════════════════════════════ */}
        {statusTab === "operators" && (
          <div className="space-y-3">
            {operators.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 py-12 text-center">
                <p className="text-sm text-gray-500">운영자가 없습니다.</p>
              </div>
            ) : (
              operators.map(op => {
                const assigned = campaigns.filter(c => c.managerId === op.id)
                return (
                  <div key={op.id} className="rounded-lg border border-gray-200 bg-white p-4 hover:border-gray-300 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className="text-sm font-semibold text-gray-900">{op.name}</h3>
                        <p className="text-xs text-gray-500 mt-0.5">{op.email} · {op.phone} · 캠페인 {assigned.length}개</p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button onClick={() => { setEditOp(op); setOpModalOpen(true) }} className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors">수정</button>
                        <button onClick={() => handleDeleteOp(op.id)} className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors">삭제</button>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}

      </main>

      {/* 모달들 */}
      {modalOpen && <CampaignModal initial={editTarget} operators={operators} agencies={agencies} advertisers={advertisers} reports={reports} onSave={(c) => {
        if (editTarget) {
          saveCampaigns(campaigns.map(x => x.id === c.id ? c : x))
        } else {
          saveCampaigns([...campaigns, { ...c, id: Date.now().toString() }])
        }
        setModalOpen(false)
      }} onClose={() => setModalOpen(false)} />}
      {opModalOpen && <PersonModal title="운영자" initial={editOp} onSave={(op) => {
        if (editOp) {
          saveOperators(operators.map(o => o.id === op.id ? op : o))
        } else {
          saveOperators([...operators, { ...op, id: Date.now().toString() }])
        }
        setOpModalOpen(false)
      }} onClose={() => setOpModalOpen(false)} />}
      {advModalOpen && <AdvertiserModal initial={editAdv} agencies={agencies} onSave={(adv) => {
        if (editAdv) {
          saveAdvertisers(advertisers.map(a => a.id === adv.id ? adv : a))
        } else {
          saveAdvertisers([...advertisers, { ...adv, id: Date.now().toString() }])
        }
        setAdvModalOpen(false)
      }} onClose={() => setAdvModalOpen(false)} />}
      {agModalOpen && <AgencyModal initial={editAg} onSave={(ag) => {
        if (editAg) {
          saveAgencies(agencies.map(a => a.id === ag.id ? ag : a))
        } else {
          saveAgencies([...agencies, { ...ag, id: Date.now().toString() }])
        }
        setAgModalOpen(false)
      }} onClose={() => setAgModalOpen(false)} />}

      {confirmCfg && <ConfirmModal title={confirmCfg.title} message={confirmCfg.message} onConfirm={confirmCfg.onConfirm} onCancel={() => setConfirmCfg(null)} />}

      {selectedDetailCampaign && (
        <CampaignDetailPanel
          campaign={selectedDetailCampaign}
          operators={operators}
          agencies={agencies}
          advertisers={advertisers}
          reports={reports}
          onClose={() => setSelectedDetailId(null)}
          onEdit={(c) => { setEditTarget(c); setModalOpen(true); setSelectedDetailId(null) }}
        />
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════
// 대행사 관리 - 목록 탭
function AgencyListTab({ agencies, onEdit, onDelete }: {
  agencies: Agency[]
  onEdit: (ag: Agency) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="space-y-3">
      {agencies.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 py-12 text-center">
          <p className="text-sm text-gray-500">대행사가 없습니다.</p>
        </div>
      ) : (
        agencies.map(ag => (
          <div key={ag.id} className="rounded-lg border border-gray-200 bg-white p-4 hover:border-gray-300 transition-colors">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-gray-900">{ag.name}</h3>
                <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-gray-600">
                  <div><span className="text-gray-500">담당자:</span> {ag.contactName}</div>
                  <div><span className="text-gray-500">이메일:</span> {ag.email}</div>
                  <div><span className="text-gray-500">전화:</span> {ag.phone}</div>
                  {ag.defaultMarkupRate !== undefined && <div><span className="text-gray-500">기본수수료:</span> {ag.defaultMarkupRate}%</div>}
                </div>
              </div>
              <div className="flex flex-col gap-2 flex-shrink-0">
                {ag.registrationPdfBase64 && ag.registrationPdfName && (
                  <a href={`data:application/pdf;base64,${ag.registrationPdfBase64}`} download={ag.registrationPdfName}
                    className="rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100 transition-colors text-center">
                    📄 PDF
                  </a>
                )}
                <button onClick={() => onEdit(ag)} className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors">수정</button>
                <button onClick={() => onDelete(ag.id)} className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors">삭제</button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}

// 대행사 관리 - 수정/입력 탭
function PersonModal({ title, initial, onSave, onClose }: {
  title: string
  initial: Operator | null
  onSave: (op: Operator) => void
  onClose: () => void
}) {
  const [name, setName] = useState(initial?.name ?? "")
  const [email, setEmail] = useState(initial?.email ?? "")
  const [phone, setPhone] = useState(initial?.phone ?? "")

  function handleSave() {
    if (!name.trim() || !email.trim() || !phone.trim()) {
      alert("모든 항목을 입력하세요.")
      return
    }
    onSave({ id: initial?.id ?? Date.now().toString(), name, email, phone } as Operator)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg max-w-sm w-full p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">{initial ? `${title} 수정` : `${title} 추가`}</h2>
        <MF label={`${title}명 *`}>
          <input type="text" value={name} onChange={e => setName(e.target.value)} className={inputCls} />
        </MF>
        <MF label="이메일 *">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} />
        </MF>
        <MF label="전화 *">
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className={inputCls} />
        </MF>
        <div className="flex gap-2 justify-end pt-4 border-t border-gray-200">
          <button onClick={onClose} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">취소</button>
          <button onClick={handleSave} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors">저장</button>
        </div>
      </div>
    </div>
  )
}
function AdvertiserModal({ initial, agencies, onSave, onClose }: {
  initial: Advertiser | null
  agencies: Agency[]
  onSave: (adv: Advertiser) => void
  onClose: () => void
}) {
  const [name, setName] = useState(initial?.name ?? "")
  const [agencyId, setAgencyId] = useState(initial?.agencyId ?? "")

  function handleSave() {
    if (!name.trim() || !agencyId) {
      alert("모든 항목을 입력하세요.")
      return
    }
    onSave({ id: initial?.id ?? Date.now().toString(), name, agencyId } as Advertiser)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg max-w-sm w-full p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">{initial ? "광고주 수정" : "광고주 추가"}</h2>
        <MF label="광고주명 *">
          <input type="text" value={name} onChange={e => setName(e.target.value)} className={inputCls} />
        </MF>
        <MF label="대행사 *">
          <select value={agencyId} onChange={e => setAgencyId(e.target.value)} className={inputCls}>
            <option value="">선택하세요</option>
            {agencies.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </MF>
        <div className="flex gap-2 justify-end pt-4 border-t border-gray-200">
          <button onClick={onClose} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">취소</button>
          <button onClick={handleSave} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors">저장</button>
        </div>
      </div>
    </div>
  )
}
function AgencyModal({ initial, onSave, onClose }: {
  initial: Agency | null
  onSave: (ag: Agency) => void
  onClose: () => void
}) {
  const [name, setName] = useState(initial?.name ?? "")
  const [contactName, setContactName] = useState(initial?.contactName ?? "")
  const [email, setEmail] = useState(initial?.email ?? "")
  const [phone, setPhone] = useState(initial?.phone ?? "")

  function handleSave() {
    if (!name.trim() || !contactName.trim()) {
      alert("대행사명과 담당자명은 필수입니다.")
      return
    }
    onSave({
      id: initial?.id ?? Date.now().toString(),
      name, contactName, email, phone,
      corporateName: initial?.corporateName,
      businessNumber: initial?.businessNumber,
      representative: initial?.representative,
      address: initial?.address,
      businessType: initial?.businessType,
      businessItem: initial?.businessItem,
      defaultMarkupRate: initial?.defaultMarkupRate,
      registrationPdfBase64: initial?.registrationPdfBase64,
      registrationPdfName: initial?.registrationPdfName,
      createdAt: initial?.createdAt,
      updatedAt: new Date().toISOString()
    } as Agency)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg max-w-sm w-full p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">{initial ? "대행사 수정" : "대행사 추가"}</h2>
        <MF label="대행사명 *">
          <input type="text" value={name} onChange={e => setName(e.target.value)} className={inputCls} />
        </MF>
        <MF label="담당자명 *">
          <input type="text" value={contactName} onChange={e => setContactName(e.target.value)} className={inputCls} />
        </MF>
        <MF label="이메일">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} />
        </MF>
        <MF label="전화">
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className={inputCls} />
        </MF>
        <div className="flex gap-2 justify-end pt-4 border-t border-gray-200">
          <button onClick={onClose} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">취소</button>
          <button onClick={handleSave} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors">저장</button>
        </div>
      </div>
    </div>
  )
}
