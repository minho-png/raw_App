"use client"

import { useState } from "react"
import MediaUploadCard from "@/components/ct-plus/MediaUploadCard"
import ReportViewer from "@/components/ct-plus/ReportViewer"
import { parseExcelFile } from "@/lib/excelParser"
import { REPORT_SECTIONS, MEDIA_CONFIG } from "@/lib/reportTypes"
import type { MediaType, MediaData, ReportSection } from "@/lib/reportTypes"

const MEDIA_TYPES: MediaType[] = ['google', 'naver', 'kakao', 'meta']

export default function CtPlusDailyPage() {
  const [files, setFiles] = useState<Partial<Record<MediaType, File>>>({})
  const [mediaDataList, setMediaDataList] = useState<MediaData[]>([])
  const [selectedSections, setSelectedSections] = useState<ReportSection[]>(
    REPORT_SECTIONS.map((s) => s.id)
  )
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [loading, setLoading] = useState(false)

  function toggleSection(id: ReportSection) {
    setSelectedSections((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    )
  }

  async function handleGenerate() {
    setLoading(true)
    try {
      const results: MediaData[] = []
      for (const media of MEDIA_TYPES) {
        const file = files[media]
        if (file) {
          const data = await parseExcelFile(file, media)
          results.push(data)
        }
      }
      setMediaDataList(results)
      setStep(3)
    } catch (e) {
      alert('파일 파싱 중 오류가 발생했습니다. 파일 형식을 확인해주세요.')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const uploadedCount = Object.keys(files).length

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-gray-900">데일리 리포트</h1>
            <p className="text-xs text-gray-400 mt-0.5">캠페인 리포트 · CT+ · 데일리</p>
          </div>
          {/* 스텝 인디케이터 */}
          <div className="flex items-center gap-1.5">
            {([1, 2, 3] as const).map((s) => (
              <div key={s} className="flex items-center gap-1.5">
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                    step === s
                      ? 'bg-blue-600 text-white'
                      : step > s
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {step > s ? '✓' : s}
                </div>
                <span className={`text-xs hidden sm:inline ${step === s ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>
                  {s === 1 ? '파일 업로드' : s === 2 ? '항목 선택' : '리포트 확인'}
                </span>
                {s < 3 && <span className="text-gray-200 text-xs">›</span>}
              </div>
            ))}
          </div>
        </div>
      </header>

      <main className="p-6 space-y-6">

        {/* STEP 1: 파일 업로드 */}
        {step === 1 && (
          <div>
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-gray-800">RAW 파일 업로드</h2>
              <p className="text-xs text-gray-400 mt-0.5">매체별 RAW 데이터 파일을 업로드해주세요. 1개 이상 업로드하면 리포트 생성이 가능합니다.</p>
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {MEDIA_TYPES.map((media) => (
                <MediaUploadCard
                  key={media}
                  media={media}
                  fileName={files[media]?.name}
                  onFileSelect={(file) => setFiles((prev) => ({ ...prev, [media]: file }))}
                  onRemove={() => setFiles((prev) => { const next = { ...prev }; delete next[media]; return next })}
                />
              ))}
            </div>

            {uploadedCount > 0 && (
              <div className="mt-4 flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
                <p className="text-sm text-blue-700">
                  <strong>{uploadedCount}개</strong> 매체 파일 업로드 완료
                  {' '}({MEDIA_TYPES.filter((m) => files[m]).map((m) => MEDIA_CONFIG[m].label).join(', ')})
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

        {/* STEP 2: 항목 선택 */}
        {step === 2 && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">리포트 항목 선택</h2>
                <p className="text-xs text-gray-400 mt-0.5">리포트에 포함할 섹션을 선택해주세요.</p>
              </div>
              <button onClick={() => setStep(1)} className="text-xs text-gray-400 hover:text-gray-600">← 파일 다시 선택</button>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {REPORT_SECTIONS.map((section) => {
                const selected = selectedSections.includes(section.id)
                return (
                  <label
                    key={section.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-all ${
                      selected ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleSection(section.id)}
                      className="mt-0.5 h-4 w-4 rounded text-blue-600"
                    />
                    <div>
                      <p className={`text-sm font-medium ${selected ? 'text-blue-800' : 'text-gray-700'}`}>
                        {section.label}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{section.description}</p>
                    </div>
                  </label>
                )
              })}
            </div>

            <div className="mt-5 flex items-center justify-between">
              <p className="text-xs text-gray-400">{selectedSections.length}개 항목 선택됨</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedSections(REPORT_SECTIONS.map((s) => s.id))}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                >
                  전체 선택
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={selectedSections.length === 0 || loading}
                  className="rounded-lg bg-blue-600 px-5 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? '생성 중...' : '리포트 생성 →'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: 리포트 뷰 */}
        {step === 3 && (
          <div>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">생성된 리포트</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {mediaDataList.map((m) => MEDIA_CONFIG[m.media].label).join(' · ')} · {selectedSections.length}개 섹션
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStep(2)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
                  ← 항목 수정
                </button>
                <button
                  onClick={() => window.print()}
                  className="rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700"
                >
                  인쇄 / PDF
                </button>
              </div>
            </div>

            <ReportViewer mediaList={mediaDataList} sections={selectedSections} />
          </div>
        )}
      </main>
    </div>
  )
}
