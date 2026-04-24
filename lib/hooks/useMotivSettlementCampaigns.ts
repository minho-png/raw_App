"use client"
import { useEffect, useState } from "react"
import type { MotivCampaign, MotivCampaignListResponse, MotivCampaignType } from "@/lib/motivApi/types"
import { motivTypeToProduct, type MediaProductType } from "@/lib/motivApi/productMapping"

interface Options {
  // 가져올 Motiv campaign_type 집합 (예: ['TV'] for CTV, ['DISPLAY','VIDEO','PARTNERS'] for CT)
  types: MotivCampaignType[]
  // 대상 월 (YYYY-MM) — start_date 기준 필터에 사용
  month?: string
  perPage?: number
  enabled?: boolean
}

interface State {
  data: MotivCampaign[]
  loading: boolean
  error: string | null
  exchangeRate: number
  total: number
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
export function useMotivSettlementCampaigns({ types, month, perPage = 200, enabled = true }: Options) {
  const [state, setState] = useState<State>({ data: [], loading: true, error: null, exchangeRate: 0, total: 0 })

  useEffect(() => {
    if (!enabled || types.length === 0) {
      setState({ data: [], loading: false, error: null, exchangeRate: 0, total: 0 })
      return
    }
    const range = month ? monthToRange(month) : null
    let cancelled = false
    ;(async () => {
      setState(s => ({ ...s, loading: true, error: null }))
      try {
        const results = await Promise.all(types.map(async t => {
          const params = new URLSearchParams()
          params.set('campaign_type', t)
          params.set('per_page', String(perPage))
          params.set('page', '1')
          params.set('sort', '-created_at')
          if (range) {
            params.set('start_date', range.start)
            params.set('end_date',   range.end)
          }
          const res = await fetch(`/api/motiv/campaigns?${params.toString()}`, { cache: 'no-store' })
          if (!res.ok) throw new Error(`Motiv ${t} ${res.status}`)
          return (await res.json()) as MotivCampaignListResponse
        }))

        // 병합
        let data: MotivCampaign[] = []
        let total = 0
        let exchangeRate = 0
        for (const r of results) {
          data = data.concat(r.data)
          total += r.meta?.total ?? r.data.length
          if (r.exchange_rate) exchangeRate = r.exchange_rate
        }

        // 클라이언트 재검증: 기간 overlap 없는 캠페인 제외 (서버 필터 불확실성 대비)
        if (range) {
          const mStart = new Date(`${range.start}T00:00:00`)
          const mEnd   = new Date(`${range.end}T23:59:59`)
          data = data.filter(c => {
            const s = c.start_date ? new Date(c.start_date) : null
            const e = c.end_date   ? new Date(c.end_date)   : null
            // 양쪽 날짜 모두 없는 캠페인은 월별 정산 대상에서 제외
            if (!s && !e) return false
            const cs = s ?? new Date(0)
            const ce = e ?? new Date(9e13)
            return cs <= mEnd && ce >= mStart
          })
        }

        if (!cancelled) setState({ data, loading: false, error: null, exchangeRate, total })
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : String(e)
        setState(s => ({ ...s, loading: false, error: msg }))
      }
    })()
    return () => { cancelled = true }
  }, [enabled, types.join(','), month, perPage])

  return state
}

// 편의: product type (CT, CTV) 기반으로 types 자동 결정
export function useMotivSettlementCampaignsByProduct(
  product: MediaProductType | 'CT_CTV_BOTH',
  month?: string,
  enabled = true,
) {
  let types: MotivCampaignType[] = []
  if (product === 'CT')   types = ['DISPLAY', 'VIDEO', 'PARTNERS']
  if (product === 'CTV')  types = ['TV']
  if (product === 'CT_CTV_BOTH') types = ['DISPLAY', 'VIDEO', 'PARTNERS', 'TV']

  return {
    ...useMotivSettlementCampaigns({ types, month, enabled }),
    // helper: Motiv campaign → product type
    productOf: motivTypeToProduct,
  }
}
