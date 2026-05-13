"use client"

import { useState, useEffect, useMemo, useCallback, Suspense } from "react"
import type { RawRow } from "@/lib/rawDataParser"
import { parseUnifiedCsv } from "@/lib/unifiedCsvParser"
import type { RawBatch } from "@/lib/rawDataStore"
import { useRawData } from "@/lib/hooks/useRawData"
import { genId } from "@/lib/idGen"
import { useMasterData } from "@/lib/hooks/useMasterData"

function fmt(n: number) { return n.toLocaleString("ko-KR") }

function fmtDelta(n: number) {
  const sign = n > 0 ? "+" : n < 0 ? "" : ""
  const cls  = n > 0 ? "text-blue-600" : n < 0 ? "text-red-500" : "text-gray-400"
  return { text: `${sign}${fmt(Math.round(n))}`, cls }
}

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

// ── 전일/당일 비교 Row 타입 ─────────────────────────────
interface DayCompRow {
  key: string
  label: string   // 캠페인명 (or raw campaignName)
  prevDate: string
  todayDate: string
  prev: number
  today: number
  delta: number
  deltaRate: number
  medias: string[]
}

export default function CtPlusDailyPage() {
  return <Suspense><CtPlusDailyContent /></Suspense>
}

function CtPlusDailyContent() {
  const { allRows, addBatch, clearAll } = useRawData()
  const { campaigns } = useMasterData()

  const [loading,      setLoading]      = useState(false)
  const [parseError,   setParseError]   = useState<string | null>(null)
  const [uploadFile,   setUploadFile]   = useState<File | null>(null)
  const [preview,      setPreview]      = useState<Preview | null>(null)
  const [toast,        setToast]        = useState<string | null>(null)
  const [clearConfirm, setClearConfirm] = useState(false)
  const [compareDate,  setCompareDate]  = useState<string>("")

  // 최신 날짜로 비교 날짜 자동 세팅
  useEffect(() => {
    if (allRows.length === 0 || compareDate) return
    const dates = allRows.map(r => r.date).filter(Boolean)
    if (dates.length === 0) return
    const latest = dates.reduce((a, b) => a > b ? a : b)
    setCompareDate(latest)
  }, [allRows, compareDate])

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
    setCompareDate("")
    setToast("전체 데이터가 초기화되었습니다")
  }

  // ── 전일/당일 비교 계산 ───────────────────────────────
  const comparisonRows = useMemo((): DayCompRow[] => {
    if (!compareDate || allRows.length === 0) return []

    const prevD = new Date(compareDate)
    prevD.setDate(prevD.getDate() - 1)
    const prevDate = prevD.toISOString().slice(0, 10)

    const todayRows = allRows.filter(r => r.date === compareDate)
    const prevRows  = allRows.filter(r => r.date === prevDate)

    if (todayRows.length === 0 && prevRows.length === 0) return []

    // 캠페인별 집계
    const map = new Map<string, { label: string; prev: number; today: number; medias: Set<string> }>()

    function addRows(rows: RawRow[], isToday: boolean) {
      for (const r of rows) {
        const key   = r.matchedCampaignId ?? r.campaignName
        const label = r.matchedCampaignId
          ? (campaigns.find(c => c.id === r.matchedCampaignId)?.campaignName ?? r.campaignName)
          : r.campaignName
        const cur = map.get(key) ?? { label, prev: 0, today: 0, medias: new Set() }
        if (isToday) cur.today += r.netCost ?? 0
        else         cur.prev  += r.netCost ?? 0
        cur.medias.add(r.media)
        map.set(key, cur)
      }
    }

    addRows(prevRows, false)
    addRows(todayRows, true)

    return [...map.entries()]
      .map(([key, v]) => {
        const delta     = v.today - v.prev
        const deltaRate = v.prev > 0 ? (delta / v.prev) * 100 : v.today > 0 ? 100 : 0
        return {
          key, label: v.label,
          prevDate, todayDate: compareDate,
          prev: Math.round(v.prev), today: Math.round(v.today),
          delta, deltaRate,
          medias: [...v.medias],
        }
      })
      .sort((a, b) => b.today - a.today)
  }, [compareDate, allRows, campaigns])

  const totalCount = allRows.length

  // 비교 날짜 범위 계산
  const dateRange = useMemo(() => {
    if (allRows.length === 0) return { min: "", max: "" }
    const dates = allRows.map(r => r.date).filter(Boolean)
    return {
      min: dates.reduce((a, b) => a < b ? a : b),
      max: dates.reduce((a, b) => a > b ? a : b),
    }
  }, [allRows])

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

        {/* ── 전일/당일 비교 ─────────────────────────────── */}
        {allRows.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">전일 / 당일 비교</h2>
                <p className="text-xs text-gray-500 mt-0.5">날짜를 선택하면 전날 대비 캠페인별 순금액 변화를 확인합니다</p>
              </div>
              <input
                type="date"
                value={compareDate}
                min={dateRange.min}
                max={dateRange.max}
                onChange={e => setCompareDate(e.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            {comparisonRows.length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center">
                {compareDate ? "선택한 날짜에 데이터가 없습니다" : "날짜를 선택하세요"}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">캠페인</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">매체</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-500">
                        전일 <span className="text-gray-300">({comparisonRows[0]?.prevDate.slice(5)})</span>
                      </th>
                      <th className="px-3 py-2 text-right font-medium text-gray-500">
                        당일 <span className="text-gray-300">({compareDate.slice(5)})</span>
                      </th>
                      <th className="px-3 py-2 text-right font-medium text-gray-500">증감액</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-500">증감율</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {comparisonRows.map(row => {
                      const d = fmtDelta(row.delta)
                      const r = fmtDelta(row.deltaRate)
                      return (
                        <tr key={row.key} className="hover:bg-gray-50">
                          <td className="px-3 py-2.5 font-medium text-gray-800 max-w-[180px] truncate" title={row.label}>
                            {row.label}
                          </td>
                          <td className="px-3 py-2.5 text-gray-500">
                            <div className="flex flex-wrap gap-1">
                              {row.medias.map(m => (
                                <span key={m} className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">{m}</span>
                              ))}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">
                            {row.prev > 0 ? fmt(row.prev) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-medium text-blue-700">
                            {row.today > 0 ? fmt(row.today) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${d.cls}`}>{d.text}</td>
                          <td className={`px-3 py-2.5 text-right tabular-nums ${r.cls}`}>
                            {row.prev > 0 || row.today > 0 ? `${r.text}%` : <span className="text-gray-300">—</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                    <tr>
                      <td className="px-3 py-2.5 font-semibold text-gray-900" colSpan={2}>합계</td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-gray-700">
                        {fmt(comparisonRows.reduce((s, r) => s + r.prev, 0))}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-blue-700">
                        {fmt(comparisonRows.reduce((s, r) => s + r.today, 0))}
                      </td>
                      {(() => {
                        const totalDelta = comparisonRows.reduce((s, r) => s + r.delta, 0)
                        const d = fmtDelta(totalDelta)
                        return (
                          <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${d.cls}`}>{d.text}</td>
                        )
                      })()}
                      <td className="px-3 py-2.5 text-right text-gray-400">—</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* R2: 매체별 탭 + DailyDataTable 제거.
            업로드 직전에 보이는 PreviewPanel + 상단 전일/당일 비교표 가 있어 raw 표시는 불필요.
            전체 raw 데이터가 필요하면 캠페인 상세분석(status/[id]) 의 RAW 탭 이용. */}
      </main>
    </div>
  )
}
