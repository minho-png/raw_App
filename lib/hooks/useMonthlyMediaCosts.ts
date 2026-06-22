"use client"

import { useCallback, useEffect, useState } from 'react'

export type MediaCostCategory = 'CTV' | 'CT' | 'CT+'

export interface MonthlyMediaCostDoc {
  year: number
  mediaName: string
  category?: MediaCostCategory
  amounts: Record<string, number>
  currency?: 'KRW' | 'USD'
  fxRates?: Record<string, number>
  order?: number
  memo?: string
  updatedAt?: string
}

interface State {
  data: MonthlyMediaCostDoc[]
  loading: boolean
  error: string | null
}

export function useMonthlyMediaCosts(year: number) {
  const [state, setState] = useState<State>({ data: [], loading: true, error: null })

  const refresh = useCallback(async () => {
    if (!Number.isInteger(year)) {
      setState({ data: [], loading: false, error: 'year invalid' })
      return
    }
    try {
      const res = await fetch(`/api/v1/monthly-media-costs?year=${year}`, { cache: 'no-store' })
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: { code?: string; message?: string } } | null
        throw new Error(body?.error?.message ?? `HTTP_${res.status}`)
      }
      const { data } = await res.json() as { data: MonthlyMediaCostDoc[] }
      setState({ data, loading: false, error: null })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setState(s => ({ ...s, loading: false, error: msg }))
    }
  }, [year])

  useEffect(() => { refresh() }, [refresh])

  const upsert = useCallback(async (doc: MonthlyMediaCostDoc) => {
    const res = await fetch('/api/v1/monthly-media-costs', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(doc),
    })
    if (res.ok) await refresh()
    return res.ok
  }, [refresh])

  const remove = useCallback(async (mediaName: string) => {
    const res = await fetch(`/api/v1/monthly-media-costs?year=${year}&mediaName=${encodeURIComponent(mediaName)}`, { method: 'DELETE' })
    if (res.ok) await refresh()
    return res.ok
  }, [refresh, year])

  return { ...state, refresh, upsert, remove }
}
