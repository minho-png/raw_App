"use client"
import { useEffect, useState } from "react"
import type { UnifiedDailyMetrics } from "@/lib/motivApi/statsMapper"

// MOTIV /v1/stats/campaign/breakdown 결과를 캠페인 ID → UnifiedDailyMetrics 매핑으로 가져옴.

export interface CampaignStatsScope {
  campaignIds?: number[]
  adaccountIds?: number[]
  agencyId?: number
  publisherIds?: number[]
}

export interface UseMotivStatsCampaignArgs {
  scope: CampaignStatsScope
  startDate?: string
  endDate?: string
  enabled?: boolean
  refreshKey?: number
}

interface State {
  byMotivId: Map<number, UnifiedDailyMetrics>
  totals: Record<string, string> | null
  loading: boolean
  error: string | null
  /** 진단용 — 받은 row 수 / 절단 여부 / 요청 chunk 수. */
  diag: {
    rowsFetched: number
    chunks: number
    truncatedChunks: number  // PAGES_PER_CHUNK 초과로 절단된 chunk 수
  }
}

const EMPTY_MAP: Map<number, UnifiedDailyMetrics> = new Map()
const EMPTY_DIAG = { rowsFetched: 0, chunks: 0, truncatedChunks: 0 }

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
  const [state, setState] = useState<State>({ byMotivId: EMPTY_MAP, totals: null, loading: false, error: null, diag: EMPTY_DIAG })
  const key = scopeKey(scope, startDate, endDate)

  useEffect(() => {
    if (!enabled || !hasScope(scope)) {
      setState({ byMotivId: EMPTY_MAP, totals: null, loading: false, error: null, diag: EMPTY_DIAG })
      return
    }
    let cancelled = false
    setState(s => ({ ...s, loading: true, error: null }))
    ;(async () => {
      try {
        // 사용자 보고 / 4-에이전트 진단 — dataFee 누락 근본 원인:
        // /v1/stats/campaign/breakdown 은 캠페인 × 일자별 row 로 분할 응답 가능.
        // 89 캠페인 × ~30일 ≈ 2670 rows → 이전 MAX_PAGES=10 × PER_PAGE=100 = 1000 cap
        // → sort 후 절단되어 일부 캠페인이 periodStats 에 아예 안 들어옴 → row 제외.
        // 해결: campaign_id 를 CHUNK 단위로 batch 요청 + chunk 당 충분한 페이지 한도.
        const PER_PAGE = 100
        const PAGES_PER_CHUNK = 30  // chunk 당 3000 rows (≈ 한달 100 캠페인) 까지 안전 cap
        const CAMP_CHUNK = 20       // 한 chunk 에 캠페인 20개 — 한달 600 rows 예상 (여유)
        const CHUNK_PARALLEL = 3    // chunk 병렬 (rate limit 고려)
        const allRows: Record<string, string>[] = []
        let totals: Record<string, string> | null = null
        let truncatedChunks = 0

        // 캠페인 ID chunks 만들기 — 캠페인 scope 일 때만 chunk, 다른 scope 는 단일 호출.
        const campIds = scope.campaignIds ?? []
        const chunks: (number[] | null)[] = campIds.length > 0
          ? (() => {
              const out: number[][] = []
              for (let i = 0; i < campIds.length; i += CAMP_CHUNK) out.push(campIds.slice(i, i + CAMP_CHUNK))
              return out
            })()
          : [null]

        async function fetchChunk(chunkIds: number[] | null): Promise<{ rows: Record<string, string>[]; truncated: boolean; totals: Record<string, string> | null }> {
          const rows: Record<string, string>[] = []
          let lastTotals: Record<string, string> | null = null
          let truncated = false
          for (let page = 1; page <= PAGES_PER_CHUNK; page++) {
            const params = new URLSearchParams()
            if (chunkIds && chunkIds.length)  params.set('campaign_id',  chunkIds.join(','))
            if (scope.adaccountIds?.length)   params.set('adaccount_id', scope.adaccountIds.join(','))
            if (scope.agencyId)               params.set('agency_id',    String(scope.agencyId))
            if (scope.publisherIds?.length)   params.set('publisher_id', scope.publisherIds.join(','))
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
            const pageRows = json.data ?? []
            rows.push(...pageRows)
            if (json.totals) lastTotals = json.totals
            const lastPage = json.meta?.last_page
            const done = lastPage != null ? page >= lastPage : pageRows.length < PER_PAGE
            if (done) break
            if (page === PAGES_PER_CHUNK) truncated = true
          }
          return { rows, truncated, totals: lastTotals }
        }

        // CHUNK_PARALLEL 단위 병렬 호출.
        for (let i = 0; i < chunks.length; i += CHUNK_PARALLEL) {
          const batch = chunks.slice(i, i + CHUNK_PARALLEL)
          const results = await Promise.all(batch.map(fetchChunk))
          for (const r of results) {
            allRows.push(...r.rows)
            if (r.truncated) truncatedChunks += 1
            if (r.totals) totals = r.totals
          }
          if (cancelled) return
        }

        const { rowsToCampaignMetricsMap } = await import('@/lib/motivApi/statsMapper')
        const map = rowsToCampaignMetricsMap(allRows)
        if (!cancelled) setState({
          byMotivId: map, totals, loading: false, error: null,
          diag: { rowsFetched: allRows.length, chunks: chunks.length, truncatedChunks },
        })
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : String(e)
        setState({ byMotivId: EMPTY_MAP, totals: null, loading: false, error: msg, diag: EMPTY_DIAG })
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, refreshKey])

  return state
}
