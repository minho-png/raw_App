"use client"

import { useState, useEffect, useMemo, Suspense } from "react"
import DailyDataTable from "@/components/ct-plus/DailyDataTable"
import type { RawRow } from "@/lib/rawDataParser"
import { MEDIA_CONFIG } from "@/lib/reportTypes"
import type { MediaType } from "@/lib/reportTypes"
import { parseUnifiedCsv } from "@/lib/unifiedCsvParser"
import { saveRawBatch, loadAllRawRows, clearAllRawData } from "@/lib/rawDataStore"
import type { RawBatch } from "@/lib/rawDataStore"

function fmt(n: number) { return n.toLocaleString('ko-KR') }

export default function CtPlusDailyPage() {
  return <Suspense><CtPlusDailyContent /></Suspense>
}

function CtPlusDailyContent() {
  const [allRows, setAllRows] = useState<RawRow[]>([])
  const [activeTab, setActiveTab] = useState<MediaType | null>(null)
  const [loading, setLoading] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)

  // 초기 로드: 모든 raw rows
  useEffect(() => {
    const rows = loadAllRawRows()
    setAllRows(rows)
    // 첫 탭 자동 선택
    if (rows.length > 0) {
      const medias = [...new Set(rows.map(r => r.media))]
      // media → MediaType 매핑
      const mediaTypeMap: Record<string, MediaType> = {
        '네이버 GFA': 'naver',
        '카카오모먼트': 'kakao',
        'Google': 'google',
        'META': 'meta',
      }
      const firstMedia = medias[0]
      const firstMediaType = mediaTypeMap[firstMedia]
      if (firstMediaType) setActiveTab(firstMediaType)
    }
  }, [])

  // rowsByMedia: allRows를 MediaType별로 그룹화
  const rowsByMedia = useMemo(() => {
    const MEDIA_LABEL_TO_TYPE: Record<string, MediaType> = {
      '네이버 GFA': 'naver',
      '카카오모먼트': 'kakao',
      'Google': 'google',
      'META': 'meta',
    }
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

  async function handleProcess() {
    if (!uploadFile) return
    setLoading(true)
    setParseError(null)
    try {
      const text = await readFileAsText(uploadFile)
      const result = parseUnifiedCsv(text, [])
      const newRows = Object.values(result.rowsByMedia).flat() as RawRow[]
      const batch: RawBatch = {
        id: Date.now().toString(),
        uploadedAt: new Date().toISOString(),
        fileName: uploadFile.name,
        rowCount: newRows.length,
        rows: newRows,
      }
      saveRawBatch(batch)
      // 전체 rows 다시 로드
      const updated = loadAllRawRows()
      setAllRows(updated)
      const MEDIA_LABEL_TO_TYPE: Record<string, MediaType> = {
        '네이버 GFA': 'naver',
        '카카오모먼트': 'kakao',
        'Google': 'google',
        'META': 'meta',
      }
      if (!activeTab) {
        const newMediaTypes = Object.keys(result.rowsByMedia)
        const firstMedia = newMediaTypes[0]
        const firstMediaType = MEDIA_LABEL_TO_TYPE[firstMedia]
        if (firstMediaType) setActiveTab(firstMediaType)
      }
      setShowUpload(false)
      setUploadFile(null)
    } catch (e) {
      const msg = e instanceof Error ? e.message : '파싱 오류'
      setParseError(msg)
    } finally {
      setLoading(false)
    }
  }

  function handleClearAll() {
    if (!confirm('모든 raw 데이터를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return
    clearAllRawData()
    setAllRows([])
    setActiveTab(null)
  }

  const activeRows = activeTab ? (rowsByMedia[activeTab] ?? []) : []
  const totalCount = allRows.length

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-gray-900">데이터 입력</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Raw CSV 누적 테이블
              {totalCount > 0 && <span className="ml-2 text-blue-600 font-medium">총 {fmt(totalCount)}행</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {allRows.length > 0 && (
              <button
                onClick={handleClearAll}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 transition-colors"
              >
                전체 초기화
              </button>
            )}
            <button
              onClick={() => setShowUpload(v => !v)}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              ↑ CSV 업로드
            </button>
          </div>
        </div>
      </header>

      {/* 업로드 패널 (토글) */}
      {showUpload && (
        <div className="border-b border-gray-200 bg-white px-6 py-4">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">통합 CSV 파일 선택</label>
              <input
                type="file"
                accept=".csv"
                onChange={e => setUploadFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>
            <button
              onClick={handleProcess}
              disabled={!uploadFile || loading}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? '처리 중...' : '업로드'}
            </button>
            <button
              onClick={() => {
                setShowUpload(false)
                setUploadFile(null)
                setParseError(null)
              }}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              취소
            </button>
          </div>
          {parseError && (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{parseError}</p>
          )}
        </div>
      )}

      <main className="p-6">
        {allRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="rounded-full bg-gray-100 p-6 mb-4">
              <svg className="h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500">업로드된 데이터가 없습니다</p>
            <p className="text-xs text-gray-400 mt-1">우측 상단의 CSV 업로드 버튼을 눌러 데이터를 추가하세요</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 매체 탭 */}
            <div className="flex gap-1 border-b border-gray-200 pb-0">
              {activeMediaTypes.map(mt => (
                <button
                  key={mt}
                  onClick={() => setActiveTab(mt)}
                  className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                    activeTab === mt
                      ? 'border-blue-600 text-blue-700 bg-blue-50'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {MEDIA_CONFIG[mt]?.label ?? mt}
                  <span className="ml-1.5 text-xs text-gray-400">({(rowsByMedia[mt] ?? []).length})</span>
                </button>
              ))}
            </div>

            {/* 테이블 */}
            {activeTab && (
              <DailyDataTable rows={activeRows} media={activeTab} onRowUpdate={() => {}} />
            )}
          </div>
        )}
      </main>
    </div>
  )
}

// Helper: FileReader로 텍스트 읽기
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve((e.target?.result as string) || '')
    reader.onerror = () => reject(new Error('파일 읽기 실패'))
    reader.readAsText(file, 'utf-8')
  })
}
