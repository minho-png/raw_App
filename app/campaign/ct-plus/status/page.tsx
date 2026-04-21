"use client"

import React, { useState, useMemo, useRef, useEffect } from "react"
import dynamic from "next/dynamic"
import * as XLSX from 'xlsx'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'

// 탭으로 병합된 페이지들 (코드 스플리팅으로 로드)
const CTPlusOverviewTab  = dynamic(() => import("../overview/page"),  { ssr: false, loading: () => <div className="p-8 text-center text-sm text-gray-500">로딩 중…</div> })

type OuterTab = "overview" | "status"
type StatusTab = "campaigns" | "agencies" | "advertisers" | "operators"
type AgencySubTab = "list" | "edit"

import {
  Campaign, Operator, Agency, Advertiser, MediaBudget, TargetingBudget,
  CampaignType, CAMPAIGN_TYPES,
  AVAILABLE_MEDIA,
  DMP_TARGETS, NON_DMP_TARGETS,
  getMediaTotals, getCampaignTotals, getCampaignProgress, getDday,
} from "@/lib/campaignTypes"
import { useMasterData } from "@/lib/hooks/useMasterData"
import { useReports } from "@/lib/hooks/useReports"
import { loadComputedRows } from "@/lib/markupService"
import type { RawRow } from "@/lib/rawDataParser"

// ── 유틸 ─────────────────────────────────────────────────
function fmt(n: number) { return n.toLocaleString("ko-KR") }

function spendRateStyle(rate: number): { text: string; bar: string } {
  if (rate <= 20)  return { text: "text-blue-500",   bar: "bg-blue-400" }
  if (rate <= 40)  return { text: "text-sky-500",    bar: "bg-sky-400" }
  if (rate <= 60)  return { text: "text-green-600",  bar: "bg-green-500" }
  if (rate <= 75)  return { text: "text-yellow-600", bar: "bg-yellow-400" }
  if (rate <= 90)  return { text: "text-orange-500", bar: "bg-orange-400" }
  if (rate <= 100) return { text: "text-red-500",    bar: "bg-red-400" }
  return                   { text: "text-red-700",   bar: "bg-red-600" }
}

function getDailySuggestion(c: Campaign): string {
  const { totalSettingCost, totalSpend } = getCampaignTotals(c)
  const remaining = totalSettingCost - totalSpend
  if (remaining <= 0) return `세팅 금액 100% 초과 소진`
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const end   = new Date(c.endDate); end.setHours(0, 0, 0, 0)
  const days  = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (days <= 0) return `미소진 ${fmt(remaining)}원 (기간 만료)`
  const daily = Math.round(remaining / days)
  return `미소진 ${fmt(remaining)}원 · 남은 ${days}일 기준 일 예산 약 ${fmt(daily)}원으로 조정 필요`
}

function emptyTB(): TargetingBudget { return { budget: 0, spend: 0, agencyFeeRate: 10, targetings: [] } }
function emptyMB(media: string): MediaBudget { return { media, dmp: emptyTB(), nonDmp: emptyTB() } }

type FilterStatus = "전체" | "집행 중" | "종료"
interface ConfirmCfg { title: string; message: string; onConfirm: () => void }

const btnPrimary = "inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
const selectCls = "rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:border-gray-400 transition-colors"
const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"

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
    saveCampaigns, saveOperators, saveAgencies, saveAdvertisers,
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
        createdAt: new Date().toISOString(),
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
            {agencySubTab === "list" && <AgencyListTab agencies={agencies} campaigns={campaigns} onEdit={(ag) => { setEditAg(ag); setAgencySubTab("edit") }} onDelete={handleDeleteAg} />}
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
function AgencyListTab({ agencies, campaigns: _campaigns, onEdit, onDelete }: {
  agencies: Agency[]
  campaigns: Campaign[]
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
function AgencyEditTab({ agency, agencies: _agencies, onSave, onCancel }: {
  agency: Agency | null
  agencies: Agency[]
  onSave: (ag: Agency) => void
  onCancel: () => void
}) {
  const [name,                setName]                = useState(agency?.name ?? "")
  const [contactName,         setContactName]         = useState(agency?.contactName ?? "")
  const [email,               setEmail]               = useState(agency?.email ?? "")
  const [phone,               setPhone]               = useState(agency?.phone ?? "")
  const [corporateName,       setCorporateName]       = useState(agency?.corporateName ?? "")
  const [businessNumber,      setBusinessNumber]      = useState(agency?.businessNumber ?? "")
  const [representative,      setRepresentative]      = useState(agency?.representative ?? "")
  const [address,             setAddress]             = useState(agency?.address ?? "")
  const [businessType,        setBusinessType]        = useState(agency?.businessType ?? "")
  const [businessItem,        setBusinessItem]        = useState(agency?.businessItem ?? "")
  const [defaultMarkupRate,   setDefaultMarkupRate]   = useState(agency?.defaultMarkupRate?.toString() ?? "")
  const [pdfFile,             setPdfFile]             = useState<File | null>(null)
  const [uploading,           setUploading]           = useState(false)
  const [analyzing,           setAnalyzing]           = useState(false)
  const [analyzeToast,        setAnalyzeToast]        = useState<string | null>(null)

  async function analyzePdf(file: File) {
    setAnalyzing(true)
    setAnalyzeToast(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/v1/agencies/analyze-pdf', { method: 'POST', body: formData })
      if (!res.ok) throw new Error('분석 실패')
      const { fields } = await res.json()
      if (fields) {
        if (fields.corporateName) setCorporateName(fields.corporateName)
        if (fields.businessNumber) setBusinessNumber(fields.businessNumber)
        if (fields.representative) setRepresentative(fields.representative)
        if (fields.address) setAddress(fields.address)
        if (fields.businessType) setBusinessType(fields.businessType)
        if (fields.businessItem) setBusinessItem(fields.businessItem)
        setAnalyzeToast('자동 분석 완료 — 내용을 확인하고 저장하세요')
      } else {
        setAnalyzeToast('추출된 필드가 없습니다. 직접 입력해주세요.')
      }
    } catch (err) {
      console.error(err)
      setAnalyzeToast('분석 중 오류가 발생했습니다')
    } finally {
      setAnalyzing(false)
      setTimeout(() => setAnalyzeToast(null), 5000)
    }
  }

  function handleAnalyzePdf() { if (pdfFile) analyzePdf(pdfFile) }

  function handleSave() {
    if (!name.trim() || !contactName.trim()) {
      alert("대행사명과 담당자명은 필수입니다.")
      return
    }
    const saved: Agency = {
      id: agency?.id ?? Date.now().toString(),
      name,
      contactName,
      email,
      phone,
      corporateName: corporateName || undefined,
      businessNumber: businessNumber || undefined,
      representative: representative || undefined,
      address: address || undefined,
      businessType: businessType || undefined,
      businessItem: businessItem || undefined,
      defaultMarkupRate: defaultMarkupRate ? parseFloat(defaultMarkupRate) : undefined,
      registrationPdfBase64: agency?.registrationPdfBase64,
      registrationPdfName: agency?.registrationPdfName,
      createdAt: agency?.createdAt,
      updatedAt: new Date().toISOString(),
    }

    if (pdfFile && agency?.id) {
      // 기존 대행사: PDF 업로드 후 저장
      handlePdfUpload(saved)
    } else {
      onSave(saved)
    }
  }

  async function handlePdfUpload(ag: Agency) {
    if (!pdfFile || !ag.id) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", pdfFile)
      formData.append("agencyId", ag.id)
      const res = await fetch("/api/v1/agencies/upload-pdf", { method: "POST", body: formData })
      if (!res.ok) throw new Error("PDF 업로드 실패")
      const { pdfBase64, pdfName } = await res.json()
      onSave({ ...ag, registrationPdfBase64: pdfBase64, registrationPdfName: pdfName })
    } catch (err) {
      alert("PDF 업로드 중 오류가 발생했습니다.")
      console.error(err)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{agency ? "대행사 정보 수정" : "새 대행사 추가"}</h2>
        </div>

        {/* 기본 정보 */}
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-4">기본 정보</h3>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <MF label="대행사명 *">
                <input type="text" value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder="ex) OO 에이전시" />
              </MF>
              <MF label="담당자명 *">
                <input type="text" value={contactName} onChange={e => setContactName(e.target.value)} className={inputCls} placeholder="담당자 이름" />
              </MF>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <MF label="이메일">
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} placeholder="email@example.com" />
              </MF>
              <MF label="전화번호">
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className={inputCls} placeholder="010-0000-0000" />
              </MF>
            </div>
          </div>
        </section>

        {/* 세금계산서 정보 */}
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-4">세금계산서 정보</h3>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <MF label="법인명">
                <input type="text" value={corporateName} onChange={e => setCorporateName(e.target.value)} className={inputCls} />
              </MF>
              <MF label="사업자등록번호">
                <input type="text" value={businessNumber} onChange={e => setBusinessNumber(e.target.value)} className={inputCls} placeholder="000-00-00000" />
              </MF>
            </div>
            <MF label="대표자명">
              <input type="text" value={representative} onChange={e => setRepresentative(e.target.value)} className={inputCls} />
            </MF>
            <MF label="주소">
              <input type="text" value={address} onChange={e => setAddress(e.target.value)} className={inputCls} />
            </MF>
            <div className="grid grid-cols-2 gap-4">
              <MF label="업태">
                <input type="text" value={businessType} onChange={e => setBusinessType(e.target.value)} className={inputCls} />
              </MF>
              <MF label="종목">
                <input type="text" value={businessItem} onChange={e => setBusinessItem(e.target.value)} className={inputCls} />
              </MF>
            </div>
          </div>
        </section>

        {/* 정산 정책 */}
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-4">정산 정책</h3>
          <div className="space-y-3">
            <MF label="기본 대행수수료율 (%)">
              <input type="number" value={defaultMarkupRate} onChange={e => setDefaultMarkupRate(e.target.value)} className={inputCls} placeholder="10" min="0" step="0.1" />
            </MF>
          </div>
        </section>

        {/* 사업자등록증 PDF */}
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-4">사업자등록증</h3>
          <div className="space-y-3">
            {agency?.registrationPdfBase64 && agency?.registrationPdfName && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                <p className="text-sm text-green-700">
                  <span className="font-medium">현재 파일:</span> {agency.registrationPdfName}
                </p>
                <a href={`data:application/pdf;base64,${agency.registrationPdfBase64}`} download={agency.registrationPdfName}
                  className="text-xs text-green-600 hover:text-green-700 mt-1 block">
                  다운로드
                </a>
              </div>
            )}
            <MF label="PDF 파일">
              <input type="file" accept=".pdf" onChange={e => {
                const file = e.target.files?.[0] ?? null
                setPdfFile(file)
                if (file) analyzePdf(file)  // 파일 선택 즉시 자동 분석
              }} className={inputCls} />
            </MF>
            {pdfFile && (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleAnalyzePdf}
                  disabled={analyzing}
                  className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {analyzing ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      분석 중...
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.347.347a3.5 3.5 0 00-1.043 2.31v.133a1 1 0 01-1 1H9.92a1 1 0 01-1-1v-.133c0-.895-.356-1.754-.988-2.386l-.347-.347z" />
                      </svg>
                      PDF 자동 분석
                    </>
                  )}
                </button>
                {analyzeToast && (
                  <span className={`text-sm font-medium ${analyzeToast.includes('오류') ? 'text-red-600' : 'text-purple-700'}`}>
                    {analyzeToast}
                  </span>
                )}
              </div>
            )}
          </div>
        </section>

        {/* 액션 */}
        <div className="flex gap-2 justify-end pt-4 border-t border-gray-200">
          <button onClick={onCancel} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">취소</button>
          <button onClick={handleSave} disabled={uploading} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:bg-gray-400">{uploading ? "업로드 중..." : "저장"}</button>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════
// 기타 모달/컴포넌트

function ConfirmModal({ title, message, onConfirm, onCancel }: {
  title: string; message: string; onConfirm: () => void; onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg max-w-sm mx-4 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-2">{title}</h2>
        <p className="text-sm text-gray-600 mb-6 whitespace-pre-wrap">{message}</p>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">취소</button>
          <button onClick={onConfirm} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors">확인</button>
        </div>
      </div>
    </div>
  )
}

function CampaignModal({ initial, operators, agencies, advertisers, reports, onSave, onClose }: {
  initial: Campaign | null
  operators: Operator[]
  agencies: Agency[]
  advertisers: Advertiser[]
  reports: import("@/lib/hooks/useReports").SavedReport[]
  onSave: (c: Campaign) => void
  onClose: () => void
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

  // 각 캠페인명 → 연관 매체/레이블 메타 계산
  const reportNameMeta = useMemo(() => {
    const meta = new Map<string, { media: Set<string>; labels: string[] }>()
    const addName = (name: string, media: string[], label: string) => {
      if (!meta.has(name)) meta.set(name, { media: new Set(), labels: [] })
      const m = meta.get(name)!
      media.forEach(t => m.media.add(t))
      if (label && !m.labels.includes(label)) m.labels.push(label)
    }
    for (const r of reports) {
      const label = r.label ?? ''
      const media = r.mediaTypes ?? []
      if (r.campaignName) addName(r.campaignName, media, label)
      // detectedCampaignNames (chunked 리포트도 포함)
      r.detectedCampaignNames?.forEach(n => addName(n, media, label))
      // row-level (non-chunked)
      for (const rows of Object.values(r.rowsByMedia ?? {})) {
        rows?.forEach((row: { campaignName?: string }) => {
          if (row.campaignName) addName(row.campaignName, media, label)
        })
      }
    }
    return meta
  }, [reports])

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

  function updateTB(media: string, kind: "dmp" | "nonDmp", field: keyof TargetingBudget, value: string | number | string[]) {
    setMediaBudgets(mediaBudgets.map(mb => {
      if (mb.media !== media) return mb
      const updated = { ...mb, [kind]: { ...mb[kind] } }
      const tb = updated[kind] as unknown as Record<string, unknown>
      if (field === "budget" || field === "spend" || field === "agencyFeeRate") {
        tb[field] = typeof value === "string" ? parseFloat(value) || 0 : value
      } else {
        tb[field] = value
      }
      return updated
    }))
  }

  function handleSave() {
    if (!campaignName.trim() || !agencyId || !advertiserId || !managerId || !startDate || !endDate || !settlementMonth) {
      alert("필수 항목을 입력하세요.")
      return
    }
    onSave({
      id: initial?.id ?? Date.now().toString(),
      campaignName,
      campaignType: campaignType || undefined,
      agencyId, advertiserId, managerId, startDate, endDate, settlementMonth, status, mediaBudgets, memo,
      csvNames,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
    } as Campaign)
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
          <div key={mb.media} className="rounded-lg border border-gray-200 p-3 space-y-2">
            <h3 className="text-sm font-semibold text-gray-900">{mb.media}</h3>
            <div className="grid grid-cols-2 gap-2">
              <MF label="DMP 예산">
                <input type="number" value={mb.dmp.budget} onChange={e => updateTB(mb.media, "dmp", "budget", e.target.value)} className={inputCls} />
              </MF>
              <MF label="DMP 집행">
                <input type="number" value={mb.dmp.spend} onChange={e => updateTB(mb.media, "dmp", "spend", e.target.value)} className={inputCls} />
              </MF>
              <MF label="비DMP 예산">
                <input type="number" value={mb.nonDmp.budget} onChange={e => updateTB(mb.media, "nonDmp", "budget", e.target.value)} className={inputCls} />
              </MF>
              <MF label="비DMP 집행">
                <input type="number" value={mb.nonDmp.spend} onChange={e => updateTB(mb.media, "nonDmp", "spend", e.target.value)} className={inputCls} />
              </MF>
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
                  return (
                    <label key={name} className={`flex items-start gap-2 rounded-md px-2 py-1.5 cursor-pointer transition-colors ${checked ? "bg-blue-50" : "hover:bg-gray-50"}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={e => {
                          if (e.target.checked) setCsvNames(prev => [...prev, name])
                          else setCsvNames(prev => prev.filter(n => n !== name))
                        }}
                        className="rounded mt-0.5 flex-shrink-0"
                      />
                      <div className="min-w-0">
                        <span className={`text-xs block truncate ${checked ? "text-blue-700 font-medium" : "text-gray-700"}`}>{name}</span>
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

        <div className="flex gap-2 justify-end pt-4 border-t border-gray-200">
          <button onClick={onClose} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">취소</button>
          <button onClick={handleSave} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors">저장</button>
        </div>
      </div>
    </div>
  )
}

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
      updatedAt: new Date().toISOString(),
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

// ════════════════════════════════════════════════════════
// 캠페인 상세 패널

function DetailKPICard({ label, value, color }: { label: string; value: string; color?: 'red' | 'blue' | 'green' }) {
  const cls = color === 'red' ? 'text-red-600' : color === 'green' ? 'text-green-600' : color === 'blue' ? 'text-blue-600' : 'text-gray-900'
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
      <p className="text-[11px] text-gray-500 font-medium">{label}</p>
      <p className={`text-sm font-semibold mt-1 ${cls}`}>{value}</p>
    </div>
  )
}

function CampaignDetailPanel({
  campaign, operators, agencies, advertisers, reports, onClose, onEdit,
}: {
  campaign: Campaign
  operators: Operator[]
  agencies: Agency[]
  advertisers: Advertiser[]
  reports: import("@/lib/hooks/useReports").SavedReport[]
  onClose: () => void
  onEdit: (c: Campaign) => void
}) {
  // 업로드된 실적 데이터 (raw → computed)
  const [computedRows, setComputedRows] = useState<RawRow[]>([])
  useEffect(() => {
    const rows = loadComputedRows(campaign.id)
    setComputedRows(rows)
  }, [campaign.id])

  const totals   = getCampaignTotals(campaign)
  const progress = getCampaignProgress(campaign.startDate, campaign.endDate)
  const dday     = getDday(campaign.endDate)
  const sc       = spendRateStyle(totals.spendRate)
  const lag      = progress - totals.spendRate

  const opName  = operators.find(o => o.id === campaign.managerId)?.name  ?? '-'
  const agN     = agencies.find(a => a.id === campaign.agencyId)?.name    ?? '-'
  const advN    = advertisers.find(a => a.id === campaign.advertiserId)?.name ?? '-'

  const chartData = campaign.mediaBudgets.map(mb => {
    const t = getMediaTotals(mb)
    return { name: mb.media, '부킹': t.totalBudget, '세팅': t.totalSettingCost, '집행': t.totalSpend }
  })

  const linkedReports = reports.filter(r => {
    const names = new Set<string>([...(r.detectedCampaignNames ?? []), ...(r.campaignName ? [r.campaignName] : [])])
    for (const rows of Object.values(r.rowsByMedia ?? {})) {
      rows?.forEach((row: { campaignName?: string }) => { if (row.campaignName) names.add(row.campaignName) })
    }
    return (campaign.csvNames ?? []).some(n => names.has(n))
  })

  function fmtAbbr(n: number): string {
    if (n >= 100000000) return `${(n / 100000000).toFixed(1)}억`
    if (n >= 10000)     return `${(n / 10000).toFixed(0)}만`
    return fmt(n)
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-[500px] bg-white shadow-2xl border-l border-gray-200 z-50 flex flex-col overflow-hidden">

        {/* 헤더 */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {campaign.campaignType && (
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-purple-100 text-purple-700">
                  {campaign.campaignType}
                </span>
              )}
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${campaign.status === "집행 중" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"}`}>
                {campaign.status}
              </span>
              {dday.label && (
                <span className={`text-xs font-medium ${dday.urgent ? "text-red-600" : dday.expired ? "text-gray-400" : "text-gray-500"}`}>
                  {dday.label}
                </span>
              )}
            </div>
            <h2 className="text-base font-semibold text-gray-900 truncate">{campaign.campaignName}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{advN} · {agN} · 담당: {opName}</p>
          </div>
          <button onClick={onClose} className="ml-3 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition-colors flex-shrink-0">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* KPI 카드 */}
          <div className="grid grid-cols-2 gap-2.5">
            <DetailKPICard label="부킹 금액" value={fmt(totals.totalBudget) + '원'} />
            <DetailKPICard label="세팅 금액" value={fmt(totals.totalSettingCost) + '원'} />
            <DetailKPICard label="집행 금액" value={fmt(totals.totalSpend) + '원'} color={totals.spendRate > 100 ? 'red' : 'blue'} />
            <DetailKPICard label="미소진 잔액" value={fmt(Math.max(0, totals.totalSettingCost - totals.totalSpend)) + '원'} />
          </div>

          {/* 진행률 vs 소진율 */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
            <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">진행률 vs 소진율</h3>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-gray-600">진행률</span>
                <span className="text-xs font-semibold text-blue-600">{progress}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-gray-200">
                <div className="h-full rounded-full bg-blue-400 transition-all" style={{ width: `${Math.min(progress, 100)}%` }} />
              </div>
              <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                <span>{campaign.startDate.slice(5)}</span>
                <span>{campaign.endDate.slice(5)}</span>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-gray-600">소진율</span>
                <span className={`text-xs font-semibold ${sc.text}`}>{totals.spendRate}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-gray-200">
                <div className={`h-full rounded-full transition-all ${sc.bar}`} style={{ width: `${Math.min(totals.spendRate, 100)}%` }} />
              </div>
            </div>
            {Math.abs(lag) >= 5 && (
              <div className={`rounded-lg px-3 py-2 text-xs font-medium ${lag >= 15 ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' : lag > 0 ? 'bg-orange-50 text-orange-700' : 'bg-green-50 text-green-700'}`}>
                {lag > 0 ? `⚠ 집행 속도 ${lag.toFixed(1)}%p 지연` : `▲ 집행 속도 ${Math.abs(lag).toFixed(1)}%p 빠름`}
              </div>
            )}
          </div>

          {/* 매체별 예산 차트 */}
          {chartData.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">매체별 예산 현황</h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData} barCategoryGap="35%" barGap={2} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => fmtAbbr(v as number)} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} width={36} />
                  <Tooltip formatter={(value: unknown) => [fmt(value as number) + '원', '']} />
                  <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="부킹" fill="#e2e8f0" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="세팅" fill="#93c5fd" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="집행" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* 매체별 상세 테이블 */}
          {campaign.mediaBudgets.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <h3 className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">매체별 상세</h3>
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-gray-500 font-medium">매체</th>
                    <th className="px-3 py-2 text-right text-gray-500 font-medium">세팅</th>
                    <th className="px-3 py-2 text-right text-gray-500 font-medium">집행</th>
                    <th className="px-3 py-2 text-right text-gray-500 font-medium">소진율</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {campaign.mediaBudgets.map(mb => {
                    const t = getMediaTotals(mb)
                    const msc = spendRateStyle(t.spendRate)
                    return (
                      <tr key={mb.media} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium text-gray-700">{mb.media}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-600">{fmtAbbr(t.totalSettingCost)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-600">{fmtAbbr(t.totalSpend)}</td>
                        <td className={`px-3 py-2 text-right tabular-nums font-semibold ${msc.text}`}>{t.spendRate}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* 일일 예산 제안 */}
          {campaign.status === "집행 중" && (
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
              <h3 className="text-[11px] font-semibold text-blue-600 mb-1">일일 예산 제안</h3>
              <p className="text-xs text-blue-800">{getDailySuggestion(campaign)}</p>
            </div>
          )}

          {/* 업로드 실적 데이터 (raw → markup computed) */}
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
              <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">업로드 실적 데이터</h3>
              {computedRows.length > 0 && (
                <span className="text-[10px] text-gray-400">{computedRows.length}행</span>
              )}
            </div>
            {computedRows.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="text-xs text-gray-400">데이터 없음</p>
                <p className="text-[10px] text-gray-300 mt-1">데이터 입력 탭에서 CSV를 업로드하면 자동으로 연결됩니다</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                {/* 매체별 집계 요약 */}
                {(() => {
                  const byMedia = new Map<string, { rows: number; impressions: number; clicks: number; executionAmount: number; netAmount: number }>()
                  for (const r of computedRows) {
                    const cur = byMedia.get(r.media) ?? { rows: 0, impressions: 0, clicks: 0, executionAmount: 0, netAmount: 0 }
                    cur.rows++
                    cur.impressions += r.impressions
                    cur.clicks += r.clicks
                    cur.executionAmount += r.executionAmount
                    cur.netAmount += r.netAmount
                    byMedia.set(r.media, cur)
                  }
                  const entries = Array.from(byMedia.entries())
                  return (
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-gray-500 font-medium">매체</th>
                          <th className="px-3 py-2 text-right text-gray-500 font-medium">노출</th>
                          <th className="px-3 py-2 text-right text-gray-500 font-medium">클릭</th>
                          <th className="px-3 py-2 text-right text-gray-500 font-medium">집행금액</th>
                          <th className="px-3 py-2 text-right text-gray-500 font-medium">순금액</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {entries.map(([media, agg]) => (
                          <tr key={media} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-medium text-gray-700">{media}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-600">{fmt(agg.impressions)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-600">{fmt(agg.clicks)}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium text-blue-700">{fmt(agg.executionAmount)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-600">{fmt(agg.netAmount)}</td>
                          </tr>
                        ))}
                        <tr className="bg-gray-50 font-semibold">
                          <td className="px-3 py-2 text-gray-700">합계</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmt(computedRows.reduce((s, r) => s + r.impressions, 0))}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmt(computedRows.reduce((s, r) => s + r.clicks, 0))}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-blue-700">{fmt(computedRows.reduce((s, r) => s + r.executionAmount, 0))}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmt(computedRows.reduce((s, r) => s + r.netAmount, 0))}</td>
                        </tr>
                      </tbody>
                    </table>
                  )
                })()}
              </div>
            )}
          </div>

          {/* 연결 데이터 */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">연결 데이터</h3>
            {campaign.csvNames && campaign.csvNames.length > 0 ? (
              <div className="space-y-1.5">
                {campaign.csvNames.map(n => (
                  <div key={n} className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${linkedReports.some(r => r.detectedCampaignNames?.includes(n) || Object.values(r.rowsByMedia ?? {}).some(rows => rows?.some((row: { campaignName?: string }) => row.campaignName === n))) ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <span className="text-xs text-gray-700 truncate">{n}</span>
                  </div>
                ))}
                {linkedReports.length > 0 && (
                  <p className="mt-1 text-[11px] text-green-600">{linkedReports.length}개 리포트와 연결됨</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-400">연결된 데이터 없음 — 캠페인 수정에서 CSV명을 연결하세요</p>
            )}
          </div>

          {/* 특이사항 */}
          {campaign.memo && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <h3 className="text-[11px] font-semibold text-amber-700 mb-1">특이사항</h3>
              <p className="text-xs text-amber-900 whitespace-pre-wrap">{campaign.memo}</p>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="border-t border-gray-100 px-5 py-3 flex justify-end">
          <button
            onClick={() => onEdit(campaign)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            캠페인 수정
          </button>
        </div>
      </div>
    </>
  )
}

function SCard({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color?: "blue" | "gray"
}) {
  const cls = color === "blue" ? "text-blue-600" : color === "gray" ? "text-gray-400" : "text-gray-900"
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 text-center">
      <p className="text-[10px] text-gray-500 mb-0.5">{label}</p>
      <p className={`text-sm font-bold ${cls}`}>{value} {sub && <span className="text-xs font-normal">{sub}</span>}</p>
    </div>
  )
}

function MF({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-700">{label}</label>
      {children}
    </div>
  )
}

                   