'use client'

/**
 * useCTPlusOverview
 *
 * CT+ 현황 페이지용 훅 — 캠페인, 광고주, 연결 리포트를 클라이언트에서 조합합니다.
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import type { Campaign, Advertiser } from '@/lib/campaignTypes'
import { getCampaignTotals, getDday } from '@/lib/campaignTypes'
import type { SavedReport } from '@/lib/hooks/useReports'
import { useReportCampaignSync } from '@/lib/hooks/useReportCampaignSync'

// ── localStorage 헬퍼 ────────────────────────────────────────
const LS_CAMPAIGNS   = 'ct-plus-campaigns-v7'
const LS_ADVERTISERS = 'ct-plus-advertisers-v1'
const LS_REPORTS     = 'ct-plus-daily-reports-v1'

function lsRead<T>(key: string): T[] {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(key) : null
    return raw ? (JSON.parse(raw) as T[]) : []
  } catch { return [] }
}

// ── 타입 ─────────────────────────────────────────────────────

export interface DmpBreakdown {
  media: string
  dmpSpend: number
  nonDmpSpend: number
  total: number
}

export interface DailyTrend {
  date: string
  spend: number
}

export interface CTPlusOverview {
  campaign:       Campaign
  advertiserName: string
  totals: {
    totalBudget:      number
    totalSettingCost: number
    totalSpend:       number
    spendRate:        number
  }
  dday:           ReturnType<typeof getDday>
  dmpBreakdown:   DmpBreakdown[]
  dailyTrend:     DailyTrend[]
  matchedReports: SavedReport[]
}

// ── 훅 ──────────────────────────────────────────────────────

export function useCTPlusOverview() {
  const [campaigns,   setCampaigns]   = useState<Campaign[]>([])
  const [advertisers, setAdvertisers] = useState<Advertiser[]>([])
  const [reports,     setReports]     = useState<SavedReport[]>([])
  const [selectedId,  setSelectedId]  = useState<string>('')

  const { calcSpendFromReports } = useReportCampaignSync()

  // 마운트 시 localStorage에서 로드
  useEffect(() => {
    const c = lsRead<Campaign>(LS_CAMPAIGNS)
    const a = lsRead<Advertiser>(LS_ADVERTISERS)
    const r = lsRead<SavedReport>(LS_REPORTS)
    setCampaigns(c)
    setAdvertisers(a)
    setReports(r)
    if (c.length > 0 && !selectedId) setSelectedId(c[0].id)
  }, [selectedId])

  const selected = useMemo(
    () => campaigns.find(c => c.id === selectedId) ?? null,
    [campaigns, selectedId],
  )

  const overview: CTPlusOverview | null = useMemo(() => {
    if (!selected) return null

    const advertiserName =
      advertisers.find(a => a.id === selected.advertiserId)?.name ?? '—'

    const totals = getCampaignTotals(selected)
    const dday   = getDday(selected.endDate)

    // 연결된 리포트 집계
    const syncResult = calcSpendFromReports(selected, reports, advertiserName)

    // DMP 분류 집계
    const dmpBreakdown: DmpBreakdown[] = Object.entries(syncResult.byMedia).map(
      ([media, bucket]) => ({
        media,
        dmpSpend:    bucket.dmpSpend,
        nonDmpSpend: bucket.nonDmpSpend,
        total:       bucket.dmpSpend + bucket.nonDmpSpend,
      }),
    )

    // 일별 추이 — 연결된 리포트의 모든 행을 날짜별 합산
    const dailyMap: Record<string, number> = {}
    for (const report of reports) {
      if (!syncResult.matchedReportIds.includes(report.id)) continue
      for (const rows of Object.values(report.rowsByMedia)) {
        if (!rows) continue
        for (const row of rows) {
          if (row.date < selected.startDate || row.date > selected.endDate) continue
          dailyMap[row.date] = (dailyMap[row.date] ?? 0) + (row.netAmount ?? row.netCost ?? 0)
        }
      }
    }
    const dailyTrend: DailyTrend[] = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, spend]) => ({ date, spend: Math.round(spend) }))

    const matchedReports = reports.filter(r =>
      syncResult.matchedReportIds.includes(r.id),
    )

    return {
      campaign: selected,
      advertiserName,
      totals,
      dday,
      dmpBreakdown,
      dailyTrend,
      matchedReports,
    }
  }, [selected, reports, advertisers, calcSpendFromReports])

  const selectCampaign = useCallback((id: string) => setSelectedId(id), [])

  return {
    campaigns,
    selectedId,
    selectCampaign,
    overview,
    isLoading: campaigns.length === 0,
  }
}
