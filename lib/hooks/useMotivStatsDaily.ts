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
  scope, startDate, endDate, enabled = true,
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
        const params = new URLSearchParams()
        if (scope.campaignIds?.length)  params.set('campaign_id',  scope.campaignIds.join(','))
        if (scope.adaccountIds?.length) params.set('adaccount_id', scope.adaccountIds.join(','))
        if (scope.agencyId)             params.set('agency_id',    String(scope.agencyId))
        if (scope.publisherIds?.length) params.set('publisher_id', scope.publisherIds.join(','))
        if (startDate) params.set('start_date', startDate)
        if (endDate)   params.set('end_date',   endDate)
        params.set('include', 'totals')
        params.set('per_page', '100')
        params.set('sort', 'date')

        const res = await fetch(`/api/motiv/stats/daily?${params.toString()}`, { cache: 'no-store' })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error((j as { error?: string }).error || `HTTP ${res.status}`)
        }
        const json = await res.json() as {
          data?: Record<string, string>[]
          totals?: Record<string, string>
        }
        const { rowsToDailyPoints } = await import('@/lib/motivApi/statsService')
        const points = rowsToDailyPoints(json.data ?? [])
        if (!cancelled) setState({ data: points, totals: json.totals ?? null, loading: false, error: null })
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : String(e)
        setState({ data: [], totals: null, loading: false, error: msg })
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled])

  return state
}
