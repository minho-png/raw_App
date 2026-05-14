"use client"
import { useEffect, useState } from "react"
import type { DailyCostPoint } from "@/lib/motivApi/statsService"

// MOTIV /v1/stats/daily/breakdown 결과를 라인차트용 DailyCostPoint[] 로 가져옴.
// 권한 규칙상 scope 4개(campaign_id / adaccount_id / agency_id / publisher_id)
// 중 하나는 필수 — 서버 route 가 사전 검증.
//
// 본 hook 은 scope 가 모두 비어있으면 호출 자체를 skip (loading=false, data=[]).

export interface DailyStatsScope {
  campaignIds?: number[]     // 콤마 구분으로 합쳐 보냄
  adaccountIds?: number[]
  agencyId?: number
  publisherIds?: number[]
}

export interface UseMotivStatsDailyArgs {
  scope: DailyStatsScope
  startDate?: string         // YYYY-MM-DD
  endDate?: string
  enabled?: boolean
  /** useRefreshControl().key — 증가 시 재호출 */
  refreshKey?: number
}

interface State {
  data: DailyCostPoint[]
  totals: Record<string, string> | null
  loading: boolean
  error: string | null
}

function hasScope(s: DailyStatsScope): boolean {
  return !!(
    (s.campaignIds && s.campaignIds.length) ||
    (s.adaccountIds && s.adaccountIds.length) ||
    s.agencyId ||
    (s.publisherIds && s.publisherIds.length)
  )
}

function scopeKey(s: DailyStatsScope, start?: string, end?: string): string {
  return JSON.stringify({
    c: s.campaignIds?.slice().sort(),
    a: s.adaccountIds?.slice().sort(),
    g: s.agencyId,
    p: s.publisherIds?.slice().sort(),
    s: start, e: end,
  })
}

export function useMotivStatsDaily({
  scope, startDate, endDate, enabled = true, refreshKey = 0,
}: UseMotivStatsDailyArgs) {
  const [state, setState] = useState<State>({ data: [], totals: null, loading: false, error: null })
  const key = scopeKey(scope, startDate, endDate)

  useEffect(() => {
    if (!enabled || !hasScope(scope)) {
      setState({ data: [], totals: null, loading: false, error: null })
      return
    }
    let cancelled = false
    setState(s => ({ ...s, loading: true, error: null }))
    ;(async () => {
      try {
        // 페이지네이션 — 일자 범위가 길거나 캠페인이 많으면 row 가 per_page 초과해
        // 누락될 수 있음 → 모든 페이지 순회 (최대 10페이지 = 1000 row 안전 캡).
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
          params.set('sort', 'date')

          const res = await fetch(`/api/motiv/stats/daily?${params.toString()}`, { cache: 'no-store' })
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

        const { rowsToDailyPoints } = await import('@/lib/motivApi/statsService')
        const points = rowsToDailyPoints(allRows)
        if (!cancelled) setState({ data: points, totals, loading: false, error: null })
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : String(e)
        setState({ data: [], totals: null, loading: false, error: msg })
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, refreshKey])

  return state
}
