'use client'

/**
 * useRawData.ts
 * raw CSV 배치 데이터를 MongoDB에서 읽고 쓰는 훅.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { RawRow } from '@/lib/rawDataParser'
import type { RawBatch } from '@/lib/rawDataStore'

const LS_KEY = 'ct-plus-raw-batches-v1'

function lsRead(): RawBatch[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? (JSON.parse(raw) as RawBatch[]) : []
  } catch { return [] }
}

function lsWrite(batches: RawBatch[]): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(batches)) } catch {}
}

async function fetchBatches(): Promise<RawBatch[]> {
  try {
    const res = await fetch('/api/v1/raw-data', { cache: 'no-store' })
    if (!res.ok) return []
    const json = await res.json()
    return (json.batches ?? []) as RawBatch[]
  } catch { return [] }
}

async function postBatch(batch: RawBatch): Promise<void> {
  try {
    await fetch('/api/v1/raw-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    })
  } catch {}
}

async function deleteAllBatches(): Promise<void> {
  try {
    await fetch('/api/v1/raw-data', { method: 'DELETE' })
  } catch {}
}

export interface RawDataHook {
  batches: RawBatch[]
  allRows: RawRow[]
  loading: boolean
  /** 배치 1개 추가 → localStorage + MongoDB 동시 저장 */
  addBatch: (batch: RawBatch) => Promise<void>
  /** 배치 1개 업데이트 (같은 id로 교체) → localStorage + MongoDB */
  updateBatch: (batch: RawBatch) => Promise<void>
  /** 전체 초기화 → localStorage + MongoDB 동시 삭제 */
  clearAll: () => Promise<void>
  /** MongoDB에서 강제 재조회 */
  refresh: () => Promise<void>
}

export function useRawData(): RawDataHook {
  const [batches, setBatches] = useState<RawBatch[]>([])
  const [loading, setLoading] = useState(true)

  const loadAll = useCallback(async () => {
    setBatches(lsRead())
    const remote = await fetchBatches()
    if (remote.length > 0) {
      setBatches(remote)
      lsWrite(remote)
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const addBatch = useCallback(async (batch: RawBatch) => {
    const prev = lsRead().filter(b => b.id !== batch.id)
    const updated = [...prev, batch]
    setBatches(updated)
    lsWrite(updated)
    await postBatch(batch)
    const remote = await fetchBatches()
    if (remote.length > 0) {
      setBatches(remote)
      lsWrite(remote)
    }
  }, [])

  const updateBatch = useCallback(async (batch: RawBatch) => {
    const prev = lsRead().filter(b => b.id !== batch.id)
    const updated = [...prev, batch]
    setBatches(updated)
    lsWrite(updated)
    await postBatch(batch)
    const remote = await fetchBatches()
    if (remote.length > 0) {
      setBatches(remote)
      lsWrite(remote)
    }
  }, [])

  const clearAll = useCallback(async () => {
    setBatches([])
    lsWrite([])
    await deleteAllBatches()
  }, [])

  const allRows = useMemo(() => batches.flatMap(b => b.rows), [batches])

  return { batches, allRows, loading, addBatch, updateBatch, clearAll, refresh: loadAll }
}
