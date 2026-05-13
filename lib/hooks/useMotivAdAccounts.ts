"use client"
import { useEffect, useState } from "react"
import type { MotivAdAccount } from "@/lib/motivApi/types"
import { fetchAllPages } from "@/lib/motivApi/paginatedFetch"

interface State {
  data: MotivAdAccount[]
  byId: Map<number, MotivAdAccount>
  loading: boolean
  error: string | null
  /** 일부 페이지 fetch 실패 또는 maxPages 초과 시 true — 광고주 매핑이 무작위로 누락될 수 있음 */
  partial: boolean
}

/**
 * Motiv /api/v1/adaccounts 전체 조회 — Laravel paginator 모든 페이지 순회.
 *
 * 이전엔 page=1 만 호출했음 → 광고계정이 200건 초과인 환경에서 200건 이후가
 * byId 에 없어 캠페인의 광고주/대행사 매핑이 '—' 로 떨어지는 문제 → 페이지네이션 적용.
 */
export function useMotivAdAccounts(enabled = true, refreshKey = 0) {
  const [state, setState] = useState<State>({
    data: [], byId: new Map(), loading: true, error: null, partial: false,
  })

  useEffect(() => {
    if (!enabled) {
      setState({ data: [], byId: new Map(), loading: false, error: null, partial: false })
      return
    }
    let cancelled = false
    ;(async () => {
      const result = await fetchAllPages<MotivAdAccount>({
        endpoint: '/api/motiv/ad-accounts',
        perPage: 200,
      })
      if (cancelled) return
      const data = result.data
      const byId = new Map<number, MotivAdAccount>(data.map(a => [a.id, a]))
      // 전체 실패 케이스 — errors 만 있고 data 가 빈 경우 → error 상태로
      const error = data.length === 0 && result.errors.length > 0 ? result.errors[0] : null

      if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
        console.info('[useMotivAdAccounts]', {
          loaded: data.length, total: result.total, partial: result.partial,
          errors: result.errors, firstId: data[0]?.id, lastId: data[data.length - 1]?.id,
        })
      }

      setState({ data, byId, loading: false, error, partial: result.partial })
    })()
    return () => { cancelled = true }
  }, [enabled, refreshKey])

  return state
}
