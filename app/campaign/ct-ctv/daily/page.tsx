"use client"

import { useState, useEffect } from "react"
import MediaUploadCard from "@/components/ct-plus/MediaUploadCard"
import { parseCtvRawRows } from "@/lib/excelParser"
import { MEDIA_CONFIG } from "@/lib/reportTypes"
import type { MediaType, CtvRawRow } from "@/lib/reportTypes"

const MEDIA_TYPES: MediaType[] = ['google', 'naver', 'kakao', 'meta']
const REPORTS_KEY = 'ct-ctv-daily-reports-v1'

function fmt(n: number) { return n.toLocaleString('ko-KR') }
function fmtPct(n: number) { return n.toFixed(2) + '%' }

interface SavedReport {
  id: string
  savedAt: string
  label: string
  mediaTypes: MediaType[]
  rowsByMedia: Partial<Record<MediaType, CtvRawRow[]>>
}

function makeLabel(
  rowsByMedia: Partial<Record<MediaType, CtvRawRow[]>>,
  mediaTypes: MediaType[],
): string {
  const allDates = mediaTypes.flatMap(m => (rowsByMedia[m] ?? []).map(r => r.date)).filter(Boolean).sort()
  const dateRange = allDates.length
    ? allDates[0] === allDates[allDates.length - 1]
      ? allDates[0]
      : `${allDates[0]} ~ ${allDates[allDates.length - 1]}`
    : ''
  const mediaStr = mediaTypes.map(m => MEDIA_CONFIG[m].label).join(', ')
  return [dateRange, mediaStr].filter(Boolean).join(' · ')
}

// CTV 데일리 테이블
function CtvDailyTable({ rows, media }: { rows: CtvRawRow[]; media: MediaType }) {
  const cfg = MEDIA_CONFIG[media]
  const totalImp = rows.reduce((s, r) => s + r.impressions, 0)
  const totalCv  = rows.reduce((s, r) => s + r.completedViews, 0)
  const totalVtr = totalImp > 0 ? (totalCv / totalImp) * 100 : 0
  const totalCost = rows.reduce((s, r) => s + r.cost, 0)
  const totalCpv  = totalCv > 0 ? totalCost / totalCv : 0

  function handleCopyTsv() {
    const header = ['날짜', '요일', '소재명', '노출수', '완료재생수', 'VTR(%)', '소진금액', 'CPV'].join('\t')
    const body = rows.map(r =>
      [r.date, r.dayOfWeek, r.creativeName, r.impressions, r.completedViews,
       r.vtr.toFixed(2), r.cost, r.cpv].join('\t')
    ).join('\n')
    navigator.clipboard.writeText(header + '\n' + body).catch(() => {})
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {/* 매체 헤더 + 요약 */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: cfg.color }} />
          <span className="text-sm font-semibold text-gray-800">{cfg.label}</span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">{fmt(rows.length)}행</span>
        </div>
        <button
          onClick={handleCopyTsv}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
          </svg>
          엑셀 복사
        </button>
      </div>

      {/* 요약 KPI 바 */}
      <div className="grid grid-cols-5 divide-x divide-gray-100 border-b border-gray-100 bg-gray-50/50">
        {[
          { label: '노출수', value: fmt(totalImp) },
          { label: '완료재생수', value: fmt(totalCv) },
          { label: 'VTR', value: fmtPct(totalVtr) },
          { label: '소진금액', value: '₩' + fmt(totalCost) },
          { label: 'CPV', value: '₩' + fmt(Math.round(totalCpv)) },
        ].map(({ label, value }) => (
          <div key={label} className="px-4 py-2.5 text-center">
            <p className="text-[10px] text-gray-400">{label}</p>
            <p className="text-sm font-semibold text-gray-800 tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      {/* 데이터 테이블 */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-2.5 text-left font-medium text-gray-500 whitespace-nowrap">날짜</th>
              <th className="px-3 py-2.5 text-center font-medium text-gray-500">요일</th>
              <th className="px-4 py-2.5 text-left font-medium text-gray-500">소재명</th>
              <th className="px-4 py-2.5 text-right font-medium text-gray-500 whitespace-nowrap">노출수</th>
              <th className="px-4 py-2.5 text-right font-medium text-gray-500 whitespace-nowrap">완료재생수</th>
              <th className="px-4 py-2.5 text-right font-medium text-gray-500">VTR</th>
              <th className="px-4 py-2.5 text-right font-medium text-gray-500 whitespace-nowrap">소진금액</th>
              <th className="px-4 py-2.5 text-right font-medium text-gray-500">CPV</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-4 py-2.5 font-mono text-gray-700 whitespace-nowrap">{row.date}</td>
                <td className="px-3 py-2.5 text-center text-gray-500">{row.dayOfWeek}</td>
                <td className="px-4 py-2.5 max-w-[200px] truncate text-gray-700" title={row.creativeName}>{row.creativeName || '—'}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{fmt(row.impressions)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{fmt(row.completedViews)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  <span className={`font-medium ${row.vtr >= 20 ? 'text-green-600' : row.vtr >= 10 ? 'text-blue-600' : 'text-gray-600'}`}>
                    {fmtPct(row.vtr)}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">₩{fmt(row.cost)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">₩{fmt(row.cpv)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function CtCtvDailyPage() {
  const [files, setFiles]   = useState<Partial<Record<MediaType, File>>>({})
  const [step, setStep]     = useState<1 | 2>(1)
  const [loading, setLoading] = useState(false)

  const [rowsByMedia, setRowsByMedia] = useState<Partial<Record<MediaType, CtvRawRow[]>>>({})
  const [activeTab, setActiveTab]     = useState<MediaType | null>(null)

  const [savedReports, setSavedReports] = useState<SavedReport[]>([])
  const [showHistory, setShowHistory]   = useState(false)
  const [savedToast, setSavedToast]     = useState(false)

  useEffect(() => {
    try {
      const rpts = localStorage.getItem(REPORTS_KEY)
      if (rpts) setSavedReports(JSON.parse(rpts))
    } catch {}
  }, [])

  const uploadedMediaTypes = MEDIA_TYPES.filter(m => files[m])

  async function handleProcess() {
    setLoading(true)
    try {
      const result: Partial<Record<MediaType, CtvRawRow[]>> = {}
      for (const media of uploadedMediaTypes) {
        const file = files[media]!
        const label = MEDIA_CONFIG[media].label
        result[media] = await parseCtvRawRows(file, label)
      }
      setRowsByMedia(result)
      setActiveTab(uploadedMediaTypes[0] ?? null)
      setStep(2)
    } catch (e) {
      alert('파일 파싱 중 오류가 발생했습니다. 파일 형식을 확인해주세요.')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  function handleSaveReport() {
    const mediaTypes = Object.keys(rowsByMedia) as MediaType[]
    const report: SavedReport = {
      id: Date.now().toString(),
      savedAt: new Date().toISOString(),
      label: makeLabel(rowsByMedia, mediaTypes),
      mediaTypes,
      rowsByMedia,
    }
    const next = [report, ...savedReports].slice(0, 10)
    setSavedReports(next)
    try { localStorage.setItem(REPORTS_KEY, JSON.stringify(next)) } catch {}
    setSavedToast(true)
    setTimeout(() => setSavedToast(false), 2000)
  }

  function handleLoadReport(r: SavedReport) {
    setRowsByMedia(r.rowsByMedia)
    setActiveTab(r.mediaTypes[0] ?? null)
    setFiles({})
    setShowHistory(false)
    setStep(2)
  }

  function handleDeleteReport(id: string) {
    const next = savedReports.filter(r => r.id !== id)
    setSavedReports(next)
    try { localStorage.setItem(REPORTS_KEY, JSON.stringify(next)) } catch {}
  }

  const activeMediaTypes = step === 2
    ? (Object.keys(rowsByMedia) as MediaType[])
    : uploadedMediaTypes

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-gray-900">데일리 리포트</h1>
            <p className="text-xs text-gray-400 mt-0.5">캠페인 리포트 · CT/CTV · 데일리</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowHistory(v => !v)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                showHistory
                  ? 'border-purple-300 bg-purple-50 text-purple-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              이전 리포트
              {savedReports.length > 0 && (
                <span className="ml-0.5 rounded-full bg-purple-600 px-1.5 py-0.5 text-[10px] text-white leading-none">
                  {savedReports.length}
                </span>
              )}
            </button>
            {/* 스텝 인디케이터 */}
            <div className="flex items-center gap-1.5">
              {([1, 2] as const).map(s => (
                <div key={s} className="flex items-center gap-1.5">
                  <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition-colors ${step === s ? 'bg-purple-600 text-white' : step > s ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                    {step > s ? '✓' : s}
                  </div>
                  <span className={`hidden text-xs sm:inline ${step === s ? 'font-medium text-gray-700' : 'text-gray-400'}`}>
                    {s === 1 ? '파일 업로드' : '데이터 확인'}
                  </span>
                  {s < 2 && <span className="text-xs text-gray-200">›</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="p-6 space-y-6">

        {/* 이전 리포트 패널 */}
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
                          className="rounded-lg bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-100 transition-colors"
                        >
                          불러오기
                        </button>
                        <button
                          onClick={() => handleDeleteReport(r.id)}
                          className="rounded-lg px-2 py-1.5 text-xs text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
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

        {/* STEP 1: 파일 업로드 */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-800 mb-0.5">RAW 파일 업로드</h2>
              <p className="text-xs text-gray-400 mb-4">매체별 동영상 RAW 데이터 파일(.xlsx/.xls/.csv)을 업로드해주세요.</p>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {MEDIA_TYPES.map(media => (
                  <MediaUploadCard
                    key={media}
                    media={media}
                    fileName={files[media]?.name}
                    onFileSelect={file => setFiles(prev => ({ ...prev, [media]: file }))}
                    onRemove={() => setFiles(prev => { const n = { ...prev }; delete n[media]; return n })}
                  />
                ))}
              </div>
            </div>

            {uploadedMediaTypes.length > 0 && (
              <div className="flex items-center justify-between rounded-xl border border-purple-100 bg-purple-50 px-4 py-3">
                <p className="text-sm text-purple-700">
                  <strong>{uploadedMediaTypes.length}개</strong> 매체 업로드 완료
                  {' '}({uploadedMediaTypes.map(m => MEDIA_CONFIG[m].label).join(', ')})
                </p>
                <button
                  onClick={handleProcess}
                  disabled={loading}
                  className="rounded-lg bg-purple-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                >
                  {loading ? '처리 중...' : '데이터 추출 →'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: 데이터 테이블 */}
        {step === 2 && (
          <div>
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">추출된 데이터</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {activeMediaTypes.map(m => MEDIA_CONFIG[m].label).join(', ')} · CTV 완료재생 기준
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
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
                    <div className="absolute right-0 top-full mt-1.5 whitespace-nowrap rounded-lg bg-gray-800 px-3 py-1.5 text-[11px] text-white shadow-lg z-10">
                      저장되었습니다 ✓
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setStep(1)}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                >
                  ← 파일 다시 선택
                </button>
              </div>
            </div>

            {/* 매체 탭 */}
            <div className="mb-4 flex gap-2 border-b border-gray-200">
              {activeMediaTypes.map(media => {
                const rows = rowsByMedia[media] ?? []
                const cfg = MEDIA_CONFIG[media]
                return (
                  <button
                    key={media}
                    onClick={() => setActiveTab(media)}
                    className={`flex items-center gap-1.5 rounded-t-lg border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${
                      activeTab === media
                        ? 'border-purple-600 text-purple-700'
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

            {activeTab && rowsByMedia[activeTab] && (
              <CtvDailyTable rows={rowsByMedia[activeTab]!} media={activeTab} />
            )}
          </div>
        )}
      </main>
    </div>
  )
}
