"use client"

import { useState, useEffect, useMemo, Suspense } from "react"
import Link from "next/link"
import UnifiedCsvUploadCard from "@/components/ct-plus/UnifiedCsvUploadCard"
import DailyDataTable from "@/components/ct-plus/DailyDataTable"
import type { RawRow } from "@/lib/rawDataParser"
import { MEDIA_CONFIG } from "@/lib/reportTypes"
import type { MediaType } from "@/lib/reportTypes"
import { parseUnifiedCsv } from "@/lib/unifiedCsvParser"
import { useReports } from "@/lib/hooks/useReports"
import type { SavedReport, SaveProgress } from "@/lib/hooks/useReports"
import { saveRawBatch } from "@/lib/rawDataStore"
import type { RawBatch } from "@/lib/rawDataStore"

function fmt(n: number) { return n.toLocaleString('ko-KR') }

function makeLabel(
  rowsByMedia: Partial<Record<MediaType, RawRow[]>>,
  mediaTypes: MediaType[],
): string {
  const allDates = mediaTypes.flatMap(m => (rowsByMedia[m] ?? []).map(r => r.date)).sort()
  const dateRange = allDates.length
    ? allDates[0] === allDates[allDates.length - 1]
      ? allDates[0]
      : `${allDates[0]} ~ ${allDates[allDates.length - 1]}`
    : ''
  const mediaStr = mediaTypes.map(m => MEDIA_CONFIG[m].label).join(', ')
  return [dateRange, mediaStr].filter(Boolean).join(' · ')
}

/** 저장된 리포트에서 날짜 범위 추출 */
function extractDateRange(r: SavedReport): string {
  if (r.chunked) {
    // label 파싱: "2025.01.01 ~ 2025.01.31 · 캠페인 · 구글" 형식
    const match = r.label.match(/(\d{4}[-./]\d{2}[-./]\d{2})\s*[~–]\s*(\d{4}[-./]\d{2}[-./]\d{2})/)
    if (match) return `${match[1]} ~ ${match[2]}`
    const single = r.label.match(/(\d{4}[-./]\d{2}[-./]\d{2})/)
    if (single) return single[1]
    return '-'
  }
  const allDates = r.mediaTypes.flatMap(m => (r.rowsByMedia[m] ?? []).map(row => row.date)).sort()
  if (!allDates.length) return '-'
  if (allDates[0] === allDates[allDates.length - 1]) return allDates[0]
  return `${allDates[0]} ~ ${allDates[allDates.length - 1]}`
}

function fmtSavedAt(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export default function CtPlusDailyPage() {
  return (
    <Suspense>
      <CtPlusDailyContent />
    </Suspense>
  )
}

// ── 모드 타입 ──────────────────────────────────────────────────
type PageMode = 'browse' | 'upload' | 'view'

function CtPlusDailyContent() {
  const [mode, setMode] = useState<PageMode>('browse')

  const [unifiedFile, setUnifiedFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)

  const { reports: savedReports, saveReport, deleteReport, expandReport, mergeReport } = useReports()

  // 결과 데이터
  const [rowsByMedia, setRowsByMedia] = useState<Partial<Record<MediaType, RawRow[]>>>({})
  const [activeTab, setActiveTab] = useState<MediaType | null>(null)

  // 로컬 편집용 행 상태
  const [localRowsByMedia, setLocalRowsByMedia] = useState<Partial<Record<MediaType, RawRow[]>>>({})

  const [savedToast, setSavedToast] = useState(false)
  const [saveProgressLocal, setSaveProgressLocal] = useState<SaveProgress | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [mergeToast, setMergeToast] = useState<{ count: number; show: boolean }>({ count: 0, show: false })
  const [detectedHints, setDetectedHints] = useState<string[]>([])
  const [selectedCsvCampaigns, setSelectedCsvCampaigns] = useState<Set<string>>(new Set())

  // ── CSV 파싱 ─────────────────────────────────────────────────
  async function handleProcess() {
    if (!unifiedFile) return
    setLoading(true)
    setParseError(null)
    try {
      const text = await readFileAsText(unifiedFile)
      // raw 파싱만 (마크업 미적용 — 캠페인 배열 빈 상태로 호출)
      const result = parseUnifiedCsv(text, [])

      // raw rows를 로컬스토리지에 저장 (마크업 미적용)
      const allRawRows = Object.values(result.rowsByMedia).flat() as typeof result.rowsByMedia[MediaType]
      const batch: RawBatch = {
        id: Date.now().toString(),
        uploadedAt: new Date().toISOString(),
        fileName: unifiedFile.name,
        rowCount: allRawRows?.length ?? 0,
        rows: allRawRows ?? [],
      }
      saveRawBatch(batch)

      // raw rows 그대로 표시 (마크업 미적용)
      setRowsByMedia(result.rowsByMedia)
      setLocalRowsByMedia(result.rowsByMedia)
      setDetectedHints(result.detectedAdvertiserHints ?? [])
      const mediaKeys = Object.keys(result.rowsByMedia) as MediaType[]
      setActiveTab(mediaKeys[0] ?? null)
      if (result.skippedMediaCodes.length > 0) {
        console.warn('[CSV] 알 수 없는 매체 코드:', result.skippedMediaCodes)
      }
      setMode('view')
    } catch (e) {
      const msg = e instanceof Error ? e.message : '파싱 오류'
      setParseError(msg)
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  // ── 리포트 저장 ───────────────────────────────────────────────
  async function handleSaveReport() {
    const mediaTypes = Object.keys(rowsByMedia) as MediaType[]
    const dataToSave = localRowsByMedia && Object.keys(localRowsByMedia).length > 0 ? localRowsByMedia : rowsByMedia

    const report: SavedReport = {
      id: Date.now().toString(),
      savedAt: new Date().toISOString(),
      label: makeLabel(dataToSave, mediaTypes),
      campaignName: null,
      mediaTypes,
      rowsByMedia: dataToSave,
      campaign: null,
      detectedAdvertiserHints: detectedHints.length > 0 ? detectedHints : undefined,
      detectedCampaignNames: (() => {
        const names = new Set<string>()
        for (const rows of Object.values(dataToSave)) {
          rows?.forEach(r => { if (r.campaignName) names.add(r.campaignName) })
        }
        return names.size > 0 ? Array.from(names) : undefined
      })(),
    }

    const { mergedReports, overwrittenCount } = mergeReport(report, savedReports)

    if (overwrittenCount > 0) {
      setMergeToast({ count: overwrittenCount, show: true })
      setTimeout(() => setMergeToast({ count: 0, show: false }), 4000)
    }

    const newReports = mergedReports.filter(r => r.id === report.id)
    if (newReports.length > 0) {
      await saveReport(newReports[0], (p) => setSaveProgressLocal(p))
    } else {
      for (const merged of mergedReports) {
        await saveReport(merged, (p) => setSaveProgressLocal(p))
      }
    }

    if (saveProgressLocal?.phase !== 'error') {
      setSavedToast(true)
      setTimeout(() => setSavedToast(false), 4000)
    }
  }

  // ── 리포트 불러오기 ───────────────────────────────────────────
  async function handleLoadReport(r: SavedReport) {
    if (r.chunked) {
      setLoading(true)
      const full = await expandReport(r.id)
      setLoading(false)
      if (full) {
        setRowsByMedia(full.rowsByMedia)
        setLocalRowsByMedia(full.rowsByMedia)
        setActiveTab(full.mediaTypes[0] ?? null)
      }
    } else {
      setRowsByMedia(r.rowsByMedia)
      setLocalRowsByMedia(r.rowsByMedia)
      setActiveTab(r.mediaTypes[0] ?? null)
    }
    setUnifiedFile(null)
    setDetectedHints(r.detectedAdvertiserHints ?? [])
    setMode('view')
  }

  async function handleDeleteReport(id: string) {
    await deleteReport(id)
  }

  // ── 현재 탭 고유 캠페인명 ─────────────────────────────────────
  const activeCampaignNames = useMemo(() => {
    if (!activeTab) return []
    const rows = rowsByMedia[activeTab] ?? []
    const names = new Set(rows.map(r => r.campaignName).filter(Boolean))
    return Array.from(names).sort()
  }, [activeTab, rowsByMedia])

  useEffect(() => {
    setSelectedCsvCampaigns(new Set())
  }, [activeTab])

  const activeRows = useMemo(() => {
    if (!activeTab) return []
    const source = localRowsByMedia && Object.keys(localRowsByMedia).length > 0 ? localRowsByMedia : rowsByMedia
    const rows = source[activeTab] ?? []
    if (selectedCsvCampaigns.size === 0) return rows
    return rows.filter(r => selectedCsvCampaigns.has(r.campaignName))
  }, [activeTab, rowsByMedia, localRowsByMedia, selectedCsvCampaigns])

  const handleRowUpdate = (rowIndex: number, field: string, value: number) => {
    if (!activeTab) return
    setLocalRowsByMedia(prev => {
      const current = prev[activeTab] ?? []
      const updated = [...current]
      if (updated[rowIndex]) {
        updated[rowIndex] = { ...updated[rowIndex], [field]: value }
      }
      return { ...prev, [activeTab]: updated }
    })
  }

  const activeMediaTypes = Object.keys(rowsByMedia) as MediaType[]

  // ── 브라우즈 모드로 복귀 ─────────────────────────────────────
  function goToBrowse() {
    setMode('browse')
    setRowsByMedia({})
    setLocalRowsByMedia({})
    setActiveTab(null)
    setUnifiedFile(null)
    setDetectedHints([])
    setSelectedCsvCampaigns(new Set())
  }

  function goToUpload() {
    setMode('upload')
    setUnifiedFile(null)
    setParseError(null)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── 헤더 ────────────────────────────────────────────── */}
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-gray-900">데이터 입력</h1>
            <p className="text-xs text-gray-400 mt-0.5">캠페인 리포트 · CT+ · 데이터 입력</p>
          </div>

          {mode === 'browse' && (
            <button
              onClick={goToUpload}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              새 CSV 업로드
            </button>
          )}

          {mode === 'upload' && (
            <button
              onClick={goToBrowse}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              ← 목록으로
            </button>
          )}

          {mode === 'view' && (
            <div className="flex items-center gap-2">
              <button
                onClick={goToBrowse}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
              >
                ← 목록으로
              </button>
              <div className="relative">
                <button
                  onClick={handleSaveReport}
                  disabled={saveProgressLocal?.phase === 'saving'}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                  </svg>
                  {saveProgressLocal?.phase === 'saving' ? '저장 중...' : '리포트 저장'}
                </button>
                {saveProgressLocal && saveProgressLocal.phase === 'saving' && (
                  <div className="absolute right-0 top-full mt-1.5 w-56 rounded-lg border border-gray-200 bg-white px-3 py-2.5 shadow-lg z-10">
                    <p className="text-[11px] text-gray-600 mb-1.5">{saveProgressLocal.message}</p>
                    <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-500 transition-all duration-300"
                        style={{ width: `${saveProgressLocal.total > 0 ? Math.round(saveProgressLocal.current / saveProgressLocal.total * 100) : 0}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[10px] text-gray-400 text-right">
                      {saveProgressLocal.current} / {saveProgressLocal.total} 청크
                    </p>
                  </div>
                )}
                {saveProgressLocal?.phase === 'done' && (
                  <div className="absolute right-0 top-full mt-1.5 rounded-lg bg-gray-800 px-3 py-2 text-[11px] text-white shadow-lg z-10">
                    {saveProgressLocal.message} ✓
                  </div>
                )}
                {mergeToast.show && (
                  <div className="absolute right-0 top-full mt-1.5 rounded-lg bg-blue-600 px-3 py-2 text-[11px] text-white shadow-lg z-10">
                    {mergeToast.count}개 행이 기존 데이터에 덮어쓰기되었습니다.
                  </div>
                )}
                {savedToast && !saveProgressLocal && (
                  <div className="absolute right-0 top-full mt-1.5 rounded-lg bg-gray-800 px-3 py-2 text-[11px] text-white shadow-lg z-10 flex items-center gap-3">
                    <span>저장되었습니다 ✓</span>
                    <Link href="/campaign/ct-plus/report" className="rounded bg-white/20 px-2 py-0.5 text-white hover:bg-white/30">
                      리포트 보기 →
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="p-6 space-y-6">

        {/* ══════════════════════════════════════════════════════
            BROWSE MODE — 저장된 CSV 캠페인/매체 선택 표
            ══════════════════════════════════════════════════ */}
        {mode === 'browse' && (
          <div>
            {savedReports.length === 0 ? (
              /* 빈 상태 */
              <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white py-20 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
                  <svg className="h-7 w-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-gray-700">저장된 데이터가 없습니다</p>
                <p className="mt-1 text-xs text-gray-400">CSV 파일을 업로드하여 데이터를 추가하세요.</p>
                <button
                  onClick={goToUpload}
                  className="mt-5 flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  CSV 파일 업로드
                </button>
              </div>
            ) : (
              /* 저장 리포트 선택 표 */
              <>
                {/* 안내 메시지 */}
                <div className="flex items-center gap-3 px-1 mb-3">
                  <span className="text-[11px] text-orange-500">미연결 데이터는 캠페인 관리 페이지에서 CSV명을 연결해주세요</span>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                  <div className="border-b border-gray-100 px-5 py-3.5 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">저장된 데이터</p>
                    <p className="text-xs text-gray-400 mt-0.5">항목을 선택하면 해당 데이터를 불러옵니다.</p>
                  </div>
                  <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                    {savedReports.length}개
                  </span>
                </div>

                {/* 표 헤더 */}
                <div className="grid grid-cols-[2fr_1fr_1.5fr_80px_80px_90px] border-b border-gray-100 bg-gray-50 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  <span>데이터명</span>
                  <span>매체</span>
                  <span>기간</span>
                  <span className="text-right">행 수</span>
                  <span className="text-right">저장일</span>
                  <span />
                </div>

                {/* 표 행 */}
                <ul className="divide-y divide-gray-50">
                  {savedReports.map(r => {
                    const rowCount = r.chunked
                      ? (r.totalRows ?? 0)
                      : r.mediaTypes.reduce((s, m) => s + (r.rowsByMedia[m]?.length ?? 0), 0)
                    const dateRange = extractDateRange(r)

                    return (
                      <li
                        key={r.id}
                        className="grid grid-cols-[2fr_1fr_1.5fr_80px_80px_90px] items-center gap-2 px-5 py-4 hover:bg-blue-50/40 transition-colors cursor-pointer group"
                        onClick={() => handleLoadReport(r)}
                      >
                        {/* 데이터명 */}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate group-hover:text-blue-700">
                            {dateRange}
                          </p>
                          {r.chunked && (
                            <span className="mt-0.5 inline-block rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                              대용량
                            </span>
                          )}
                        </div>

                        {/* 매체 배지 */}
                        <div className="flex flex-wrap gap-1">
                          {r.mediaTypes.map(m => {
                            const cfg = MEDIA_CONFIG[m]
                            return (
                              <span
                                key={m}
                                className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium"
                                style={{
                                  borderColor: cfg.color + '55',
                                  backgroundColor: cfg.color + '18',
                                  color: cfg.color,
                                }}
                              >
                                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cfg.color }} />
                                {cfg.label}
                              </span>
                            )
                          })}
                        </div>

                        {/* 기간 */}
                        <p className="text-xs text-gray-500 tabular-nums">{dateRange}</p>

                        {/* 행 수 */}
                        <p className="text-xs text-gray-500 tabular-nums text-right">{fmt(rowCount)}</p>

                        {/* 저장일 */}
                        <p className="text-xs text-gray-400 tabular-nums text-right">{fmtSavedAt(r.savedAt)}</p>

                        {/* 액션 */}
                        <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => handleLoadReport(r)}
                            className="rounded-lg bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-100 transition-colors"
                          >
                            {loading ? '...' : '열기'}
                          </button>
                          <button
                            onClick={() => handleDeleteReport(r.id)}
                            className="rounded-lg p-1 text-gray-300 hover:bg-red-50 hover:text-red-400 transition-colors"
                            title="삭제"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
                </div>
              </>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            UPLOAD MODE — CSV 파일 업로드 (Step 1만 존재)
            ══════════════════════════════════════════════════ */}
        {mode === 'upload' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-800 mb-0.5">통합 CSV 파일 업로드</h2>
              <p className="text-xs text-gray-400 mb-4">모든 매체 성과 데이터가 포함된 통합 CSV 파일을 업로드해주세요.</p>
              <UnifiedCsvUploadCard
                fileName={unifiedFile?.name}
                onFileSelect={file => setUnifiedFile(file)}
                onRemove={() => setUnifiedFile(null)}
              />
            </div>
            {unifiedFile && (
              <div className="flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
                <div className="flex flex-col gap-1">
                  <p className="text-sm text-blue-700">
                    <strong>{unifiedFile.name}</strong> 업로드 준비 완료
                  </p>
                  <p className="text-[11px] text-blue-600">
                    {(unifiedFile.size / 1024 / 1024).toFixed(1)}MB
                    {unifiedFile.size > 3 * 1024 * 1024 && ' · 대용량 → 자동 청크 저장'}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {parseError && (
                    <p className="text-[11px] text-red-500">{parseError}</p>
                  )}
                  <button
                    onClick={handleProcess}
                    disabled={loading}
                    className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {loading ? '처리 중...' : '업로드 및 분석 →'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            VIEW MODE — 데이터 테이블 (구 Step 3)
            ══════════════════════════════════════════════════ */}
        {mode === 'view' && (
          <div>
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">추출된 데이터</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {activeMediaTypes.map(m => MEDIA_CONFIG[m].label).join(', ')}
                </p>
              </div>
              <button
                onClick={goToUpload}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 transition-colors"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                새 파일 업로드
              </button>
            </div>

            {/* 감지된 광고주 힌트 */}
            {detectedHints.length > 0 && (
              <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3">
                <p className="text-xs font-semibold text-indigo-700 mb-1.5">
                  감지된 광고주 ({detectedHints.length}개)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {detectedHints.map(hint => (
                    <span key={hint} className="rounded-full bg-white border border-indigo-200 px-2.5 py-0.5 text-[11px] text-indigo-700">
                      {hint}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-indigo-400">
                  카카오·META·네이버 계정명 기반으로 추출된 광고주 후보입니다. (Google 제외)
                </p>
              </div>
            )}


            {/* 매체 탭 */}
            <div className="mb-0 flex gap-2 border-b border-gray-200">
              {activeMediaTypes.map(media => {
                const rows = rowsByMedia[media] ?? []
                const cfg = MEDIA_CONFIG[media]
                return (
                  <button
                    key={media}
                    onClick={() => setActiveTab(media)}
                    className={`relative flex items-center gap-1.5 rounded-t-lg border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${
                      activeTab === media
                        ? 'border-blue-600 text-blue-700'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cfg.color }} />
                    {cfg.label}
                    <span className="ml-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                      {fmt(rows.length)}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* 캠페인명 필터 */}
            {activeCampaignNames.length > 1 && (
              <div className="flex flex-wrap items-center gap-1.5 border-b border-gray-100 bg-gray-50 px-3 py-2.5">
                <span className="text-[10px] font-semibold text-gray-400 mr-1">캠페인</span>
                <button
                  onClick={() => setSelectedCsvCampaigns(new Set())}
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                    selectedCsvCampaigns.size === 0
                      ? 'bg-blue-600 text-white'
                      : 'bg-white border border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-600'
                  }`}
                >
                  전체 ({activeTab ? (rowsByMedia[activeTab]?.length ?? 0) : 0})
                </button>
                {activeCampaignNames.map(name => {
                  const selected = selectedCsvCampaigns.has(name)
                  const count = (activeTab ? (rowsByMedia[activeTab] ?? []) : []).filter(r => r.campaignName === name).length
                  return (
                    <button
                      key={name}
                      onClick={() => {
                        setSelectedCsvCampaigns(prev => {
                          const next = new Set(prev)
                          if (next.has(name)) next.delete(name)
                          else next.add(name)
                          return next
                        })
                      }}
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                        selected
                          ? 'bg-blue-600 text-white'
                          : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600'
                      }`}
                    >
                      {name} ({count})
                    </button>
                  )
                })}
              </div>
            )}

            {/* 데이터 테이블 */}
            {activeTab && (
              <DailyDataTable rows={activeRows} media={activeTab} onRowUpdate={handleRowUpdate} />
            )}
          </div>
        )}
      </main>
    </div>
  )
}

// Helper: FileReader로 텍스트 읽기 (BOM 자동 제거)
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve((e.target?.result as string) || '')
    reader.onerror = () => reject(new Error('파일 읽기 실패'))
    reader.readAsText(file, 'utf-8')
  })
}
