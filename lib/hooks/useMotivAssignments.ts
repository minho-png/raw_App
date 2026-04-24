"use client"
import { useCallback, useEffect, useState } from "react"
import type { MotivAssignment } from "@/lib/motivApi/productMapping"

interface State {
  data: MotivAssignment[]
  loading: boolean
  error: string | null
}

/**
 * Motiv 캠페인 ID → 내부 agency/advertiser/operator 매핑 관리 훅.
 * 단일 진실 공급원: MongoDB `motiv_assignments` 컬렉션.
 */
export function useMotivAssignments() {
  const [state, setState] = useState<State>({ data: [], loading: true, error: null })

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/motiv-assignments', { cache: 'no-store' })
      if (!res.ok) throw new Error(`${res.status}`)
      const { data } = await res.json() as { data: MotivAssignment[] }
      setState({ data, loading: false, error: null })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setState(s => ({ ...s, loading: false, error: msg }))
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const upsert = useCallback(async (a: MotivAssignment) => {
    // optimistic update
    setState(s => {
      const others = s.data.filter(x => x.motivCampaignId !== a.motivCampaignId)
      return { ...s, data: [...others, a] }
    })
    await fetch('/api/v1/motiv-assignments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(a),
    })
  }, [])

  const remove = useCallback(async (motivCampaignId: number) => {
    setState(s => ({ ...s, data: s.data.filter(x => x.motivCampaignId !== motivCampaignId) }))
    await fetch(`/api/v1/motiv-assignments?motivCampaignId=${motivCampaignId}`, { method: 'DELETE' })
  }, [])

  // O(1) lookup helper
  const byId = useCallback((mid: number): MotivAssignment | undefined => {
    return state.data.find(x => x.motivCampaignId === mid)
  }, [state.data])

  return { ...state, refresh, upsert, remove, byId }
}
