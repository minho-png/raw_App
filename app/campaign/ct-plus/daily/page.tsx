"use client"

import { useState, useEffect, useMemo, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import UnifiedCsvUploadCard from "@/components/ct-plus/UnifiedCsvUploadCard"
import DailyDataTable from "@/components/ct-plus/DailyDataTable"
import { hasCampaignMedia } from "@/lib/rawDataParser"
import type { RawRow } from "@/lib/rawDataParser"
import { MEDIA_CONFIG } from "@/lib/reportTypes"
import type { MediaType } from "@/lib/reportTypes"
import type { Campaign, Advertiser, Agency } from "@/lib/campaignTypes"
import type { ParseUnifiedCsvResult } from "@/lib/unifiedCsvParser"
import { lookupCampaignByName } from '@/lib/csvCampaignLookup'
import type { CampaignLookupResult } from '@/lib/csvCampaignLookup'
import { useMasterData } from "@/lib/hooks/useMasterData"
import { useReports } from "@/lib/hooks/useReports"
import type { SavedReport } from "@/lib/hooks/useReports"

function fmt(n: number) { return n.toLocaleString('ko-KR') }

function makeLabel(
  rowsByMedia: Partial<Record<MediaType, RawRow[]>>,
  mediaTypes: MediaType[],
  campaignName: string | null,
): string {
  const allDates = mediaTypes.flatMap(m => (rowsByMedia[m] ?? []).map(r => r.date)).sort()
  const dateRange = allDates.length
    ? allDates[0] === allDates[allDates.length - 1]
      ? allDates[0]
      : `${allDates[0]} ~ ${allDates[allDates.length - 1]}`
    : ''
  const mediaStr = mediaTypes.map(m => MEDIA_CONFIG[m].label).join(', ')
  return [dateRange, campaignName, mediaStr].filter(Boolean).join(' · ')
}

export default function CtPlusDailyPage() {
  return (
    <Suspense>
      <CtPlusDailyContent />
    </Suspense>
  )
}

function CtPlusDailyContent() {
  const searchParams = useSearchParams()
  const [unifiedFile, setUnifiedFile] = useState<File | null>(null)
  const [step, setStep]   = useState<1 | 2 | 3>(1)
  const [loading, setLoading] = useState(false)

  // 마스터 데이터 (MongoDB 동기화)
  const { campaigns, advertisers, agencies } = useMasterData()
  const { reports: savedReports, saveReport, deleteReport } = useReports()

  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null)

  // URL 파라미터로 캠페인 자동 선택
  useEffect(() => {
    const paramId = searchParams.get('campaignId')
    if (paramId && campaigns.some(x => x.id === paramId)) {
      setSelectedCampaignId(paramId)
    }
  }, [searchParams, campaigns])

  // 결과 데이터
  const [rowsByMedia, setRowsByMedia] = useState<Partial<Record<MediaType, RawRow[]>>>({})
  const [activeTab, setActiveTab]     = useState<MediaType | null>(null)
  const [csvCampaignMatches, setCsvCampaignMatches] = useState<Map<string, CampaignLookupResult | null>>(new Map())
  const [csvCampaignOverrides, setCsvCampaignOverrides] = useState<Map<string, string>>(new Map()) // csvName → campaignId

  const [showHistory, setShowHistory]     = useState(false)
  const [savedToast, setSavedToast]       = useState(false)

  // 캠페인 이름 필터 (CSV 원본 캠페인명 기준)
  const [selectedCsvCampaigns, setSelectedCsvCampaigns] = useState<Set<string>>(new Set())

  const selectedCampaign   = campaigns.find(c => c.id === selectedCampaignId) ?? null

  function getAdvertiserName(c: Campaign) {
    return advertisers.find(a => a.id === c.advertiserId)?.name ?? '—'
  }
  function getAgencyName(c: Campaign) {
    return agencies.find(a => a.id === c.agencyId)?.name ?? '—'
  }

  function getEffectiveCampaignForCsvName(csvName: string): Campaign | null {
    const overrideId = csvCampaignOverrides.get(csvName)
    if (overrideId) return campaigns.find(c => c.id === overrideId) ?? null
    const match = csvCampaignMatches.get(csvName)
    return match?.campaign ?? null
  }

  function handleCsvCampaignOverride(csvName: string, campaignId: string) {
    setCsvCampaignOverrides(prev => {
      const next = new Map(prev)
      if (campaignId) next.set(csvName, campaignId)
      else next.delete(csvName)
      return next
    })
  }

  async function handleProcess() {
    if (!unifiedFile) return
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('file', unifiedFile)
      formData.append('campaign', JSON.stringify(selectedCampaign))
      const res = await fetch('/api/parse-unified-csv', { method: 'POST', body: formData })
      if (!res.ok) throw new Error(await res.text())
      const result: ParseUnifiedCsvResult = await res.json()
      setRowsByMedia(result.rowsByMedia)
      const mediaKeys = Object.keys(result.rowsByMedia) as MediaType[]
      setActiveTab(mediaKeys[0] ?? null)
      if (result.skippedMediaCodes.length > 0) {
        console.warn('[parse-unified-csv] 알 수 없는 매체 코드:', result.skippedMediaCodes)
      }

      // CSV 캠페인명 역방향 조회 (선택된 캠페인명 기준)
      const matchMap = new Map<string, CampaignLookupResult | null>()
      if (selectedCampaign?.campaignName) {
        matchMap.set(
          selectedCampaign.campaignName,
          lookupCampaignByName(selectedCampaign.campaignName, campaigns, agencies, advertisers),
        )
      }
      setCsvCampaignMatches(matchMap)

      setStep(3)
    } catch (e) {
      alert('파일 파싱 중 오류가 발생했습니다. CSV 파일 형식을 확인해주세요.')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  // ── 리포트 저장 ──────────────────────────────────────────────
  async function handleSaveReport() {
    const mediaTypes = Object.keys(rowsByMedia) as MediaType[]
    const report: SavedReport = {
      id: Date.now().toString(),
      savedAt: new Date().toISOString(),
      label: makeLabel(rowsByMedia, mediaTypes, selectedCampaign?.campaignName ?? null),
      campaignName: selectedCampaign?.campaignName ?? null,
      mediaTypes,
      rowsByMedia,
      campaign: selectedCampaign,
    }
    await saveReport(report)
    setSavedToast(true)
    setTimeout(() => setSavedToast(false), 4000)
  }

  // ── 리포트 불러오기 ──────────────────────────────────────────
  function handleLoadReport(r: SavedReport) {
    setRowsByMedia(r.rowsByMedia)
    setActiveTab(r.mediaTypes[0] ?? null)
    setSelectedCampaignId(r.campaign?.id ?? null)
    setUnifiedFile(null)
    setShowHistory(false)
    setStep(3)
  }

  // ── 리포트 삭제 ──────────────────────────────────────────────
  async function handleDeleteReport(id: string) {
    await deleteReport(id)
  }

  // ── 현재 탭에서 고유 캠페인명 목록 ──────────────────────────
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

  // ── 현재 탭 데이터 (캠페인 필터 적용) ───────────────────────
  const activeRows = useMemo(() => {
    if (!activeTab) return []
    const rows = rowsByMedia[activeTab] ?? []
    if (selectedCsvCampaigns.size === 0) return rows
    return rows.filter(r => selectedCsvCampaigns.has(r.campaignName))
  }, [activeTab, rowsByMedia, selectedCsvCampaigns])

  const activeMediaTypes = Object.keys(rowsByMedia) as MediaType[]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-gray-900">데일리 리포트</h1>
            <p className="text-xs text-gray-400 mt-0.5">캠페인 리포트 · CT+ · 데일리</p>
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
                    {s === 1 ? '파일 업로드' : s === 2 ? '캠페인 선택' : '데이터 확인'}
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
                <p className="mt-1 text-xs text-gray-300">데이터 추출 후 리포트를 저장할 수 있습니다.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {savedReports.map(r => {
                  const d = new Date(r.savedAt)
                  const dateStr = `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
                  const totalRows = r.mediaTypes.reduce((s, m) => s + (r.rowsByMedia[m]?.length ?? 0), 0)
                  return (
                    <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-gray-50/50 transition-colors">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800 truncate">{r.label}</p>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-gray-400">
                          <span>{dateStr} 저장</span>
                          <span>·</span>
                          <span>{fmt(totalRows)}행</span>
                          <span>·</span>
                          <span>{r.mediaTypes.map(m => MEDIA_CONFIG[m].label).join(', ')}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleLoadReport(r)}
                          className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors"
                        >
                          불러오기
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

        {/* ── STEP 2: 캠페인 선택 ──────────────────────────── */}
        {step === 2 && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">캠페인 선택</h2>
                <p className="text-xs text-gray-400 mt-0.5">마크업 비중을 적용할 캠페인을 선택해주세요.</p>
              </div>
              <button onClick={() => setStep(1)} className="text-xs text-gray-400 hover:text-gray-600">← 파일 다시 선택</button>
            </div>

            {campaigns.length === 0 ? (
              <div className="rounded-xl border border-gray-200 bg-white px-6 py-10 text-center">
                <p className="text-sm text-gray-500">등록된 캠페인이 없습니다.</p>
                <p className="mt-1 text-xs text-gray-400">캠페인 집행 현황에서 캠페인을 먼저 등록해주세요.</p>
                <button
                  onClick={() => {
                    setSelectedCampaignId(null)
                    handleProcess()
                  }}
                  disabled={loading}
                  className="mt-4 rounded-lg border border-gray-200 px-4 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  마크업 없이 계속 →
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {campaigns.map(c => {
                    const selected = selectedCampaignId === c.id
                    return (
                      <button
                        key={c.id}
                        onClick={() => setSelectedCampaignId(c.id)}
                        className={`w-full rounded-xl border px-5 py-4 text-left transition-all ${
                          selected
                            ? 'border-blue-300 bg-blue-50 ring-1 ring-blue-300'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className={`text-sm font-semibold ${selected ? 'text-blue-800' : 'text-gray-800'}`}>
                                {c.campaignName}
                              </p>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                c.status === '집행 중'
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-gray-100 text-gray-500'
                              }`}>
                                {c.status}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-gray-400">
                              {getAdvertiserName(c)} · {getAgencyName(c)} · {c.startDate} ~ {c.endDate}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {c.mediaBudgets.map(mb => (
                                <span
                                  key={mb.media}
                                  className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${
                                    selected ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'
                                  }`}
                                >
                                  {mb.media}
                                  {selected && (
                                    <span className="ml-1">
                                      DMP {mb.dmp.agencyFeeRate}% / 일반 {mb.nonDmp.agencyFeeRate}%
                                    </span>
                                  )}
                                </span>
                              ))}
                            </div>
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
                  <p className="text-xs text-gray-400">
                    {selectedCampaignId ? '캠페인 선택됨' : '캠페인을 선택하거나 마크업 없이 진행할 수 있습니다.'}
                  </p>
                  <div className="flex gap-2">
                    {!selectedCampaignId && (
                      <button
                        onClick={() => handleProcess()}
                        disabled={loading}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      >
                        마크업 없이 진행
                      </button>
                    )}
                    {selectedCampaignId && (
                      <button
                        onClick={handleProcess}
                        disabled={loading}
                        className="rounded-lg bg-blue-600 px-5 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {loading ? '처리 중...' : '데이터 추출 →'}
                      </button>
                    )}
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
                  {selectedCampaign
                    ? `${selectedCampaign.campaignName} · 마크업 적용`
                    : '마크업 미적용'}
                  {' · '}
                  {activeMediaTypes.map(m => MEDIA_CONFIG[m].label).join(', ')}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* 리포트 저장 버튼 */}
                <div className="relative">
                  <button
                    onClick={handleSaveReport}
                    className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                    </svg>
                    리포트 저장
                  </button>
                  {savedToast && (
                    <div className="absolute right-0 top-full mt-1.5 rounded-lg bg-gray-800 px-3 py-2 text-[11px] text-white shadow-lg z-10 flex items-center gap-3">
                      <span>저장되었습니다 ✓</span>
                      <Link href="/campaign/ct-plus/report" className="rounded bg-white/20 px-2 py-0.5 text-white hover:bg-white/30 transition-colors">
                        통합 리포트 보기 →
                      </Link>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setStep(2)}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                >
                  ← 캠페인 재선택
                </button>
              </div>
            </div>

          {/* CSV 캠페인 역방향 매칭 결과 */}
          {csvCampaignMatches.size > 0 && (
            <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
              <p className="text-xs font-semibold text-blue-700 mb-3">캠페인 매칭</p>
              <div className="space-y-3">
                {[...csvCampaignMatches.entries()].map(([csvName, match]) => {
                  const overrideId = csvCampaignOverrides.get(csvName) ?? ''
                  const effectiveCampaign = getEffectiveCampaignForCsvName(csvName)
                  const effectiveAgency = effectiveCampaign ? agencies.find(a => a.id === effectiveCampaign.agencyId) : null
                  const effectiveAdvertiser = effectiveCampaign ? advertisers.find(a => a.id === effectiveCampaign.advertiserId) : null
                  return (
                    <div key={csvName} className="rounded-lg border border-blue-100 bg-white p-2.5 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-500 shrink-0">CSV</span>
                        <span className="font-mono text-[11px] text-gray-700 truncate" title={csvName}>{csvName}</span>
                        {match && !overrideId && (
                          <span className={`ml-auto text-[9px] px-1.5 py-0.5 rounded shrink-0 ${
                            match.matchType === 'exact' ? 'bg-green-100 text-green-700' :
                            match.matchType === 'contains' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-gray-100 text-gray-500'
                          }`}>{match.matchType === 'exact' ? '완전일치' : match.matchType === 'contains' ? '포함일치' : '부분일치'}</span>
                        )}
                        {overrideId && (
                          <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded shrink-0 bg-purple-100 text-purple-700">수동선택</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-gray-400 shrink-0">캠페인</span>
                        <select
                          value={overrideId || match?.campaign?.id || ''}
                          onChange={e => handleCsvCampaignOverride(csvName, e.target.value)}
                          className="flex-1 rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 focus:border-blue-300 focus:outline-none"
                        >
                          <option value="">-- 미매칭 --</option>
                          {campaigns.map(c => (
                            <option key={c.id} value={c.id}>{c.campaignName}</option>
                          ))}
                        </select>
                      </div>
                      {effectiveCampaign && (
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 pl-1">
                          {effectiveAgency && <span className="text-[10px] text-gray-500">대행사: <span className="text-gray-700">{effectiveAgency.name}</span></span>}
                          {effectiveAdvertiser && <span className="text-[10px] text-gray-500">광고주: <span className="text-gray-700">{effectiveAdvertiser.name}</span></span>}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

            {/* 매체 탭 */}
            <div className="mb-0 flex gap-2 border-b border-gray-200">
              {activeMediaTypes.map(media => {
                const rows = rowsByMedia[media] ?? []
                const cfg = MEDIA_CONFIG[media]
                const hasCampaign = hasCampaignMedia(media, selectedCampaign)
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
                    {selectedCampaign && !hasCampaign && (
                      <span className="ml-0.5 text-yellow-500" title="캠페인에 해당 매체 없음 — 마크업 0%">⚠</span>
                    )}
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
