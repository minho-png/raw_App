"use client"

import { useState, useEffect, useMemo, useCallback, Suspense } from "react"
import DailyDataTable from "@/components/ct-plus/DailyDataTable"
import type { RawRow } from "@/lib/rawDataParser"
import { MEDIA_CONFIG } from "@/lib/reportTypes"
import type { MediaType } from "@/lib/reportTypes"
import { parseUnifiedCsv } from "@/lib/unifiedCsvParser"
import type { RawBatch } from "@/lib/rawDataStore"
import { useRawData } from "@/lib/hooks/useRawData"

function fmt(n: number) { return n.toLocaleString("ko-KR") }

const MEDIA_LABEL_TO_TYPE: Record<string, MediaType> = {
  "네이버 GFA": "naver",
  "카카오모먼트": "kakao",
  "Google": "google",
  "META": "meta",
}

// ── 파일 읽기 헬퍼 ──────────────────────────────────────────
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = e => resolve((e.target?.result as string) || "")
    reader.onerror = () => reject(new Error("파일 읽기 실패"))
    reader.readAsText(file, "utf-8")
  })
}

// ── 업로드 프리뷰 타입 ──────────────────────────────────────
interface Preview {
  totalRows: number
  byMedia: { label: string; count: number }[]
  campaignNames: string[]
}

export default function CtPlusDailyPage() {
  return <Suspense><CtPlusDailyContent /></Suspense>
}

function CtPlusDailyContent() {
  const { allRows, loading: rawLoading, addBatch, clearAll } = useRawData()
  const [activeTab,    setActiveTab]    = useState<MediaType | null>(null)
  const [loading,      setLoading]      = useState(false)
  const [parseError,   setParseError]   = useState<string | null>(null)
  const [uploadFile,   setUploadFile]   = useState<File | null>(null)
  const [preview,      setPreview]      = useState<Preview | null>(null)
  const [toast,        setToast]        = useState<string | null>(null)
  const [clearConfirm, setClearConfirm] = useState(false)

  // MongoDB 로드 완료 후 첫 탭 자동 선택
  useEffect(() => {
    if (rawLoading || allRows.length === 0 || activeTab) return
    const medias = [...new Set(allRows.map(r => r.media))]
    const firstMediaType = MEDIA_LABEL_TO_TYPE[medias[0]]
    if (firstMediaType) setActiveTab(firstMediaType)
  }, [rawLoading, allRows, activeTab])

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
      const byMedia = Object.entries(result.rowsByMedia)
        .filter(([, arr]) => arr.length > 0)
        .map(([label, arr]) => ({ label, count: arr.length }))
      const names = [...new Set(rows.map(r => r.campaignName).filter(Boolean))].slice(0, 8)
      setPreview({ totalRows: rows.length, byMedia, campaignNames: names })
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
        id: Date.now().toString(),
        uploadedAt: new Date().toISOString(),
        fileName: uploadFile.name,
        rowCount: newRows.length,
        rows: newRows,
      }
      // localStorage + MongoDB 동시 저장
      await addBatch(batch)
      // 첫 탭 세팅
      if (!activeTab) {
        const firstLabel = preview.byMedia[0]?.label
        const firstType  = firstLabel ? MEDIA_LABEL_TO_TYPE[firstLabel] : null
        if (firstType) setActiveTab(firstType)
      }
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
    setActiveTab(null)
    setClearConfirm(false)
    setToast("전체 데이터가 초기화되었습니다")
  }

  // rowsByMedia 계산
  const rowsByMedia = useMemo(() => {
    const result: Partial<Record<MediaType, RawRow[]>> = {}
    for (const row of allRows) {
      const mt = MEDIA_LABEL_TO_TYPE[row.media]
      if (!mt) continue
      if (!result[mt]) result[mt] = []
      result[mt]!.push(row)
    }
    return result
  }, [allRows])

  const activeMediaTypes = Object.keys(rowsByMedia) as MediaType[]
  const activeRows = activeTab ? (rowsByMedia[activeTab] ?? []) : []
  const totalCount = allRows.length

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 토스트 */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm text-white shadow-lg animate-fade-in">
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

      {/* 전체 초기화 확인 */}
      {clearConfirm && (
        <div className="border-b border-red-200 bg-red-50 px-6 py-3 flex items-center justify-between">
          <p className="text-sm text-red-700">
            <span className="font-semibold">전체 데이터 삭제</span>
            <span className="ml-2 text-red-600">{fmt(totalCount)}행이 모두 삭제됩니다. 되돌릴 수 없습니다.</span>
          </p>
          <div className="flex items-center gap-2">
            <button onClick={() => setClearConfirm(false)} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">취소</button>
            <button onClick={handleClearAll} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700">삭제 확인</button>
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

          {/* 파일 선택 드롭존 */}
          <label className="flex flex-col items-center justify-center w-full rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 px-6 py-8 cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-colors">
            <svg className="h-8 w-8 text-gray-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            {uploadFile ? (
              <span className="text-sm font-medium text-blue-700">{uploadFile.name}</span>
            ) : (
              <span className="text-sm text-gray-400">클릭하여 CSV 파일 선택</span>
            )}
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={e => handleFileChange(e.target.files?.[0] ?? null)}
            />
          </label>

          {/* 파싱 오류 */}
          {parseError && (
            <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-xs text-red-700">
              <span className="font-semibold">파싱 오류:</span> {parseError}
            </div>
          )}

          {/* 프리뷰 */}
          {preview && !parseError && (
            <div className="mt-3 rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-blue-900">파일 분석 결과</p>
                <span className="text-xs text-blue-600 font-medium">{fmt(preview.totalRows)}행 감지됨</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {preview.byMedia.map(({ label, count }) => (
                  <span key={label} className="inline-flex items-center gap-1 rounded-full bg-white border border-blue-200 px-2.5 py-0.5 text-[11px] font-medium text-blue-700">
                    {label} <span className="text-blue-400">{fmt(count)}행</span>
                  </span>
                ))}
              </div>
              {preview.campaignNames.length > 0 && (
                <div className="text-[11px] text-blue-600">
                  캠페인명: {preview.campaignNames.join(", ")}
                  {preview.campaignNames.length >= 8 && " …"}
                </div>
              )}
            </div>
          )}

          {/* 업로드 확정 버튼 */}
          {preview && !parseError && (
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={handleUpload}
                disabled={loading}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
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
              <button
                onClick={() => { setUploadFile(null); setPreview(null); setParseError(null) }}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                취소
              </button>
            </div>
          )}
        </div>

        {/* 데이터 테이블 */}
        {allRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="rounded-full bg-gray-100 p-6 mb-4">
              <svg className="h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500">아직 업로드된 데이터가 없습니다</p>
            <p className="text-xs text-gray-400 mt-1">위 영역에서 CSV 파일을 선택하면 자동으로 분석됩니다</p>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            {/* 매체 탭 */}
            <div className="border-b border-gray-100 bg-white px-4 flex gap-1 pt-2">
              {activeMediaTypes.map(mt => (
                <button
                  key={mt}
                  onClick={() => setActiveTab(mt)}
                  className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                    activeTab === mt
                      ? "border-blue-600 text-blue-700 bg-blue-50"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {MEDIA_CONFIG[mt]?.label ?? mt}
                  <span className="ml-1.5 text-xs text-gray-400">({fmt(rowsByMedia[mt]?.length ?? 0)})</span>
                </button>
              ))}
            </div>
            <div className="p-4">
              {activeTab && (
                <DailyDataTable rows={activeRows} media={activeTab} onRowUpdate={() => {}} />
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
