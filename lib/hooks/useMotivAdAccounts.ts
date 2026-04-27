"use client"
import { useEffect, useState } from "react"
import type { MotivAdAccount, MotivAdAccountListResponse } from "@/lib/motivApi/types"

interface State {
  data: MotivAdAccount[]
  byId: Map<number, MotivAdAccount>
  loading: boolean
  error: string | null
}

/**
 * Motiv /api/v1/adaccounts 조회 — campaign.adaccount_id 의 부모 정보를 가져와
 * 캠페인 별 default 대행사·운영자 자동 채우기에 사용.
 *
 * 엔드포인트가 존재하지 않거나 401/500 시 graceful: data=[], error=msg.
 * 호출부는 default 미적용 으로 동작하므로 안전.
 */
export function useMotivAdAccounts(enabled = true) {
  const [state, setState] = useState<State>({ data: [], byId: new Map(), loading: true, error: null })

  useEffect(() => {
    if (!enabled) {
      setState({ data: [], byId: new Map(), loading: false, error: null })
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/motiv/ad-accounts?per_page=200&page=1', { cache: 'no-store' })
        if (!res.ok) throw new Error(`${res.status}`)
        const j = (await res.json()) as MotivAdAccountListResponse
        const data = j.data ?? []
        const byId = new Map<number, MotivAdAccount>(data.map(a => [a.id, a]))
        if (!cancelled) setState({ data, byId, loading: false, error: null })
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : String(e)
        setState({ data: [], byId: new Map(), loading: false, error: msg })
      }
    })()
    return () => { cancelled = true }
  }, [enabled])

  return state
}
