"use client"

/**
 * Open API 정산 스냅샷 — 행 metric 편집 모달.
 *
 * 사용자 결정 (2026-06-23) — "CRUD/Excel은 API→DB 저장/수정 흐름에 반영".
 * 레거시 Sales/PurchaseTable 의 RowEditModal 을 대체.
 * snapshot.editRow API 호출 → rowEdits 누적 저장 → UI effectiveMetrics 로 머지.
 */

import { useState, useEffect } from 'react'
import type { SnapshotRow } from '@/lib/hooks/useOpenApiSettlementSnapshot'

interface Props {
  /** 모달 표시 대상 (null 이면 모달 숨김). */
  row: SnapshotRow | null
  /** 행 라벨 — dimension 합성 문자열 (예: "Google", "5월"). */
  rowLabel: string
  /** snapshot.editRow(rowKey, edits) 콜백. */
  onSave: (rowKey: string, edits: Record<string, number>) => Promise<boolean>
  onClose: () => void
  /** 편집 가능한 metric 키 화이트리스트. 미지정 시 row.metrics 모든 키. */
  editableKeys?: string[]
  /** frozen 상태 — true 면 편집 비활성. */
  frozen?: boolean
}

const METRIC_LABEL: Record<string, string> = {
  revenue: '매출 (revenue)',
  mediaCost: '매체비 (mediaCost)',
  grossProfit: '매출총이익 (grossProfit)',
  margin: '마진 (margin)',
  dataFee: 'DMP 비용 (dataFee)',
  agencyFee: '대행 수수료 (agencyFee)',
  cost: '소진 (cost)',
}

export function SnapshotEditModal({ row, rowLabel, onSave, onClose, editableKeys, frozen }: Props) {
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (row) {
      const init: Record<string, string> = {}
      const keys = editableKeys ?? Object.keys(row.metrics)
      for (const k of keys) init[k] = String(row.metrics[k] ?? 0)
      setEdits(init)
      setErr(null)
    }
  }, [row, editableKeys])

  if (!row) return null

  async function handleSave() {
    if (!row) return
    setSaving(true)
    setErr(null)
    const numericEdits: Record<string, number> = {}
    for (const [k, v] of Object.entries(edits)) {
      const n = Number(v.replace(/,/g, ''))
      if (!Number.isFinite(n)) {
        setErr(`'${k}' 는 숫자여야 합니다.`)
        setSaving(false)
        return
      }
      numericEdits[k] = n
    }
    const ok = await onSave(row._key, numericEdits)
    setSaving(false)
    if (ok) onClose()
    else setErr('저장 실패 — 콘솔 로그 확인')
  }

  const keys = editableKeys ?? Object.keys(row.metrics)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl" onClick={e => e.stopPropagation()}>
        <header className="border-b border-gray-100 px-5 py-3.5 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">스냅샷 행 편집</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">{rowLabel}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none" aria-label="닫기">×</button>
        </header>
        <div className="p-5 space-y-3">
          {frozen && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
              🔒 확정 (frozen) 상태입니다. 편집하려면 먼저 잠금을 해제하세요.
            </div>
          )}
          {keys.map(k => (
            <div key={k}>
              <label className="text-[11px] font-medium text-gray-600">{METRIC_LABEL[k] ?? k}</label>
              <input
                type="text"
                inputMode="numeric"
                value={edits[k] ?? ''}
                disabled={frozen || saving}
                onChange={e => setEdits(prev => ({ ...prev, [k]: e.target.value }))}
                className="mt-1 w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:bg-gray-50 disabled:text-gray-400"
              />
              <p className="mt-0.5 text-[10px] text-gray-400">원본: {row.metrics[k]?.toLocaleString('ko-KR') ?? '—'}</p>
            </div>
          ))}
          {err && <p className="text-[11px] text-rose-600">{err}</p>}
        </div>
        <footer className="border-t border-gray-100 px-5 py-3 flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={saving} className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">취소</button>
          <button
            onClick={handleSave}
            disabled={frozen || saving}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >{saving ? '저장 중…' : '저장'}</button>
        </footer>
      </div>
    </div>
  )
}
