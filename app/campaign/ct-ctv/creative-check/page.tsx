"use client"

import { useState, useRef } from "react"
import {
  CTV_DURATION_OPTIONS,
  CTV_DURATION_TOLERANCE_SEC,
  readVideoMetadata,
  checkCtvVideo,
  type CtvVideoCheckResult,
} from "@/lib/creative/specs"

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

export default function CtvCreativeCheckPage() {
  const [results, setResults] = useState<CtvVideoCheckResult[]>([])
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFiles(files: FileList | File[]) {
    setBusy(true)
    try {
      const arr = Array.from(files)
      const out: CtvVideoCheckResult[] = []
      for (const f of arr) {
        try {
          const { duration, extension, mimeType } = await readVideoMetadata(f)
          out.push(checkCtvVideo(f.name, f.size, duration, extension, mimeType))
        } catch {
          const ext = (f.name.split('.').pop() ?? '').toLowerCase()
          out.push({
            fileName: f.name, fileSize: f.size,
            duration: 0, extension: ext, mimeType: f.type,
            isMp4: false, durationMatched: null, passed: false,
          })
        }
      }
      setResults(prev => [...prev, ...out])
    } finally { setBusy(false) }
  }

  function clearAll() { setResults([]) }
  function removeOne(idx: number) { setResults(prev => prev.filter((_, i) => i !== idx)) }

  const passed = results.filter(r => r.passed).length
  const failed = results.length - passed

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-base font-semibold text-gray-900">CTV 소재 검수</h1>
        <p className="text-xs text-gray-400 mt-0.5">CTV 영상 소재 길이(15s · 30s) 및 포맷(MP4) 자동 검증</p>
      </header>

      <main className="p-6 space-y-4">
        {/* 규격 안내 */}
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-gray-800">검사 규격</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <p className="text-[10px] text-gray-500">길이</p>
              <p className="text-sm font-bold text-gray-800 tabular-nums">{CTV_DURATION_OPTIONS.join(' / ')}초</p>
              <p className="text-[10px] text-gray-400 mt-0.5">±{CTV_DURATION_TOLERANCE_SEC}초 허용</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <p className="text-[10px] text-gray-500">파일 형식</p>
              <p className="text-sm font-bold text-gray-800">MP4</p>
              <p className="text-[10px] text-gray-400 mt-0.5">.mp4 또는 video/mp4</p>
            </div>
          </div>
        </section>

        {/* 업로드 영역 */}
        <section
          onDragOver={e => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => {
            e.preventDefault(); setDrag(false)
            if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files)
          }}
          className={`rounded-xl border-2 border-dashed bg-white px-6 py-10 text-center transition-colors ${
            drag ? 'border-indigo-400 bg-indigo-50' : 'border-gray-300'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            multiple
            className="hidden"
            onChange={e => { if (e.target.files) handleFiles(e.target.files); e.target.value = '' }}
          />
          <p className="text-sm font-medium text-gray-700">영상 파일을 드래그하거나 버튼 클릭</p>
          <p className="text-[11px] text-gray-400 mt-1">검증: 길이(15s/30s) + MP4 포맷 — 여러 개 동시 검증 가능</p>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? '검사 중...' : '파일 선택'}
          </button>
        </section>

        {/* 결과 */}
        {results.length > 0 && (
          <section className="rounded-xl border border-gray-200 bg-white">
            <header className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
              <h2 className="text-sm font-semibold text-gray-800">검사 결과</h2>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-emerald-600 font-medium">✓ 통과 {passed}</span>
                <span className="text-red-600 font-medium">✗ 실패 {failed}</span>
                <button onClick={clearAll} className="rounded-md border border-gray-200 px-2 py-1 text-[10px] text-gray-600 hover:bg-gray-50">전체 비우기</button>
              </div>
            </header>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-500 w-10">상태</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">파일명</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">크기</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">길이</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">포맷</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">사유</th>
                    <th className="px-3 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {results.map((r, i) => {
                    const reasons: string[] = []
                    if (!r.isMp4) reasons.push(`MP4 아님 (.${r.extension || '—'})`)
                    if (r.durationMatched === null) reasons.push(`${r.duration > 0 ? r.duration.toFixed(2) + '초' : '메타 읽기 실패'} — 15·30초 ±${CTV_DURATION_TOLERANCE_SEC}s 미일치`)
                    return (
                      <tr key={i} className={r.passed ? '' : 'bg-red-50/30'}>
                        <td className="px-3 py-2">
                          {r.passed ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">✓ 통과</span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">✗ 실패</span>
                          )}
                        </td>
                        <td className="px-3 py-2 truncate max-w-[280px] font-medium text-gray-800" title={r.fileName}>{r.fileName}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-500">{fmtBytes(r.fileSize)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                          {r.duration > 0 ? `${r.duration.toFixed(2)}초` : '—'}
                          {r.durationMatched !== null && (
                            <span className="ml-1 inline-flex items-center rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-semibold text-blue-700">
                              {r.durationMatched}s
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            r.isMp4 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {r.extension ? '.' + r.extension : '—'}
                          </span>
                          {r.mimeType && (
                            <span className="ml-1 text-[9px] text-gray-400">{r.mimeType}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-[10px] text-gray-500">
                          {r.passed ? `${r.durationMatched}초 MP4 매칭` : reasons.join(' · ')}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button onClick={() => removeOne(i)} className="text-gray-400 hover:text-red-500 px-1" title="제거">×</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
