"use client"
import { useEffect, useState } from "react"
import type { MotivAdGroup } from "@/lib/motivApi/types"

/**
 * /v1/adgroups (list with stats) — 광고그룹 단위 stats.
 *
 * 사용자 보고 — '/v1/stats/adgroup/breakdown' 은 404 (미존재).
 * → /v1/adgroups list 응답의 c.stats 활용. campaigns.index 와 동일 패턴.
 *
 * 응답의 stats 는 lifetime 누적일 가능성 — 기간 정확값이 필요하면 서버측
 * filter 지원 여부 확인.
 */
export interface AdGroupRow {
  campaignId: number
  adGroupId: number
  title: string
  startDate: string | null
  endDate: string | null
  status: string
  /** DMP 사별 분류 키 — 사용자 결정. */
  targetingProductId: string | null
  cost: number
  revenue: number
  agencyFee: number
  dataFee: number
  payprice: number
  raw: MotivAdGroup
}

interface State {
  rows: AdGroupRow[]
  loading: boolean
  error: string | null
}

export function useMotivAdGroups({
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
        const MAX_PAGES = 20  // 캠페인당 광고그룹 2000 까지 (사용자 보고: 누락)
        const PARALLEL = 5    // 캠페인 단위 병렬 호출 — 너무 많으면 rate limit
        const rows: AdGroupRow[] = []

        // 한 캠페인의 모든 광고그룹 page 순회.
        async function fetchOne(cid: number): Promise<AdGroupRow[]> {
          const out: AdGroupRow[] = []
          for (let page = 1; page <= MAX_PAGES; page++) {
            const p = new URLSearchParams()
            p.set('campaign_id', String(cid))
            if (startDate) p.set('start_date', startDate)
            if (endDate)   p.set('end_date', endDate)
            p.set('per_page', String(PER_PAGE))
            p.set('page', String(page))
            const res = await fetch(`/api/motiv/adgroups?${p.toString()}`, { cache: 'no-store' })
            if (!res.ok) {
              const j = await res.json().catch(() => ({}))
              throw new Error((j as { error?: string }).error || `HTTP ${res.status}`)
            }
            const json = await res.json() as { data?: MotivAdGroup[]; meta?: { last_page?: number } }
            for (const ag of (json.data ?? [])) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const s = ag.stats as any
              out.push({
                campaignId: cid,
                adGroupId: ag.id,
                title: ag.title ?? `#${ag.id}`,
                startDate: ag.start_date,
                endDate: ag.end_date,
                status: ag.status,
                targetingProductId: ag.targeting_product_id != null ? String(ag.targeting_product_id) : null,
                cost:       Number(s?.cost ?? 0),
                revenue:    Number(s?.revenue ?? 0),
                agencyFee:  Number(s?.agency_fee ?? 0),
                dataFee:    Number(s?.data_fee ?? 0),
                payprice:   Number(s?.payprice ?? 0),
                raw: ag,
              })
            }
            const lastPage = json.meta?.last_page
            if (lastPage != null ? page >= lastPage : (json.data ?? []).length < PER_PAGE) break
          }
          return out
        }

        // PARALLEL 개씩 batch 로 병렬 호출 — 직렬 N번 보다 ~5배 빠름.
        for (let i = 0; i < campaignIds.length; i += PARALLEL) {
          const batch = campaignIds.slice(i, i + PARALLEL)
          const results = await Promise.all(batch.map(fetchOne))
          for (const arr of results) rows.push(...arr)
          if (cancelled) return
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
