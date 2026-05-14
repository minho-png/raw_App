"use client"
import { useEffect, useState } from "react"
import type { UnifiedDailyMetrics } from "@/lib/motivApi/statsMapper"

// MOTIV /v1/stats/campaign/breakdown 결과를 캠페인 ID → UnifiedDailyMetrics 매핑으로 가져옴.
// 분석 페이지의 표(snapshot.today) 와 카드(daily 합계) 가 동일한 일자 범위에서 일치하도록
// 캠페인 단위로 일자 범위 집계 stats 를 받아 today 를 override 하기 위함.
//
// scope 4종(campaign_id / adaccount_id / agency_id / publisher_id) 중 하나는 필수 —
// useMotivStatsDaily 와 동일한 가드.

export interface CampaignStatsScope {
  campaignIds?: number[]
  adaccountIds?: number[]
  agencyId?: number
  publisherIds?: number[]
}

export interface UseMotivStatsCampaignArgs {
  scope: CampaignStatsScope
  startDate?: string         // YYYY-MM-DD
  endDate?: string
  enabled?: boolean
  /** useRefreshControl().key — 증가 시 재호출 */
  refreshKey?: number
}

interface State {
  byMotivId: Map<number, UnifiedDailyMetrics>
  totals: Record<string, string> | null
  loading: boolean
  error: string | null
}

const EMPTY_MAP: Map<number, UnifiedDailyMetrics> = new Map()

function hasScope(s: CampaignStatsScope): boolean {
  return !!(
    (s.campaignIds && s.campaignIds.length) ||
    (s.adaccountIds && s.adaccountIds.length) ||
    s.agencyId ||
    (s.publisherIds && s.publisherIds.length)
  )
}

function scopeKey(s: CampaignStatsScope, start?: string, end?: string): string {
  return JSON.stringify({
    c: s.campaignIds?.slice().sort(),
    a: s.adaccountIds?.slice().sort(),
    g: s.agencyId,
    p: s.publisherIds?.slice().sort(),
    s: start, e: end,
  })
}

export function useMotivStatsCampaign({
  scope, startDate, endDate, enabled = true, refreshKey = 0,
}: UseMotivStatsCampaignArgs) {
  const [state, setState] = useState<State>({ byMotivId: EMPTY_MAP, totals: null, loading: false, error: null })
  const key = scopeKey(scope, startDate, endDate)

  useEffect(() => {
    if (!enabled || !hasScope(scope)) {
      setState({ byMotivId: EMPTY_MAP, totals: null, loading: false, error: null })
      return
    }
    let cancelled = false
    setState(s => ({ ...s, loading: true, error: null }))
    ;(async () => {
      try {
        const params = new URLSearchParams()
        if (scope.campaignIds?.length)  params.set('campaign_id',  scope.campaignIds.join(','))
        if (scope.adaccountIds?.length) params.set('adaccount_id', scope.adaccountIds.join(','))
        if (scope.agencyId)             params.set('agency_id',    String(scope.agencyId))
        if (scope.publisherIds?.length) params.set('publisher_id', scope.publisherIds.join(','))
        if (startDate) params.set('start_date', startDate)
        if (endDate)   params.set('end_date',   endDate)
        params.set('include', 'totals')
        params.set('per_page', '100')
        params.set('sort', 'campaign_id')

        const res = await fetch(`/api/motiv/stats/campaign?${params.toString()}`, { cache: 'no-store' })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error((j as { error?: string }).error || `HTTP ${res.status}`)
        }
        const json = await res.json() as {
          data?: Record<string, string>[]
          totals?: Record<string, string>
        }
        const { rowsToCampaignMetricsMap } = await import('@/lib/motivApi/statsMapper')
        const map = rowsToCampaignMetricsMap(json.data ?? [])
        if (!cancelled) setState({ byMotivId: map, totals: json.totals ?? null, loading: false, error: null })
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : String(e)
        setState({ byMotivId: EMPTY_MAP, totals: null, loading: false, error: msg })
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, refreshKey])

  return state
}
