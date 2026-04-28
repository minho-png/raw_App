"use client"

import { useState, useRef } from "react"
import {
  CT_IMAGE_SPECS,
  readImageDimensions,
  checkCtImage,
  type CtImageCheckResult,
} from "@/lib/creative/specs"

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

export default function CtCreativeCheckPage() {
  const [results, setResults] = useState<CtImageCheckResult[]>([])
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFiles(files: FileList | File[]) {
    setBusy(true)
    try {
      const arr = Array.from(files).filter(f => f.type.startsWith('image/'))
      const out: CtImageCheckResult[] = []
      for (const f of arr) {
        try {
          const { width, height } = await readImageDimensions(f)
          out.push(checkCtImage(f.name, f.size, width, height))
        } catch {
          out.push({ fileName: f.name, fileSize: f.size, width: 0, height: 0, matchedSpecs: [], passed: false })
        }
      }
      setResults(prev => [...prev, ...out])
    } finally { setBusy(false) }
  }

  function clearAll() { setResults([]) }
  function removeOne(idx: number) {
    setResults(prev => prev.filter((_, i) => i !== idx))
  }

  const passed = results.filter(r => r.passed).length
  const failed = results.length - passed

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-base font-semibold text-gray-900">CT 소재 검수</h1>
        <p className="text-xs text-gray-400 mt-0.5">CT 이미지 소재 4종 규격(띠 · 전면 · 중간 · 네이티브) 자동 검증</p>
      </header>

      <main className="p-6 space-y-4">
        {/* 규격 안내 */}
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-gray-800">검사 규격</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {CT_IMAGE_SPECS.map(s => (
              <div key={s.key} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <p className="text-[10px] text-gray-500">{s.label}</p>
                <p className="text-sm font-bold text-gray-800 tabular-nums">{s.width} × {s.height}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-gray-500">
            ※ 띠 · 전면은 동일 사이즈(640×100). 업로드 이미지가 해당 사이즈면 둘 다 매칭으로 표기.
          </p>
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
            drag ? 'border-blue-400 bg-blue-50' : 'border-gray-300'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={e => { if (e.target.files) handleFiles(e.target.files); e.target.value = '' }}
          />
          <p className="text-sm font-medium text-gray-700">이미지 파일을 드래그하거나 버튼 클릭</p>
          <p className="text-[11px] text-gray-400 mt-1">jpg / png / webp / gif 등 — 여러 개 동시 업로드 가능</p>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
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
                    <th className="px-3 py-2 text-right font-medium text-gray-500">실제 해상도</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">매칭 규격</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">사유</th>
                    <th className="px-3 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {results.map((r, i) => (
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
                      <td className="px-3 py-2 text-right tabular-nums text-gray-700">{r.width || '-'} × {r.height || '-'}</td>
                      <td className="px-3 py-2">
                        {r.matchedSpecs.length > 0 ? (
                          <div className="flex gap-1 flex-wrap">
                            {r.matchedSpecs.map(s => (
                              <span key={s.key} className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                                {s.label}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[10px] text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[10px] text-gray-500">
                        {r.passed
                          ? r.matchedSpecs.map(s => `${s.label} ${s.width}×${s.height}`).join(', ') + ' 매칭'
                          : (r.width === 0 ? '이미지 로드 실패' : `규격 미일치 (${r.width}×${r.height} → 어떤 규격에도 안 맞음)`)
                        }
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => removeOne(i)} className="text-gray-400 hover:text-red-500 px-1" title="제거">×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
