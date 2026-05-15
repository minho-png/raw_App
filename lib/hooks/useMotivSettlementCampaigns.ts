"use client"
import { useEffect, useState } from "react"
import type { MotivCampaign, MotivCampaignListResponse, MotivCampaignType } from "@/lib/motivApi/types"
import { motivTypeToProduct, isExcludedCampaign, type MediaProductType } from "@/lib/motivApi/productMapping"

interface Options {
  // 가져올 Motiv campaign_type 집합 (예: ['TV'] for CTV, ['DISPLAY','VIDEO','PARTNERS'] for CT)
  types: MotivCampaignType[]
  // 대상 월 (YYYY-MM) — start_date 기준 필터에 사용. dateRange 가 있으면 무시.
  month?: string
  // 일자 범위 직접 지정 — dateRange 가 우선. start/end 는 'YYYY-MM-DD'
  dateRange?: { start: string; end: string }
  perPage?: number
  enabled?: boolean
  // useRefreshControl().key — 증가 시 재호출 (실시간 갱신)
  refreshKey?: number
}

interface State {
  data: MotivCampaign[]
  loading: boolean
  error: string | null
  exchangeRate: number
  total: number
  /** 진단 — 사용자 보고 '빠지는 캠페인이 많아'. 어디서 빠지는지 가시화. */
  diag: {
    serverTotal: number          // Motiv 서버가 보고한 총 캠페인 수 (meta.total)
    fetched: number              // 실제 page 순회로 받은 raw 캠페인 수
    excluded: number             // isExcludedCampaign 으로 제외된 수
    outOfRange: number           // 클라이언트 dateRange overlap 으로 제외된 수
    final: number                // 최종 노출 수 (data.length)
    /** 페이지 한계(MAX_PAGES) 도달했는지 — 추가 캠페인 누락 가능성 신호 */
    truncated: boolean
  }
}

/**
 * YYYY-MM → [YYYY-MM-01, YYYY-MM-DD(마지막날)] 로 변환.
 */
function monthToRange(month: string): { start: string; end: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const lastDay = new Date(y, mo, 0).getDate()
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    start: `${y}-${pad(mo)}-01`,
    end:   `${y}-${pad(mo)}-${pad(lastDay)}`,
  }
}

/**
 * Motiv /api/motiv/campaigns 프록시를 type 별로 호출 후 병합.
 * Settlement 페이지에서 CT/CTV 캠페인 리스트 소스로 사용.
 *
 * 월별 필터:
 *   - month 지정 시 Motiv API 의 start_date/end_date 쿼리로 **서버측 필터**를 우선 적용.
 *   - 서버 필터 시맨틱이 불확실할 수 있으므로 클라이언트사이드에서 기간 overlap 재검증.
 *   - 결과 stats 는 Motiv 응답 그대로 — 월별 집계가 아닌 누적값일 수 있으며,
 *     실사용 시 Motiv 문서 확인 후 필요하면 per-month stats 엔드포인트로 교체.
 *
 * 주의: per_page 200, 첫 페이지만 조회 (향후 무한 스크롤/페이지네이션 고려).
 */
const EMPTY_DIAG = { serverTotal: 0, fetched: 0, excluded: 0, outOfRange: 0, final: 0, truncated: false }

export function useMotivSettlementCampaigns({ types, month, dateRange, perPage = 200, enabled = true, refreshKey = 0 }: Options) {
  const [state, setState] = useState<State>({ data: [], loading: true, error: null, exchangeRate: 0, total: 0, diag: { ...EMPTY_DIAG } })

  // deps 안정화: dateRange 객체 자체는 매 렌더 새 참조라 primitive 로 분해
  const rangeStart = dateRange?.start
  const rangeEnd   = dateRange?.end

  useEffect(() => {
    if (!enabled || types.length === 0) {
      setState({ data: [], loading: false, error: null, exchangeRate: 0, total: 0, diag: { ...EMPTY_DIAG } })
      return
    }
    // 우선순위: dateRange > month
    const range = (rangeStart && rangeEnd)
      ? { start: rangeStart, end: rangeEnd }
      : (month ? monthToRange(month) : null)
    let cancelled = false
    ;(async () => {
      setState(s => ({ ...s, loading: true, error: null }))
      try {
        const MAX_PAGES = 25
        let truncated = false
        const results = await Promise.all(types.map(async t => {
          const merged: { data: MotivCampaign[]; meta?: { last_page?: number; total?: number }; exchange_rate?: number } = {
            data: [],
          }
          let reachedMax = true
          for (let page = 1; page <= MAX_PAGES; page++) {
            const params = new URLSearchParams()
            params.set('campaign_type', t)
            params.set('per_page', String(perPage))
            params.set('page', String(page))
            params.set('sort', '-created_at')
            if (range) {
              params.set('start_date', range.start)
              params.set('end_date',   range.end)
            }
            const ac = new AbortController()
            const timer = setTimeout(() => ac.abort(), 30_000)
            let res: Response
            try {
              res = await fetch(`/api/motiv/campaigns?${params.toString()}`, {
                cache: 'no-store', signal: ac.signal,
              })
            } catch (e) {
              if ((e as Error).name === 'AbortError') {
                throw new Error(`Motiv ${t} 응답 시간 초과 (30s)`)
              }
              throw e
            } finally {
              clearTimeout(timer)
            }
            if (!res.ok) throw new Error(`Motiv ${t} ${res.status}`)
            const json = (await res.json()) as MotivCampaignListResponse
            merged.data.push(...json.data)
            if (json.exchange_rate) merged.exchange_rate = json.exchange_rate
            merged.meta = json.meta
            const lastPage = json.meta?.last_page
            if (lastPage != null ? page >= lastPage : json.data.length < perPage) {
              reachedMax = false
              break
            }
          }
          if (reachedMax) truncated = true
          return merged
        }))

        // 진단 카운트 — 어디서 빠지는지 가시화 (사용자 보고).
        let serverTotal = 0
        let fetched = 0
        let excluded = 0
        const byId = new Map<number, MotivCampaign>()
        let exchangeRate = 0
        for (const r of results) {
          serverTotal += r.meta?.total ?? r.data.length
          fetched += r.data.length
          for (const c of r.data) {
            if (isExcludedCampaign(c.title)) { excluded += 1; continue }
            byId.set(c.id, c)
          }
          if (r.exchange_rate) exchangeRate = r.exchange_rate
        }
        let data: MotivCampaign[] = Array.from(byId.values())
        const afterDedup = data.length

        let outOfRange = 0
        if (range) {
          const mStart = new Date(`${range.start}T00:00:00`)
          const mEnd   = new Date(`${range.end}T23:59:59`)
          data = data.filter(c => {
            const s = c.start_date ? new Date(c.start_date) : null
            const e = c.end_date   ? new Date(c.end_date)   : null
            if (!s && !e) return true
            const cs = s ?? new Date(0)
            const ce = e ?? new Date(9e13)
            const keep = cs <= mEnd && ce >= mStart
            if (!keep) outOfRange += 1
            return keep
          })
        }

        const diag = {
          serverTotal, fetched, excluded, outOfRange,
          final: data.length,
          truncated,
        }
        if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
          console.info('[useMotivSettlementCampaigns] diag', diag, { types, range, dedupLost: fetched - excluded - afterDedup })
        }
        if (!cancelled) setState({ data, loading: false, error: null, exchangeRate, total: serverTotal, diag })
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : String(e)
        setState(s => ({ ...s, loading: false, error: msg }))
      }
    })()
    return () => { cancelled = true }
  }, [enabled, types.join(','), month, rangeStart, rangeEnd, perPage, refreshKey])

  return state
}

// 편의: product type (CT, CTV) 기반으로 types 자동 결정.
//
// 오버로드 — 기존 호출 호환 + 일자 범위 옵션 추가:
//   useMotivSettlementCampaignsByProduct('CT', '2026-05', true)        // 위치 인자 (기존)
//   useMotivSettlementCampaignsByProduct('CT', { dateRange })          // 옵션 객체
//   useMotivSettlementCampaignsByProduct('CT', { month: '2026-05' })   // 동등
export function useMotivSettlementCampaignsByProduct(
  product: MediaProductType | 'CT_CTV_BOTH',
  monthOrOptions?: string | { month?: string; dateRange?: { start: string; end: string }; enabled?: boolean; refreshKey?: number },
  enabledArg = true,
) {
  let types: MotivCampaignType[] = []
  if (product === 'CT')   types = ['DISPLAY', 'VIDEO', 'PARTNERS']
  if (product === 'CTV')  types = ['TV']
  if (product === 'CT_CTV_BOTH') types = ['DISPLAY', 'VIDEO', 'PARTNERS', 'TV']

  // 옵션 객체 vs 위치 인자 정규화
  const opts = typeof monthOrOptions === 'object' && monthOrOptions !== null
    ? monthOrOptions
    : { month: monthOrOptions, enabled: enabledArg }
  const enabled = opts.enabled ?? enabledArg

  return {
    ...useMotivSettlementCampaigns({
      types,
      month:      opts.month,
      dateRange:  'dateRange'  in opts ? opts.dateRange  : undefined,
      enabled,
      refreshKey: 'refreshKey' in opts ? opts.refreshKey : undefined,
    }),
    // helper: Motiv campaign → product type
    productOf: motivTypeToProduct,
  }
}
