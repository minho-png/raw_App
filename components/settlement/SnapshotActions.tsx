"use client"

/**
 * Open API 정산 스냅샷 액션 버튼 그룹 — 4페이지 공통 UI.
 *
 * media-cost 에 적용한 패턴(PR #150)을 컴포넌트로 추출.
 * 상태별 노출: [💾 정산 진행 / ✓ 확정 / 🔓 잠금 해제] + DB 상태 배지.
 */

import type { SnapshotState } from '@/lib/hooks/useOpenApiSettlementSnapshot'
import type { SettlementRow } from '@/lib/openApi/settlementsTypes'
import { downloadSnapshotExcel } from '@/lib/export/snapshotExcel'

interface Props {
  snapshot: SnapshotState & {
    capture: (rows: SettlementRow[]) => Promise<boolean>
    confirm: () => Promise<boolean>
    unconfirm: () => Promise<boolean>
    effectiveMetrics: (row: { dimension: unknown[]; metrics: Record<string, number> }) => Record<string, number>
  }
  /** 라이브 Open API 응답 — 정산 진행 시 capture 인자. */
  liveRows: SettlementRow[]
  /** Excel 다운로드 파일명 (확장자 .xlsx 자동 추가). */
  excelFilename?: string
}

export function SnapshotStatusBadge({ doc }: { doc: SnapshotState['doc'] }) {
  if (!doc) return null
  if (doc.frozen) {
    return (
      <span
        className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800"
        title={`확정자: ${doc.confirmedBy ?? '—'} · ${doc.confirmedAt?.slice(0, 16) ?? ''}`}
      >🔒 DB 확정</span>
    )
  }
  return (
    <span
      className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700"
      title={`저장자: ${doc.capturedBy ?? '—'} · ${doc.capturedAt?.slice(0, 16) ?? ''}`}
    >💾 DB 저장됨</span>
  )
}

export function SnapshotActions({ snapshot, liveRows, excelFilename }: Props) {
  const hasData = !!snapshot.doc?.rows?.length || liveRows.length > 0
  function handleExcel() {
    // 저장된 스냅샷이 있으면 그 값, 없으면 라이브 응답 기준. effectiveMetrics 적용.
    const src = snapshot.doc?.rows ?? liveRows
    downloadSnapshotExcel(
      src as unknown as { _key?: string; dimension: unknown[]; metrics: Record<string, number> }[],
      excelFilename ?? `snapshot_${new Date().toISOString().slice(0, 10)}`,
      snapshot.effectiveMetrics,
    )
  }
  return (
    <>
      {!snapshot.doc?.frozen && liveRows.length > 0 && (
        <button
          onClick={() => snapshot.capture(liveRows)}
          disabled={snapshot.loading}
          className="rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          title="현재 API 응답을 DB 에 저장 (다음 진입 시 이 값 우선 표시 + 수정 가능)"
        >💾 정산 진행 (DB 저장)</button>
      )}
      {snapshot.doc && !snapshot.doc.frozen && (
        <button
          onClick={() => snapshot.confirm()}
          className="rounded bg-blue-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-blue-700"
        >✓ 확정</button>
      )}
      {snapshot.doc?.frozen && (
        <button
          onClick={() => snapshot.unconfirm()}
          className="rounded bg-amber-500 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-amber-600"
        >🔓 잠금 해제</button>
      )}
      {hasData && (
        <button
          onClick={handleExcel}
          className="rounded border border-gray-300 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
          title="현재 표(스냅샷 + rowEdits)를 Excel(.xlsx) 로 다운로드"
        >📥 Excel</button>
      )}
    </>
  )
}
