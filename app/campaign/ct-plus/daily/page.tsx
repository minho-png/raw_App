"use client"

import { useState, useEffect, useCallback, Suspense } from "react"
import type { RawRow } from "@/lib/rawDataParser"
import { parseUnifiedCsv } from "@/lib/unifiedCsvParser"
import type { RawBatch } from "@/lib/rawDataStore"
import { useRawData } from "@/lib/hooks/useRawData"
import { genId } from "@/lib/idGen"

function fmt(n: number) { return n.toLocaleString("ko-KR") }

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = e => resolve((e.target?.result as string) || "")
    reader.onerror = () => reject(new Error("파일 읽기 실패"))
    reader.readAsText(file, "utf-8")
  })
}

interface Preview {
  totalRows: number
  byMedia: { label: string; count: number; campaigns: string[] }[]
  // 전체 캠페인명 (중복 제거, 정렬됨) — 입력 당시 검증용
  allCampaigns: string[]
}

// 업로드 직전 사용자가 캠페인명·매체별 데이터를 확인할 수 있도록 강화된 패널.
// 매체별 그룹 박스 + 전체 캠페인 토글 펼침.
function PreviewPanel({ preview }: { preview: Preview }) {
  const [showAll, setShowAll] = useState(false)
  return (
    <div className="mt-3 rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-blue-900">파일 분석 결과</p>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-blue-700 font-medium">총 {fmt(preview.totalRows)}행</span>
          <span className="text-blue-300">·</span>
          <span className="text-blue-700 font-medium">캠페인 {preview.allCampaigns.length}개</span>
        </div>
      </div>

      {/* 매체별 카드 — 매체 헤더 + 캠페인명 리스트 */}
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {preview.byMedia.map(({ label, count, campaigns }) => (
          <div key={label} className="rounded bg-white border border-blue-100 px-2.5 py-1.5">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-[11px] font-semibold text-blue-800">{label}</span>
              <span className="text-[10px] text-blue-400">{fmt(count)}행 · {campaigns.length}개</span>
            </div>
            <div className="space-y-0.5">
              {campaigns.slice(0, showAll ? campaigns.length : 3).map(name => (
                <p key={name} className="text-[10px] text-gray-600 truncate" title={name}>{name}</p>
              ))}
              {!showAll && campaigns.length > 3 && (
                <p className="text-[10px] text-blue-400">+{campaigns.length - 3}개 더</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {preview.allCampaigns.length > 3 && (
        <button
          type="button"
          onClick={() => setShowAll(v => !v)}
          className="text-[11px] text-blue-600 hover:underline font-medium"
        >
          {showAll ? '캠페인명 접기 ▴' : `전체 캠페인명 ${preview.allCampaigns.length}개 펼치기 ▾`}
        </button>
      )}
    </div>
  )
}

export default function CtPlusDailyPage() {
  return <Suspense><CtPlusDailyContent /></Suspense>
}

function CtPlusDailyContent() {
  const { allRows, addBatch, clearAll } = useRawData()

  const [loading,      setLoading]      = useState(false)
  const [parseError,   setParseError]   = useState<string | null>(null)
  const [uploadFile,   setUploadFile]   = useState<File | null>(null)
  const [preview,      setPreview]      = useState<Preview | null>(null)
  const [toast,        setToast]        = useState<string | null>(null)
  const [clearConfirm, setClearConfirm] = useState(false)

  // 토스트 자동 소멸
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  // 파일 선택 → 즉시 프리뷰 파싱
  const handleFileChange = useCallback(async (file: File | null) => {
    setUploadFile(file)
    setParseError(null)
    setPreview(null)
    if (!file) return
    try {
      const text   = await readFileAsText(file)
      const result = parseUnifiedCsv(text, [])
      const rows   = Object.values(result.rowsByMedia).flat() as RawRow[]
      // R2: 매체별로 캠페인명 묶기 + 전체 캠페인 (중복 제거 + 정렬) — 업로드 직전 검증용
      const byMedia = Object.entries(result.rowsByMedia)
        .filter(([, arr]) => arr.length > 0)
        .map(([label, arr]) => {
          const camps = [...new Set((arr as RawRow[]).map(r => r.campaignName).filter(Boolean))].sort()
          return { label, count: arr.length, campaigns: camps }
        })
      const allCampaigns = [...new Set(rows.map(r => r.campaignName).filter(Boolean))].sort()
      setPreview({ totalRows: rows.length, byMedia, allCampaigns })
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "파싱 오류")
    }
  }, [])

  // 업로드 확정
  async function handleUpload() {
    if (!uploadFile || !preview) return
    setLoading(true)
    try {
      const text    = await readFileAsText(uploadFile)
      const result  = parseUnifiedCsv(text, [])
      const newRows = Object.values(result.rowsByMedia).flat() as RawRow[]
      const batch: RawBatch = {
        id: genId(),
        uploadedAt: new Date().toISOString(),
        fileName: uploadFile.name,
        rowCount: newRows.length,
        rows: newRows,
      }
      await addBatch(batch)
      setToast(`✓ ${fmt(newRows.length)}행이 추가되었습니다 (${uploadFile.name})`)
      setUploadFile(null)
      setPreview(null)
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "처리 오류")
    } finally {
      setLoading(false)
    }
  }

  async function handleClearAll() {
    await clearAll()
    setClearConfirm(false)
    setToast("전체 데이터가 초기화되었습니다")
  }

  const totalCount = allRows.length

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 토스트 */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      {/* 헤더 */}
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-gray-900">데이터 업로드</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              CSV 파일을 업로드하면 누적 저장됩니다
              {totalCount > 0 && (
                <span className="ml-2 font-medium text-blue-600">현재 {fmt(totalCount)}행</span>
              )}
            </p>
          </div>
          {allRows.length > 0 && (
            <button
              onClick={() => setClearConfirm(true)}
              className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 transition-colors"
            >
              전체 초기화
            </button>
          )}
        </div>
      </header>

      {/* 전체 초기화 확인 — QA UX-002: 2-step confirm + 명시적 경고 문구 */}
      {clearConfirm && (
        <div className="border-b-2 border-red-300 bg-red-50 px-6 py-3.5 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm text-red-700">
            <span className="font-bold">⚠ 정말로 삭제하시겠습니까?</span>
            <span className="ml-2 text-red-600">
              저장된 <span className="font-semibold">{fmt(totalCount)}행</span>이 모두 삭제되며 되돌릴 수 없습니다.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setClearConfirm(false)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
              취소
            </button>
            <button onClick={handleClearAll}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 shadow-sm">
              네, 모두 삭제합니다
            </button>
          </div>
        </div>
      )}

      <main className="p-6 space-y-6">
        {/* 업로드 카드 */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">CSV 파일 추가</h2>
          <p className="text-xs text-gray-500 mb-4">
            네이버 GFA / 카카오모먼트 / Google / META 통합 CSV를 선택하세요. 기존 데이터에 누적 추가됩니다.
          </p>

          <label className="flex flex-col items-center justify-center w-full rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 px-6 py-8 cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-colors">
            <svg className="h-8 w-8 text-gray-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            {uploadFile ? (
              <span className="text-sm font-medium text-blue-700">{uploadFile.name}</span>
            ) : (
              <span className="text-sm text-gray-400">클릭하여 CSV 파일 선택</span>
            )}
            <input type="file" accept=".csv" className="hidden"
              onChange={e => handleFileChange(e.target.files?.[0] ?? null)} />
          </label>

          {parseError && (
            <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-xs text-red-700">
              <span className="font-semibold">파싱 오류:</span> {parseError}
            </div>
          )}

          {preview && !parseError && (
            <PreviewPanel preview={preview} />
          )}

          {preview && !parseError && (
            <div className="mt-3 flex items-center gap-2">
              <button onClick={handleUpload} disabled={loading}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {loading ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    저장 중...
                  </>
                ) : (
                  <>데이터 추가 ({fmt(preview.totalRows)}행)</>
                )}
              </button>
              <button onClick={() => { setUploadFile(null); setPreview(null); setParseError(null) }}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                취소
              </button>
            </div>
          )}
        </div>

        {/* 전일/당일 비교표는 상세 분석 페이지(/status/[id]) 의 '일별' 탭으로 이동.
            본 페이지는 업로드(preview) 에 집중. */}

        {/* R2: 매체별 탭 + DailyDataTable 제거.
            업로드 직전에 보이는 PreviewPanel 만 노출.
            전체 raw 데이터가 필요하면 캠페인 상세분석(status/[id]) 의 RAW 탭 이용. */}
      </main>
    </div>
  )
}
