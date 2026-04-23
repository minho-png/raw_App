"use client"
import { CampaignModal } from "@/app/campaign/ct-plus/components/ct-plus/CampaignModal"
import { CampaignDetailPanel } from "@/app/campaign/ct-plus/components/ct-plus/CampaignDetailPanel"
import { CampaignFilterBar } from "@/app/campaign/ct-plus/components/ct-plus/CampaignFilterBar"
import { CampaignSummaryBanner } from "@/app/campaign/ct-plus/components/ct-plus/CampaignSummaryBanner"
import { CampaignTableSection } from "@/app/campaign/ct-plus/components/ct-plus/CampaignTableSection"
import { AnomalyBanner } from "@/app/campaign/ct-plus/components/ct-plus/AnomalyBanner"
import type { CampaignAnomaly } from "@/app/campaign/ct-plus/components/ct-plus/AnomalyBanner"
import { ConfirmModal, FilterStatus, btnPrimary, getDailySuggestion, fmt } from "@/app/campaign/ct-plus/components/ct-plus/statusUtils"
import type { ConfirmCfg } from "@/app/campaign/ct-plus/components/ct-plus/statusUtils"

import React, { useState, useMemo, useEffect } from "react"

import {
  Campaign,
  getCampaignTotals, getCampaignProgress,
} from "@/lib/campaignTypes"
import { useMasterData } from "@/lib/hooks/useMasterData"
import { useRawData } from "@/lib/hooks/useRawData"
import { applyMarkupToRows } from "@/lib/markupService"

export default function CampaignStatusPage() {
  const {
    campaigns, operators, agencies, advertisers,
    saveCampaigns,
  } = useMasterData()
  const { allRows: rawRows } = useRawData()

  const [filterStatus, setFilterStatus] = useState<FilterStatus>("전체")
  const [filterMonth,  setFilterMonth]  = useState("")
  const [filterOperator, setFilterOperator] = useState("")
  const [filterMedia,  setFilterMedia]  = useState("")
  const [searchQuery,  setSearchQuery]  = useState("")
  const [modalOpen,    setModalOpen]    = useState(false)
  const [editTarget,   setEditTarget]   = useState<Campaign | null>(null)
  const [confirmCfg,   setConfirmCfg]   = useState<ConfirmCfg | null>(null)
  const [toast,        setToast]        = useState<{ message: string; type: "success" | "error" } | null>(null)

  const takenCsvNames = useMemo(
    () => campaigns.filter(c => c.id !== editTarget?.id).flatMap(c => c.csvNames ?? []),
    [campaigns, editTarget]
  )

  const [computedSpendMap, setComputedSpendMap] = useState<
    Map<string, { netAmount: number; executionAmount: number; rowCount: number }>
  >(new Map())

  const [selectedDetailId, setSelectedDetailId] = useState<string | null>(null)
  const selectedDetailCampaign = useMemo(
    () => campaigns.find(c => c.id === selectedDetailId) ?? null,
    [campaigns, selectedDetailId]
  )

  useEffect(() => {
    if (campaigns.length === 0 || rawRows.length === 0) return
    const computed = applyMarkupToRows(rawRows, campaigns)
    const map = new Map<string, { netAmount: number; executionAmount: number; rowCount: number }>()
    for (const row of computed) {
      if (!row.matchedCampaignId) continue
      const prev = map.get(row.matchedCampaignId) ?? { netAmount: 0, executionAmount: 0, rowCount: 0 }
      map.set(row.matchedCampaignId, {
        netAmount:       prev.netAmount       + (row.netAmount       ?? 0),
        executionAmount: prev.executionAmount + (row.executionAmount ?? 0),
        rowCount:        prev.rowCount        + 1,
      })
    }
    setComputedSpendMap(map)
  }, [campaigns, rawRows])

  const filtered = useMemo(() => campaigns.filter(c => {
    if (filterStatus !== "전체" && c.status !== filterStatus) return false
    if (filterMonth  && c.settlementMonth !== filterMonth) return false
    if (filterOperator && c.managerId !== filterOperator) return false
    if (filterMedia  && !c.mediaBudgets.some(mb => mb.media === filterMedia)) return false
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
    filtered.forEach(c => {
      const t = getCampaignTotals(c)
      totalBudget      += t.totalBudget
      totalSettingCost += t.totalSettingCost
    })
    return {
      total: filtered.length,
      active: filtered.filter(c => c.status === "집행 중").length,
      ended:  filtered.filter(c => c.status === "종료").length,
      totalBudget,
      totalSettingCost,
    }
  }, [filtered])

  // ── 이상치 감지 ───────────────────────────────────────
  // 소진율 기준: raw data(CSV) 집행금액 ÷ 세팅금액 (config mb.dmp.spend 아님)
  const anomalies = useMemo((): CampaignAnomaly[] => {
    const result: CampaignAnomaly[] = []
    for (const c of filtered) {
      if (c.status !== "집행 중") continue
      const progress = getCampaignProgress(c.startDate, c.endDate)
      const totals   = getCampaignTotals(c)
      const spend    = computedSpendMap.get(c.id)

      // raw data 기반 소진율 (CSV 집행금액 ÷ 세팅금액)
      const rawSpendRate = spend && totals.totalSettingCost > 0
        ? Math.round((spend.netAmount / totals.totalSettingCost) * 1000) / 10
        : 0

      // 진행률 vs raw 소진율 15%p 이상 차이 → 지연 경고
      if (spend && progress - rawSpendRate >= 15) {
        result.push({
          campaign: c,
          type: "lagging",
          detail: getDailySuggestion(c),
          progress,
          spendRate: rawSpendRate,
        })
      }

      // raw 소진율 100% 초과 → 예산 초과 경고
      if (rawSpendRate > 100) {
        result.push({
          campaign: c,
          type: "overspend",
          detail: `소진율 ${rawSpendRate.toFixed(1)}%로 세팅 금액(${fmt(totals.totalSettingCost)}원)을 초과했습니다.`,
          spendRate: rawSpendRate,
        })
      }

      // raw data가 없는데 진행률 > 0 → 데이터 없음 경고
      if ((!spend || spend.rowCount === 0) && progress > 0) {
        result.push({
          campaign: c,
          type: "no_data",
          detail: "집행 중 캠페인에 실적 데이터가 없습니다. CSV를 업로드하거나 매체 콘솔을 확인하세요.",
        })
      }
    }
    return result
  }, [filtered, computedSpendMap])

  const isFiltered = !!(filterStatus !== "전체" || filterMonth || filterOperator || filterMedia || searchQuery)

  function confirm(cfg: ConfirmCfg) { setConfirmCfg(cfg) }
  function showToast(message: string, type: "success" | "error" = "success") {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  function handleStatusToggle(id: string) {
    const c    = campaigns.find(x => x.id === id)!
    const next = c.status === "집행 중" ? "종료" : "집행 중"
    confirm({
      title: "상태 변경",
      message: `"${c.campaignName}"\n캠페인을 [${next}](으)로 변경하시겠습니까?`,
      onConfirm: () => {
        saveCampaigns(campaigns.map(x => x.id === id ? { ...x, status: next } : x))
        setConfirmCfg(null)
      },
    })
  }

  function handleDelete(id: string) {
    const c       = campaigns.find(x => x.id === id)!
    const advName = advertisers.find(a => a.id === c.advertiserId)?.name ?? "-"
    confirm({
      title: "캠페인 삭제",
      message: `"${advName} - ${c.campaignName}"\n을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`,
      onConfirm: () => { saveCampaigns(campaigns.filter(x => x.id !== id)); setConfirmCfg(null) },
    })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-gray-900">집행 관리</h1>
            <p className="text-xs text-gray-400 mt-0.5">캠페인 현황 및 관리</p>
          </div>
          <button onClick={() => { setEditTarget(null); setModalOpen(true) }} className={btnPrimary}>
            + 캠페인 추가
          </button>
        </div>
      </header>

      {toast && (
        <div className={`fixed top-4 right-4 px-4 py-2 rounded-lg text-sm font-medium text-white z-50 ${
          toast.type === "success" ? "bg-green-500" : "bg-red-500"
        }`}>
          {toast.message}
        </div>
      )}

      <main className="p-6 space-y-4">
        {isFiltered && (
          <p className="text-xs text-blue-600 font-medium">
            필터 적용 중 · {summary.total}개 캠페인 기준
          </p>
        )}
        <CampaignSummaryBanner summary={summary} />
        <AnomalyBanner anomalies={anomalies} />
        <CampaignFilterBar
          filterStatus={filterStatus} setFilterStatus={setFilterStatus}
          filterMonth={filterMonth}   setFilterMonth={setFilterMonth}
          filterOperator={filterOperator} setFilterOperator={setFilterOperator}
          filterMedia={filterMedia}   setFilterMedia={setFilterMedia}
          searchQuery={searchQuery}   setSearchQuery={setSearchQuery}
          isFiltered={isFiltered}
          onReset={() => {
            setFilterStatus("전체" as FilterStatus)
            setFilterMonth(""); setFilterOperator(""); setFilterMedia(""); setSearchQuery("")
          }}
          campaigns={campaigns} operators={operators}
          agencies={agencies}   advertisers={advertisers}
        />
        <CampaignTableSection
          filtered={filtered}
          agencies={agencies} advertisers={advertisers} operators={operators}
          computedSpendMap={computedSpendMap}
          onEdit={(c) => { setEditTarget(c); setModalOpen(true) }}
          onDelete={handleDelete}
          onStatusToggle={handleStatusToggle}
          selectedDetailId={selectedDetailId}
          setSelectedDetailId={setSelectedDetailId}
        />
      </main>

      {modalOpen && (
        <CampaignModal
          initial={editTarget} operators={operators}
          agencies={agencies} advertisers={advertisers}
          takenCsvNames={takenCsvNames}
          onSave={(c) => {
            if (editTarget) saveCampaigns(campaigns.map(x => x.id === c.id ? c : x))
            else            saveCampaigns([...campaigns, { ...c, id: Date.now().toString() }])
            setModalOpen(false)
          }}
          onClose={() => setModalOpen(false)}
        />
      )}
      {confirmCfg && (
        <ConfirmModal
          title={confirmCfg.title} message={confirmCfg.message}
          onConfirm={confirmCfg.onConfirm} onCancel={() => setConfirmCfg(null)}
        />
      )}
      {selectedDetailCampaign && (
        <CampaignDetailPanel
          campaign={selectedDetailCampaign}
          operators={operators} agencies={agencies} advertisers={advertisers}
          rawRows={rawRows}
          onClose={() => setSelectedDetailId(null)}
          onEdit={(c) => { setEditTarget(c); setModalOpen(true); setSelectedDetailId(null) }}
        />
      )}
    </div>
  )
}
