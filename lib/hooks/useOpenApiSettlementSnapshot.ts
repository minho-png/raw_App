"use client"

/**
 * Open API 정산 스냅샷 hook — settlement_snapshots collection.
 *
 * 사용자 요청 (2026-06-22): API 정보를 DB 저장 + 수정 + CRUD.
 *
 * 워크플로우:
 *   1) refresh — 현재 month/groupBy 의 저장된 스냅샷 조회.
 *   2) capture — Open API 라이브 응답을 DB 에 저장 ("정산 진행" 버튼).
 *   3) editRow — 특정 행의 metric 수정값 저장.
 *   4) confirm/unconfirm — frozen 잠금.
 *   5) remove — 스냅샷 삭제.
 */

import { useCallback, useEffect, useState } from 'react'
import type { GroupByDim, SettlementRow } from '@/lib/openApi/settlementsTypes'

export interface SnapshotRow {
  _key: string
  dimension: unknown[]
  metrics: Record<string, number>
}

export interface SnapshotState {
  doc: {
    month: string
    groupBy: GroupByDim[]
    capturedAt?: string
    capturedBy?: string
    rows: SnapshotRow[]
    rowEdits?: Record<string, Record<string, number>>
    frozen?: boolean
    confirmedAt?: string
    confirmedBy?: string
  } | null
  loading: boolean
  error: string | null
}

interface Args {
  month: string
  groupBy: GroupByDim[]
  /** false 시 fetch 안 함 (예: motivProduct null). */
  enabled?: boolean
}

/** SettlementRow → 안정 key (dimension 노드들의 type:id 직렬화). */
export function snapshotRowKey(row: { dimension: unknown[] }): string {
  return row.dimension
    .map(n => {
      const o = n as { type?: string; id?: string; date?: string }
      return `${o.type ?? '?'}:${o.id ?? o.date ?? '?'}`
    })
    .join('|')
}

/** Open API SettlementRow[] → SnapshotRow[] (key 부여 + 평탄화). */
export function toSnapshotRows(rows: SettlementRow[]): SnapshotRow[] {
  return rows.map(r => ({
    _key: snapshotRowKey(r),
    dimension: r.dimension,
    metrics: { ...r.metrics },
  }))
}

export function useOpenApiSettlementSnapshot(args: Args) {
  const { month, groupBy, enabled = true } = args
  const groupKey = groupBy.join(',')
  const [state, setState] = useState<SnapshotState>({ doc: null, loading: enabled, error: null })

  const refresh = useCallback(async () => {
    if (!enabled || !month) {
      setState({ doc: null, loading: false, error: null })
      return
    }
    try {
      const res = await fetch(`/api/v1/openapi-settlement-snapshots?month=${encodeURIComponent(month)}&groupBy=${encodeURIComponent(groupKey)}`, { cache: 'no-store' })
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: { message?: string } } | null
        throw new Error(body?.error?.message ?? `HTTP_${res.status}`)
      }
      const { data } = await res.json() as { data: SnapshotState['doc'] }
      setState({ doc: data, loading: false, error: null })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setState(s => ({ ...s, loading: false, error: msg }))
    }
  }, [enabled, month, groupKey])

  useEffect(() => { refresh() }, [refresh])

  /** Open API 라이브 응답을 DB 에 저장 ("정산 진행"). */
  const capture = useCallback(async (rows: SettlementRow[]) => {
    const snapshotRows = toSnapshotRows(rows)
    const res = await fetch('/api/v1/openapi-settlement-snapshots', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month, groupBy, rows: snapshotRows }),
    })
    if (res.ok) await refresh()
    return res.ok
  }, [month, groupBy, refresh])

  /** 단일 행 metric 수정값 누적 저장. */
  const editRow = useCallback(async (rowKey: string, edits: Record<string, number>) => {
    const current = state.doc?.rowEdits ?? {}
    const next = { ...current, [rowKey]: { ...(current[rowKey] ?? {}), ...edits } }
    const res = await fetch('/api/v1/openapi-settlement-snapshots', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month, groupBy, rowEdits: next }),
    })
    if (res.ok) await refresh()
    return res.ok
  }, [state.doc, month, groupBy, refresh])

  const confirm = useCallback(async () => {
    const res = await fetch('/api/v1/openapi-settlement-snapshots?action=confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month, groupBy }),
    })
    if (res.ok) await refresh()
    return res.ok
  }, [month, groupBy, refresh])

  const unconfirm = useCallback(async () => {
    const res = await fetch('/api/v1/openapi-settlement-snapshots?action=unconfirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month, groupBy }),
    })
    if (res.ok) await refresh()
    return res.ok
  }, [month, groupBy, refresh])

  const remove = useCallback(async () => {
    const res = await fetch(`/api/v1/openapi-settlement-snapshots?month=${encodeURIComponent(month)}&groupBy=${encodeURIComponent(groupKey)}`, { method: 'DELETE' })
    if (res.ok) await refresh()
    return res.ok
  }, [month, groupKey, refresh])

  /** 라이브 행에 수정값 머지해서 표시용 metric 반환. */
  const effectiveMetrics = useCallback((row: { _key?: string; dimension: unknown[]; metrics: Record<string, number> }): Record<string, number> => {
    const k = row._key ?? snapshotRowKey(row)
    const edit = state.doc?.rowEdits?.[k]
    return edit ? { ...row.metrics, ...edit } : row.metrics
  }, [state.doc])

  return { ...state, refresh, capture, editRow, confirm, unconfirm, remove, effectiveMetrics }
}
