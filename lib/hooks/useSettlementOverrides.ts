"use client"
import { useCallback, useEffect, useState } from "react"
import type { SettlementOverride } from "@/app/api/v1/settlement-overrides/route"

interface State {
  data: SettlementOverride[]
  byKey: Map<string, SettlementOverride>
  loading: boolean
  error: string | null
}

export type { SettlementOverride }

/**
 * 매입/매출 행 수정값 (settlement_overrides) 클라이언트 훅.
 * type / month 별로 필터 조회하고, byKey 로 빠른 lookup 제공.
 */
export function useSettlementOverrides(type: 'sales' | 'purchase', month: string) {
  const [state, setState] = useState<State>({ data: [], byKey: new Map(), loading: true, error: null })

  const refresh = useCallback(async () => {
    if (!month) {
      setState({ data: [], byKey: new Map(), loading: false, error: null })
      return
    }
    try {
      const params = new URLSearchParams({ type, month })
      const res = await fetch(`/api/v1/settlement-overrides?${params.toString()}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`${res.status}`)
      const { data } = await res.json() as { data: SettlementOverride[] }
      const byKey = new Map<string, SettlementOverride>(data.map(o => [o.rowKey, o]))
      setState({ data, byKey, loading: false, error: null })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setState(s => ({ ...s, loading: false, error: msg }))
    }
  }, [type, month])

  useEffect(() => { refresh() }, [refresh])

  const upsert = useCallback(async (override: SettlementOverride) => {
    // 낙관적 갱신
    setState(s => {
      const byKey = new Map(s.byKey)
      byKey.set(override.rowKey, override)
      return { ...s, byKey, data: [...byKey.values()] }
    })
    await fetch('/api/v1/settlement-overrides', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(override),
    })
  }, [])

  const remove = useCallback(async (rowKey: string) => {
    setState(s => {
      const byKey = new Map(s.byKey)
      byKey.delete(rowKey)
      return { ...s, byKey, data: [...byKey.values()] }
    })
    await fetch(`/api/v1/settlement-overrides?rowKey=${encodeURIComponent(rowKey)}`, { method: 'DELETE' })
  }, [])

  return { ...state, refresh, upsert, remove }
}

/**
 * SalesRow / PurchaseRow 에 override 를 머지하는 헬퍼.
 * overrides 는 변경된 필드만 포함하므로 spread 로 단순 덮어씀.
 */
export function applyOverride<T extends object>(
  row: T,
  override?: SettlementOverride,
): T {
  if (!override?.overrides) return row
  return { ...row, ...(override.overrides as Partial<T>) }
}

/**
 * rowKey 생성 — 빌더와 동일한 규칙 사용.
 */
export function salesRowKey(month: string, campaignId: string): string {
  return `sales:${month}:${campaignId}`
}
export function purchaseRowKey(month: string, campaignId: string, media?: string): string {
  return media
    ? `purchase:${month}:${campaignId}:${media}`
    : `purchase:${month}:${campaignId}`
}
