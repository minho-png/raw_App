"use client"

import { useState, useEffect, useMemo, Suspense } from "react"
import Link from "next/link"
import UnifiedCsvUploadCard from "@/components/ct-plus/UnifiedCsvUploadCard"
import DailyDataTable from "@/components/ct-plus/DailyDataTable"
import type { RawRow } from "@/lib/rawDataParser"
import { MEDIA_CONFIG } from "@/lib/reportTypes"
import type { MediaType } from "@/lib/reportTypes"
import { parseUnifiedCsv } from "@/lib/unifiedCsvParser"
import { useCtGroups } from "@/lib/hooks/useCtGroups"
import type { CtPlusGroup } from "@/lib/ctGroupTypes"
import { useReports } from "@/lib/hooks/useReports"
import type { SavedReport, SaveProgress } from "@/lib/hooks/useReports"
import { totalRowCount } from "@/lib/csvChunker"

function fmt(n: number) { return n.toLocaleString('ko-KR') }

function makeLabel(
  rowsByMedia: Partial<Record<MediaType, RawRow[]>>,
  mediaTypes: MediaType[],
  groupName: string | null,
): string {
  const allDates = mediaTypes.flatMap(m => (rowsByMedia[m] ?? []).map(r => r.date)).sort()
  const dateRange = allDates.length
    ? allDates[0] === allDates[allDates.length - 1]
      ? allDates[0]
      : `${allDates[0]} ~ ${allDates[allDates.length - 1]}`
    : ''
  const mediaStr = mediaTypes.map(m => MEDIA_CONFIG[m].label).join(', ')
  return [dateRange, groupName, mediaStr].filter(Boolean).join(' · ')
}

export default function CtPlusDailyPage() {
  return (
    <Suspense>
      <CtPlusDailyContent />
    </Suspense>
  )
}

function CtPlusDailyContent() {
  const [unifiedFile, setUnifiedFile] = useState<File | null>(null)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [loading, setLoading] = useState(false)

  const { groups: ctGroups } = useCtGroups()
  const { reports: savedReports, saveReport, deleteReport, expandReport } = useReports()

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const selectedGroup: CtPlusGroup | null = ctGroups.find(g => g.id === selectedGroupId) ?? null

  // 결과 데이터
  const [rowsByMedia, setRowsByMedia] = useState<Partial<Record<MediaType, RawRow[]>>>({})
  const [activeTab, setActiveTab] = useState<MediaType | null>(null)

  const [showHistory, setShowHistory] = useState(false)
  const [savedToast, setSavedToast] = useState(false)
  const [saveProgressLocal, setSaveProgressLocal] = useState<SaveProgress | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)

  // 캠페인 이름 필터 (CSV 원본 캠페인명 기준)
  const [selectedCsvCampaigns, setSelectedCsvCampaigns] = useState<Set<string>>(new Set())

  // ── 클라이언트 사이드 CSV 파싱 (서버 API 미사용 → 용량 제한 없음) ──
  async function handleProcess() {
    if (!unifiedFile) return
    setLoading(true)
    setParseError(null)
    try {
      const text = await readFileAsText(unifiedFile)
      const result = parseUnifiedCsv(text, null)
      setRowsByMedia(result.rowsByMedia)
      const mediaKeys = Object.keys(result.rowsByMedia) as MediaType[]
      setActiveTab(mediaKeys[0] ?? null)
      if (result.skippedMediaCodes.length > 0) {
        console.warn('[CSV] 알 수 없는 매체 코드:', result.skippedMediaCodes)
      }
      setStep(3)
    } catch (e) {
      const msg = e instanceof Error ? e.message : '파싱 오류'
      setParseError(msg)
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  // ── 리포트 저장 (자동 청크) ─────────────────────────────────
  async function handleSaveReport() {
    const mediaTypes = Object.keys(rowsByMedia) as MediaType[]
    const report: SavedReport = {
      id: Date.now().toString(),
      savedAt: new Date().toISOString(),
      label: makeLabel(rowsByMedia, mediaTypes, selectedGroup?.name ?? null),
      campaignName: selectedGroup?.name ?? null,
      mediaTypes,
      rowsByMedia,
      campaign: null,
    }
    await saveReport(report, (p) => setSaveProgressLocal(p))
    if (saveProgressLocal?.phase !== 'error') {
      setSavedToast(true)
      setTimeout(() => setSavedToast(false), 4000)
    }
  }

  // ── 리포트 불러오기 ─────────────────────────────────────────
  async function handleLoadReport(r: SavedReport) {
    if (r.chunked) {
      setLoading(true)
      const full = await expandReport(r.id)
      setLoading(false)
      if (full) {
        setRowsByMedia(full.rowsByMedia)
        setActiveTab(full.mediaTypes[0] ?? null)
      }
    } else {
      setRowsByMedia(r.rowsByMedia)
      setActiveTab(r.mediaTypes[0] ?? null)
    }
    setSelectedGroupId(null)
    setUnifiedFile(null)
    setShowHistory(false)
    setStep(3)
  }

  async function handleDeleteReport(id: string) {
    await deleteReport(id)
  }

  // ── 현재 탭에서 고유 캠페인명 목록 ─────────────────────────
  const activeCampaignNames = useMemo(() => {
    if (!activeTab) return []
    const rows = rowsByMedia[activeTab] ?? []
    const names = new Set(rows.map(r => r.campaignName).filter(Boolean))
    return Array.from(names).sort()
  }, [activeTab, rowsByMedia])

  // 매체 탭 변경 시 캠페인 필터 초기화
  useEffect(() => {
    setSelectedCsvCampaigns(new Set())
  }, [activeTab])

  // ── 현재 탭 데이터 (캠페인 필터 적용) ──────────────────────
  const activeRows = useMemo(() => {
    if (!activeTab) return []
    const rows = rowsByMedia[activeTab] ?? []
    if (selectedCsvCampaigns.size === 0) return rows
    return rows.filter(r => selectedCsvCampaigns.has(r.campaignName))
  }, [activeTab, rowsByMedia, selectedCsvCampaigns])

  // ── 미매칭 CSV 캠페인명 (선택된 그룹에 없는 것) ─────────────
  const unmatchedCsvNames = useMemo<string[]>(() => {
    if (!selectedGroup) return []
    const allNames = new Set<string>()
    for (const rows of Object.values(rowsByMedia)) {
      rows?.forEach(r => { if (r.campaignName) allNames.add(r.campaignName) })
    }
    return Array.from(allNames).filter(n => !selectedGroup.csvNames.includes(n))
  }, [selectedGroup, rowsByMedia])

  const activeMediaTypes = Object.keys(rowsByMedia) as MediaType[]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-gray-900">데이터 입력</h1>
            <p className="text-xs text-gray-400 mt-0.5">캠페인 리포트 · CT+ · 데이터 입력</p>
          </div>
          <div className="flex items-center gap-3">
            {/* 이전 리포트 버튼 */}
            <button
              onClick={() => setShowHistory(v => !v)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                showHistory
                  ? 'border-blue-300 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              이전 리포트
              {savedReports.length > 0 && (
                <span className="ml-0.5 rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] text-white leading-none">
                  {savedReports.length}
                </span>
              )}
            </button>

            {/* 스텝 인디케이터 */}
            <div className="flex items-center gap-1.5">
              {([1, 2, 3] as const).map(s => (
                <div key={s} className="flex items-center gap-1.5">
                  <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition-colors ${step === s ? 'bg-blue-600 text-white' : step > s ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                    {step > s ? '✓' : s}
                  </div>
                  <span className={`hidden text-xs sm:inline ${step === s ? 'font-medium text-gray-700' : 'text-gray-400'}`}>
                    {s === 1 ? '파일 업로드' : s === 2 ? '그룹 선택' : '데이터 확인'}
                  </span>
                  {s < 3 && <span className="text-xs text-gray-200">›</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="p-6 space-y-6">

        {/* ── 이전 리포트 패널 ─────────────────────────────── */}
        {showHistory && (
          <div className="rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-5 py-3.5 flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-700">저장된 리포트</p>
              <span className="text-[11px] text-gray-400">{savedReports.length}개</span>
            </div>
            {savedReports.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-gray-400">저장된 리포트가 없습니다.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {savedReports.map(r => {
                  const d = new Date(r.savedAt)
                  const dateStr = `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
                  const rowCount = r.chunked
                    ? (r.totalRows ?? 0)
                    : r.mediaTypes.reduce((s, m) => s + (r.rowsByMedia[m]?.length ?? 0), 0)
                  return (
                    <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-gray-50/50 transition-colors">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-800 truncate">{r.label}</p>
                          {r.chunked && (
                            <span className="shrink-0 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                              대용량
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-gray-400">
                          <span>{dateStr} 저장</span>
                          <span>·</span>
                          <span>{fmt(rowCount)}행</span>
                          {r.chunked && <span>· {r.totalChunks}청크</span>}
                          <span>·</span>
                          <span>{r.mediaTypes.map(m => MEDIA_CONFIG[m].label).join(', ')}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleLoadReport(r)}
                          className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors"
                        >
                          {r.chunked ? '불러오기 (DB)' : '불러오기'}
                        </button>
                        <button
                          onClick={() => handleDeleteReport(r.id)}
                          className="rounded-lg px-2 py-1.5 text-xs text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
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
            )}
          </div>
        )}

        {/* ── STEP 1: 파일 업로드 ──────────────────────────── */}
        {step === 1 && (
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
                <p className="text-sm text-blue-700">
                  <strong>{unifiedFile.name}</strong> 업로드 완료
                </p>
                <button
                  onClick={() => setStep(2)}
                  className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                >
                  다음 →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 2: CT+ 그룹 선택 ───────────────────────── */}
        {step === 2 && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">CT+ 그룹 선택</h2>
                <p className="text-xs text-gray-400 mt-0.5">이 데이터를 연결할 캠페인 그룹을 선택하세요. 건너뛰기도 가능합니다.</p>
              </div>
              <button onClick={() => setStep(1)} className="text-xs text-gray-400 hover:text-gray-600">← 파일 다시 선택</button>
            </div>

            {ctGroups.length === 0 ? (
              <div className="rounded-xl border border-gray-200 bg-white px-6 py-10 text-center">
                <p className="text-sm text-gray-500">등록된 CT+ 그룹이 없습니다.</p>
                <p className="mt-1 text-xs text-gray-400">그룹 관리에서 그룹을 먼저 생성하거나 그룹 없이 진행하세요.</p>
                <div className="mt-4 flex items-center justify-center gap-3">
                  <Link
                    href="/campaign/ct-plus/manage"
                    className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
                  >
                    그룹 관리 →
                  </Link>
                  <button
                    onClick={() => handleProcess()}
                    disabled={loading}
                    className="rounded-lg border border-gray-200 px-4 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {loading ? '처리 중...' : '그룹 없이 진행'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {ctGroups.map(g => {
                    const selected = selectedGroupId === g.id
                    const mediaList = Object.keys(g.mediaMarkups) as MediaType[]
                    return (
                      <button
                        key={g.id}
                        onClick={() => setSelectedGroupId(prev => prev === g.id ? null : g.id)}
                        className={`w-full rounded-xl border px-5 py-4 text-left transition-all ${
                          selected
                            ? 'border-blue-300 bg-blue-50 ring-1 ring-blue-300'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-semibold ${selected ? 'text-blue-800' : 'text-gray-800'}`}>
                              {g.name || '(이름 없음)'}
                            </p>
                            <p className="mt-0.5 text-xs text-gray-400">
                              {g.startDate && g.endDate ? `${g.startDate} ~ ${g.endDate}` : '기간 미설정'}
                              {g.csvNames.length > 0 && ` · CSV ${g.csvNames.length}개`}
                            </p>
                            {g.csvNames.length > 0 && (
                              <p className="mt-1 text-[11px] text-gray-400 truncate">{g.csvNames.join(', ')}</p>
                            )}
                            {selected && mediaList.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {mediaList.map(mt => {
                                  const cfg = MEDIA_CONFIG[mt]
                                  const mu = g.mediaMarkups[mt]
                                  return (
                                    <span key={mt} className="flex items-center gap-1 rounded-md bg-blue-100 px-2 py-0.5 text-[10px] text-blue-700">
                                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cfg.color }} />
                                      {cfg.label}
                                      {mu && ` DMP ${mu.dmpRate}% / 일반 ${mu.nonDmpRate}%`}
                                    </span>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                          <div className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 transition-colors ${
                            selected ? 'border-blue-600 bg-blue-600' : 'border-gray-300'
                          }`} />
                        </div>
                      </button>
                    )
                  })}
                </div>

                <div className="mt-5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <p className="text-xs text-gray-400">
                      {selectedGroupId ? `"${selectedGroup?.name}" 선택됨` : '그룹을 선택하거나 그룹 없이 진행할 수 있습니다.'}
                    </p>
                    <Link href="/campaign/ct-plus/manage" className="text-xs text-blue-600 hover:underline">
                      그룹 관리
                    </Link>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {parseError && (
                      <p className="text-[11px] text-red-500">{parseError}</p>
                    )}
                    {unifiedFile && (
                      <p className="text-[11px] text-gray-400">
                        {(unifiedFile.size / 1024 / 1024).toFixed(1)}MB
                        {unifiedFile.size > 3 * 1024 * 1024 && ' · 대용량 → 자동 청크 저장'}
                      </p>
                    )}
                    <button
                      onClick={() => handleProcess()}
                      disabled={loading}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {loading ? '파싱 중...' : selectedGroupId ? '선택 완료 →' : '그룹 없이 진행 →'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── STEP 3: 데이터 테이블 ────────────────────────── */}
        {step === 3 && (
          <div>
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">추출된 데이터</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {selectedGroup ? `${selectedGroup.name} · ` : ''}
                  {activeMediaTypes.map(m => MEDIA_CONFIG[m].label).join(', ')}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
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
                  {/* 저장 프로그레스 */}
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
                    <div className="absolute right-0 top-full mt-1.5 rounded-lg bg-gray-800 px-3 py-2 text-[11px] text-white shadow-lg z-10 flex items-center gap-3">
                      <span>{saveProgressLocal.message} ✓</span>
                    </div>
                  )}
                  {savedToast && !saveProgressLocal && (
                    <div className="absolute right-0 top-full mt-1.5 rounded-lg bg-gray-800 px-3 py-2 text-[11px] text-white shadow-lg z-10 flex items-center gap-3">
                      <span>저장되었습니다 ✓</span>
                      <Link href="/campaign/ct-plus/report" className="rounded bg-white/20 px-2 py-0.5 text-white hover:bg-white/30 transition-colors">
                        리포트 보기 →
                      </Link>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setStep(2)}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                >
                  ← 그룹 재선택
                </button>
              </div>
            </div>

            {/* 미매칭 캠페인 경고 */}
            {unmatchedCsvNames.length > 0 && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-xs font-semibold text-amber-700 mb-1.5">
                  그룹에 포함되지 않은 CSV 캠페인명 ({unmatchedCsvNames.length}개)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {unmatchedCsvNames.map(name => (
                    <span key={name} className="rounded-full bg-amber-100 border border-amber-200 px-2.5 py-0.5 text-[11px] text-amber-700">
                      {name}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-amber-500">
                  <Link href="/campaign/ct-plus/manage" className="underline hover:text-amber-700">그룹 관리</Link>에서 해당 캠페인명을 그룹에 추가하세요.
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

            {/* 테이블 */}
            {activeTab && (
              <DailyDataTable rows={activeRows} media={activeTab} />
            )}
          </div>
        )}
      </main>
    </div>
  )
}

// ── 헬퍼: FileReader로 텍스트 읽기 (BOM 자동 제거) ─────────────
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      // BOM 제거
      resolve(text.replace(/^\uFEFF/, ''))
    }
    reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'))
    reader.readAsText(file, 'utf-8')
  })
}
