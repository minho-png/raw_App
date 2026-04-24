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
 * Motiv /api/motiv/campaigns 프록시를 type 별로 호출 후 병합.
 * Settlement 페이지에서 CT/CTV 캠페인 리스트 소스로 사용.
 *
 * 주의: 대량 데이터 시 per_page 200까지 허용. 현재 구현은 첫 페이지만 가져옴.
 * 월별 필터가 필요한 경우 Motiv API의 start_date/end_date 파라미터는 서버측에서 처리되지 않으므로
 * 클라이언트에서 재필터링 (보수적).
 */
export function useMotivSettlementCampaigns({ types, month, perPage = 200, enabled = true }: Options) {
  const [state, setState] = useState<State>({ data: [], loading: true, error: null, exchangeRate: 0, total: 0 })

  useEffect(() => {
    if (!enabled || types.length === 0) {
      setState({ data: [], loading: false, error: null, exchangeRate: 0, total: 0 })
      return
    }
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

        // 월별 필터 (캠페인 기간이 해당 월과 겹치는지)
        if (month) {
          const [y, m] = month.split('-').map(Number)
          const mStart = new Date(y, m - 1, 1)
          const mEnd   = new Date(y, m, 0, 23, 59, 59)
          data = data.filter(c => {
            const s = c.start_date ? new Date(c.start_date) : null
            const e = c.end_date   ? new Date(c.end_date)   : null
            if (!s && !e) return true
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
