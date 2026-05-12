"use client"

import { useState, useCallback, useRef } from "react"
import { parseUnifiedCsv } from "@/lib/unifiedCsvParser"
import type { RawRow } from "@/lib/rawDataParser"
import type { RawBatch } from "@/lib/rawDataStore"
import { useRawData } from "@/lib/hooks/useRawData"
import { genId } from "@/lib/idGen"

// 단순 버튼 형태의 CSV 업로드 위젯.
// - 클릭 → 파일 선택 → 즉시 파싱 → addBatch
// - daily 페이지의 큰 dropzone 과 달리 preview UI 없이 바로 처리
// - 결과는 onResult 콜백으로 호출자(토스트 등) 에 전달
//
// daily 페이지의 [CSV 파일 추가] 영역은 그대로 유지 (의도적 — 기존 흐름 보존).
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

export function CsvUploadButton({ className, label = "CSV 파일 추가", onResult }: Props) {
  const { addBatch } = useRawData()
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)

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
      const batch: RawBatch = {
        id: genId(),
        uploadedAt: new Date().toISOString(),
        fileName: file.name,
        rowCount: rows.length,
        rows,
      }
      await addBatch(batch)
      onResult?.({
        type: "success",
        message: `✓ ${rows.length.toLocaleString("ko-KR")}행 추가됨 (${file.name})`,
      })
    } catch (e) {
      onResult?.({ type: "error", message: e instanceof Error ? e.message : "파싱 오류" })
    } finally {
      setLoading(false)
      if (inputRef.current) inputRef.current.value = "" // 같은 파일 재선택 허용
    }
  }, [addBatch, onResult])

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
    </>
  )
}
