'use client'

/**
 * useRawData.ts
 * raw CSV 배치 데이터를 MongoDB에서 읽고 쓰는 훅.
 * useMasterData와 동일한 하이브리드 패턴:
 *   1) localStorage 즉시 표시 (UX 빠른 응답)
 *   2) MongoDB fetch 후 덮어쓰기 (소스 오브 트루스)
 */

import { useState, useEffect, useCallback } from 'react'
import type { RawRow } from '@/lib/rawDataParser'
import type { RawBatch } from '@/lib/rawDataStore'

const LS_KEY = 'ct-plus-raw-batches-v1'

// ── localStorage 헬퍼 ──────────────────────────────────
function lsRead(): RawBatch[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? (JSON.parse(raw) as RawBatch[]) : []
  } catch { return [] }
}

function lsWrite(batches: RawBatch[]): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(batches)) } catch {}
}

// ── MongoDB API 헬퍼 ───────────────────────────────────
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

// ── 훅 ────────────────────────────────────────────────
export interface RawDataHook {
  batches: RawBatch[]
  allRows: RawRow[]
  loading: boolean
  /** 배치 1개 추가 → localStorage + MongoDB 동시 저장 */
  addBatch: (batch: RawBatch) => Promise<void>
  /** 전체 초기화 → localStorage + MongoDB 동시 삭제 */
  clearAll: () => Promise<void>
  /** MongoDB에서 강제 재조회 */
  refresh: () => Promise<void>
}

export function useRawData(): RawDataHook {
  const [batches, setBatches] = useState<RawBatch[]>([])
  const [loading, setLoading] = useState(true)

  const loadAll = useCallback(async () => {
    // 1. 로컬스토리지 즉시 표시
    setBatches(lsRead())

    // 2. MongoDB에서 가져와 덮어쓰기
    const remote = await fetchBatches()
    if (remote.length > 0) {
      setBatches(remote)
      lsWrite(remote)
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const addBatch = useCallback(async (batch: RawBatch) => {
    // 로컬 즉시 반영
    const prev = lsRead().filter(b => b.id !== batch.id)
    const updated = [...prev, batch]
    setBatches(updated)
    lsWrite(updated)

    // MongoDB 저장 후 재조회로 동기화
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

  const allRows: RawRow[] = batches.flatMap(b => b.rows)

  return { batches, allRows, loading, addBatch, clearAll, refresh: loadAll }
}
