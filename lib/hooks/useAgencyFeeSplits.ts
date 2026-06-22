"use client"

/**
 * 캠페인별 대행수수료 다중 지급처 hook — agency_fee_splits collection.
 *
 * 사용자 요청 (2026-06-22): 한 캠페인의 수수료를 여러 대행사로 분할 가능.
 */

import { useCallback, useEffect, useState } from 'react'

export interface AgencyFeeSplit {
  agencyId?: string
  agencyName: string
  amount: number
  memo?: string
}

export interface AgencyFeeSplitDoc {
  month: string
  campaignId: string
  splits: AgencyFeeSplit[]
  totalAmount: number
  baselineAmount?: number
  confirmedAt?: string
  confirmedBy?: string
  frozen?: boolean
  updatedAt?: string
}

interface State {
  data: AgencyFeeSplitDoc[]
  byCampaign: Map<string, AgencyFeeSplitDoc>
  loading: boolean
  error: string | null
}

export function useAgencyFeeSplits(month: string) {
  const [state, setState] = useState<State>({ data: [], byCampaign: new Map(), loading: true, error: null })

  const refresh = useCallback(async () => {
    if (!month) {
      setState({ data: [], byCampaign: new Map(), loading: false, error: null })
      return
    }
    try {
      const res = await fetch(`/api/v1/agency-fee-splits?month=${encodeURIComponent(month)}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`${res.status}`)
      const { data } = await res.json() as { data: AgencyFeeSplitDoc[] }
      const byCampaign = new Map(data.map(d => [d.campaignId, d]))
      setState({ data, byCampaign, loading: false, error: null })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setState(s => ({ ...s, loading: false, error: msg }))
    }
  }, [month])

  useEffect(() => { refresh() }, [refresh])

  const upsert = useCallback(async (doc: AgencyFeeSplitDoc) => {
    const res = await fetch('/api/v1/agency-fee-splits', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(doc),
    })
    if (res.ok) await refresh()
    return res.ok
  }, [refresh])

  const remove = useCallback(async (campaignId: string) => {
    const res = await fetch(`/api/v1/agency-fee-splits?month=${encodeURIComponent(month)}&campaignId=${encodeURIComponent(campaignId)}`, { method: 'DELETE' })
    if (res.ok) await refresh()
    return res.ok
  }, [refresh, month])

  const confirm = useCallback(async (campaignId: string) => {
    const res = await fetch('/api/v1/agency-fee-splits?action=confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month, campaignId }),
    })
    if (res.ok) await refresh()
    return res.ok
  }, [refresh, month])

  const unconfirm = useCallback(async (campaignId: string) => {
    const res = await fetch('/api/v1/agency-fee-splits?action=unconfirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month, campaignId }),
    })
    if (res.ok) await refresh()
    return res.ok
  }, [refresh, month])

  return { ...state, refresh, upsert, remove, confirm, unconfirm }
}
