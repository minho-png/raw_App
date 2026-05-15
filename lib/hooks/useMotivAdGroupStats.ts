"use client"
import { useEffect, useState } from "react"

/**
 * /v1/stats/adgroup/breakdown — 광고그룹 단위 stats.
 *
 * 사용자 요청 — '광고그룹 단에서 DMP 사별로 data_fee 확인'.
 *
 * Motiv DSP 의 광고그룹은 DMP 타겟팅 단위로 나뉘는 경우가 많아,
 * 광고그룹 별 data_fee 가 곧 (DMP 사 × 캠페인) 의 비용으로 추정됨.
 * 실제 응답 row 에 dmp 식별자(예: adgroup_title 안에 SKP/TG360/KB 등) 가 들어옴.
 */
export interface AdGroupStatsRow {
  campaign_id: number
  adgroup_id: number
  adgroup_title?: string
  cost: number
  revenue: number
  agency_fee: number
  data_fee: number
  payprice: number
  /** 원본 dictionary — 매핑 외 추가 필드(예: publisher_id, dmp_name) 진단용. */
  raw: Record<string, string>
}

interface State {
  rows: AdGroupStatsRow[]
  loading: boolean
  error: string | null
}

export function useMotivAdGroupStats({
  campaignIds, startDate, endDate, enabled = true, refreshKey = 0,
}: {
  campaignIds: number[]
  startDate?: string
  endDate?: string
  enabled?: boolean
  refreshKey?: number
}) {
  const [state, setState] = useState<State>({ rows: [], loading: false, error: null })
  const key = JSON.stringify({ c: [...campaignIds].sort(), s: startDate, e: endDate })

  useEffect(() => {
    if (!enabled || campaignIds.length === 0) {
      setState({ rows: [], loading: false, error: null })
      return
    }
    let cancelled = false
    setState(s => ({ ...s, loading: true, error: null }))
    ;(async () => {
      try {
        const PER_PAGE = 100
        const MAX_PAGES = 20
        const rows: AdGroupStatsRow[] = []
        for (let page = 1; page <= MAX_PAGES; page++) {
          const p = new URLSearchParams()
          p.set('campaign_id', campaignIds.join(','))
          if (startDate) p.set('start_date', startDate)
          if (endDate)   p.set('end_date', endDate)
          p.set('per_page', String(PER_PAGE))
          p.set('page', String(page))
          p.set('sort', 'adgroup_id')
          const res = await fetch(`/api/motiv/stats/adgroup?${p.toString()}`, { cache: 'no-store' })
          if (!res.ok) {
            const j = await res.json().catch(() => ({}))
            throw new Error((j as { error?: string }).error || `HTTP ${res.status}`)
          }
          const json = await res.json() as {
            data?: Record<string, string>[]
            meta?: { last_page?: number }
          }
          for (const r of (json.data ?? [])) {
            rows.push({
              campaign_id:  Number(r.campaign_id ?? 0),
              adgroup_id:   Number(r.adgroup_id ?? 0),
              adgroup_title: r.adgroup_title ?? r.adgroup_name ?? undefined,
              cost:         Number(r.cost ?? 0),
              revenue:      Number(r.revenue ?? 0),
              agency_fee:   Number(r.agency_fee ?? 0),
              data_fee:     Number(r.data_fee ?? 0),
              payprice:     Number(r.payprice ?? 0),
              raw: r,
            })
          }
          const lastPage = json.meta?.last_page
          if (lastPage != null ? page >= lastPage : (json.data ?? []).length < PER_PAGE) break
        }
        if (!cancelled) setState({ rows, loading: false, error: null })
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : String(e)
        setState({ rows: [], loading: false, error: msg })
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, refreshKey])

  return state
}
