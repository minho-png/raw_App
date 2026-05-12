"use client"
import { useEffect, useState } from "react"
import type { MotivCampaignStats } from "@/lib/motivApi/types"

interface SnapshotCampaign {
  motivId: number
  campaign_type: string
  adaccount_id: number
  total_budget: number | null
  stats: MotivCampaignStats
}

interface Snapshot {
  date: string
  capturedAt: string
  campaigns: SnapshotCampaign[]
}

interface State {
  snapshot: Snapshot | null
  byMotivId: Map<number, MotivCampaignStats>
  loading: boolean
  error: string | null
}

// 어제 자정에 캡처된 누적 stats 를 조회.
// date 가 undefined 면 자동으로 "어제" 사용.
export function useMotivDailySnapshot(date?: string) {
  const [state, setState] = useState<State>({
    snapshot: null, byMotivId: new Map(), loading: true, error: null,
  })

  useEffect(() => {
    const targetDate = date ?? defaultYesterday()
    let cancelled = false
    setState(s => ({ ...s, loading: true }))
    ;(async () => {
      try {
        const res = await fetch(`/api/v1/motiv-snapshots?date=${targetDate}`, { cache: 'no-store' })
        if (!res.ok) throw new Error(`${res.status}`)
        const j = (await res.json()) as { snapshot: Snapshot | null }
        const byMotivId = new Map<number, MotivCampaignStats>()
        if (j.snapshot) {
          for (const c of j.snapshot.campaigns) byMotivId.set(c.motivId, c.stats)
        }
        if (!cancelled) setState({ snapshot: j.snapshot, byMotivId, loading: false, error: null })
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : String(e)
        setState({ snapshot: null, byMotivId: new Map(), loading: false, error: msg })
      }
    })()
    return () => { cancelled = true }
  }, [date])

  return state
}

function defaultYesterday(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
