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
        // 페이지네이션 — 한 type 의 캠페인이 per_page 초과 시 row 누락되어
        // 기간 합계 부정확. 모든 페이지 순회 (최대 10페이지 / 1000건 안전 캡).
        const PER_PAGE = 100
        const MAX_PAGES = 10
        const allRows: Record<string, string>[] = []
        let totals: Record<string, string> | null = null

        for (let page = 1; page <= MAX_PAGES; page++) {
          const params = new URLSearchParams()
          if (scope.campaignIds?.length)  params.set('campaign_id',  scope.campaignIds.join(','))
          if (scope.adaccountIds?.length) params.set('adaccount_id', scope.adaccountIds.join(','))
          if (scope.agencyId)             params.set('agency_id',    String(scope.agencyId))
          if (scope.publisherIds?.length) params.set('publisher_id', scope.publisherIds.join(','))
          if (startDate) params.set('start_date', startDate)
          if (endDate)   params.set('end_date',   endDate)
          params.set('include', 'totals')
          params.set('per_page', String(PER_PAGE))
          params.set('page',     String(page))
          params.set('sort', 'campaign_id')

          const res = await fetch(`/api/motiv/stats/campaign?${params.toString()}`, { cache: 'no-store' })
          if (!res.ok) {
            const j = await res.json().catch(() => ({}))
            throw new Error((j as { error?: string }).error || `HTTP ${res.status}`)
          }
          const json = await res.json() as {
            data?: Record<string, string>[]
            totals?: Record<string, string>
            meta?: { last_page?: number; total?: number }
          }
          const rows = json.data ?? []
          allRows.push(...rows)
          if (json.totals) totals = json.totals
          const lastPage = json.meta?.last_page
          if (lastPage != null ? page >= lastPage : rows.length < PER_PAGE) break
        }

        const { rowsToCampaignMetricsMap } = await import('@/lib/motivApi/statsMapper')
        const map = rowsToCampaignMetricsMap(allRows)
        if (!cancelled) setState({ byMotivId: map, totals, loading: false, error: null })
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
