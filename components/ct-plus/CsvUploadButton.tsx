"use client"

import { useState, useCallback, useRef } from "react"
import { parseUnifiedCsv } from "@/lib/unifiedCsvParser"
import type { RawRow } from "@/lib/rawDataParser"
import type { RawBatch } from "@/lib/rawDataStore"
import { useRawData } from "@/lib/hooks/useRawData"
import { genId } from "@/lib/idGen"
import { detectDuplicates, type DuplicateGroup } from "@/lib/rawDuplicateDetection"

// 단순 버튼 형태의 CSV 업로드 위젯.
// - 클릭 → 파일 선택 → 즉시 파싱 → addBatch
// - daily 페이지의 큰 dropzone 과 달리 preview UI 없이 바로 처리
// - 결과는 onResult 콜백으로 호출자(토스트 등) 에 전달
//
// 중복 검출 — '캠페인 / 소재 / 날짜' 세 항목이 동일한 행은 DB 에 이미 존재
// 하므로 업로드 불가. 발견 시 모달로 알리고 해당 행을 제외하고 업로드.
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = e => resolve((e.target?.result as string) || "")
    reader.onerror = () => reject(new Error("파일 읽기 실패"))
    reader.readAsText(file, "utf-8")
  })
}

interface Props {
  className?: string
  label?: string
  onResult?: (msg: { type: "success" | "error"; message: string }) => void
}

interface PendingUpload {
  fileName: string
  uniqueRows: RawRow[]
  duplicateCount: number
  groups: DuplicateGroup[]
}

export function CsvUploadButton({ className, label = "CSV 파일 추가", onResult }: Props) {
  const { addBatch, allRows } = useRawData()
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  // 중복 발견 시 사용자 확인용 모달 상태. uniqueRows 만 들고 사용자가
  // 확인을 누르면 그 묶음을 실제로 addBatch.
  const [pending, setPending] = useState<PendingUpload | null>(null)

  const doUpload = useCallback(async (fileName: string, rows: RawRow[]) => {
    const batch: RawBatch = {
      id: genId(),
      uploadedAt: new Date().toISOString(),
      fileName,
      rowCount: rows.length,
      rows,
    }
    await addBatch(batch)
    onResult?.({
      type: "success",
      message: `✓ ${rows.length.toLocaleString("ko-KR")}행 추가됨 (${fileName})`,
    })
  }, [addBatch, onResult])

  const handleFile = useCallback(async (file: File | null) => {
    if (!file) return
    setLoading(true)
    try {
      const text   = await readFileAsText(file)
      const result = parseUnifiedCsv(text, [])
      const rows   = Object.values(result.rowsByMedia).flat() as RawRow[]
      if (rows.length === 0) {
        onResult?.({ type: "error", message: "추가할 데이터가 없습니다" })
        return
      }
      const { duplicates, uniqueRows, groups } = detectDuplicates(rows, allRows)
      if (duplicates.length === 0) {
        await doUpload(file.name, uniqueRows)
        return
      }
      // 중복이 있으면 모달로 알림 — 즉시 업로드 차단.
      setPending({ fileName: file.name, uniqueRows, duplicateCount: duplicates.length, groups })
    } catch (e) {
      onResult?.({ type: "error", message: e instanceof Error ? e.message : "파싱 오류" })
    } finally {
      setLoading(false)
      if (inputRef.current) inputRef.current.value = "" // 같은 파일 재선택 허용
    }
  }, [allRows, doUpload, onResult])

  const confirmPartialUpload = useCallback(async () => {
    if (!pending) return
    const { fileName, uniqueRows } = pending
    setPending(null)
    if (uniqueRows.length === 0) {
      onResult?.({ type: "error", message: "모든 행이 이미 등록되어 있어 추가할 데이터가 없습니다" })
      return
    }
    setLoading(true)
    try {
      await doUpload(fileName, uniqueRows)
    } finally {
      setLoading(false)
    }
  }, [pending, doUpload, onResult])

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={e => handleFile(e.target.files?.[0] ?? null)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        title="네이버 GFA / 카카오모먼트 / Google / META 통합 CSV 업로드"
        className={
          className ??
          "inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        }
      >
        {loading ? (
          <>
            <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
            </svg>
            업로드 중…
          </>
        ) : (
          <>
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            {label}
          </>
        )}
      </button>

      {pending && (
        <DuplicateConfirmModal
          fileName={pending.fileName}
          duplicateCount={pending.duplicateCount}
          uniqueCount={pending.uniqueRows.length}
          groups={pending.groups}
          onCancel={() => setPending(null)}
          onConfirm={confirmPartialUpload}
        />
      )}
    </>
  )
}

function DuplicateConfirmModal({
  fileName, duplicateCount, uniqueCount, groups, onCancel, onConfirm,
}: {
  fileName: string
  duplicateCount: number
  uniqueCount: number
  groups: DuplicateGroup[]
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-2xl rounded-xl bg-white shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
          <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h3 className="text-sm font-semibold text-amber-800">중복 데이터 감지</h3>
            <p className="text-[11px] text-amber-700 mt-0.5">{fileName}</p>
          </div>
        </div>

        <div className="p-5 space-y-3">
          {/* 사용자 요청 — 행수 명시 + '중복은 제거되고 업로드됩니다' 안내 강조 */}
          <div className="rounded-lg bg-amber-50 border border-amber-300 px-4 py-3">
            <p className="text-sm font-semibold text-amber-900">
              중복 {duplicateCount.toLocaleString("ko-KR")}행은 제거되고, 신규 {uniqueCount.toLocaleString("ko-KR")}행만 업로드됩니다.
            </p>
            <p className="text-[11px] text-amber-700 mt-1">
              &lsquo;캠페인명 · 소재명 · 날짜&rsquo; 가 모두 동일한 데이터는 DB에 이미 존재하므로 업로드되지 않습니다.
            </p>
          </div>

          <p className="text-xs text-gray-600">아래 표는 중복으로 제외되는 항목 목록입니다.</p>

          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr className="text-gray-500">
                    <th className="px-3 py-2 text-left font-medium">날짜</th>
                    <th className="px-3 py-2 text-left font-medium">캠페인명</th>
                    <th className="px-3 py-2 text-left font-medium">소재명</th>
                    <th className="px-3 py-2 text-right font-medium">행</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {groups.map((g, i) => (
                    <tr key={`${g.campaignName}|${g.date}|${i}`} className="hover:bg-amber-50/40">
                      <td className="px-3 py-1.5 tabular-nums text-gray-700">{g.date}</td>
                      <td className="px-3 py-1.5 text-gray-800 max-w-[220px] truncate" title={g.campaignName}>
                        {g.campaignName}
                      </td>
                      <td className="px-3 py-1.5 text-gray-600 max-w-[220px] truncate" title={g.creativeNames.join(", ")}>
                        {g.creativeNames.length === 1
                          ? g.creativeNames[0]
                          : `${g.creativeNames[0]} 외 ${g.creativeNames.length - 1}개`}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-gray-500 font-medium">{g.rowCount}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 sticky bottom-0 border-t border-gray-200">
                  <tr>
                    <td colSpan={3} className="px-3 py-2 text-right text-gray-600 font-medium">중복 총합</td>
                    <td className="px-3 py-2 text-right text-amber-700 font-bold tabular-nums">{duplicateCount.toLocaleString("ko-KR")}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-gray-300 bg-white px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={uniqueCount === 0}
            className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            중복 제외하고 업로드
          </button>
        </div>
      </div>
    </div>
  )
}
