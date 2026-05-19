"use client"

import { useState, useRef } from "react"
import {
  CT_IMAGE_SPECS, CT_VIDEO_SPECS,
  CT_VIDEO_MAX_SIZE_BYTES, CT_VIDEO_MAX_DURATION_SEC, CT_VIDEO_MAX_BITRATE_KBPS,
  readImageDimensions, readVideoMetadata,
  checkCtImage, checkCtVideo,
  type CtImageCheckResult, type CtVideoCheckResult,
} from "@/lib/creative/specs"

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}
function fmtDuration(s: number): string {
  if (!Number.isFinite(s) || s <= 0) return '-'
  return `${s.toFixed(1)}s`
}

type Tab = 'image' | 'video'

export default function CtCreativeCheckPage() {
  const [tab, setTab] = useState<Tab>('image')
  const [imageResults, setImageResults] = useState<CtImageCheckResult[]>([])
  const [videoResults, setVideoResults] = useState<CtVideoCheckResult[]>([])
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleImageFiles(files: FileList | File[]) {
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
      setImageResults(prev => [...prev, ...out])
    } finally { setBusy(false) }
  }

  async function handleVideoFiles(files: FileList | File[]) {
    setBusy(true)
    try {
      const arr = Array.from(files).filter(f => f.type.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(f.name))
      const out: CtVideoCheckResult[] = []
      for (const f of arr) {
        try {
          const { duration, extension, mimeType, width, height } = await readVideoMetadata(f)
          out.push(checkCtVideo(f.name, f.size, duration, extension, mimeType, width, height))
        } catch {
          out.push({
            fileName: f.name, fileSize: f.size, width: 0, height: 0, duration: 0,
            extension: '', mimeType: f.type, bitrateKbps: 0, matchedSpec: null,
            isMp4: false, durationOk: false, sizeOk: false, bitrateOk: false,
            passed: false, issues: ['영상 메타데이터 읽기 실패 (브라우저 미지원 포맷일 수 있음)'],
          })
        }
      }
      setVideoResults(prev => [...prev, ...out])
    } finally { setBusy(false) }
  }

  function handleFiles(files: FileList | File[]) {
    if (tab === 'image') handleImageFiles(files)
    else handleVideoFiles(files)
  }
  function clearAll() {
    if (tab === 'image') setImageResults([])
    else setVideoResults([])
  }
  function removeOne(idx: number) {
    if (tab === 'image') setImageResults(prev => prev.filter((_, i) => i !== idx))
    else setVideoResults(prev => prev.filter((_, i) => i !== idx))
  }

  const imagePassed = imageResults.filter(r => r.passed).length
  const imageFailed = imageResults.length - imagePassed
  const videoPassed = videoResults.filter(r => r.passed).length
  const videoFailed = videoResults.length - videoPassed

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-base font-semibold text-gray-900">CT 소재 검수</h1>
        <p className="text-xs text-gray-400 mt-0.5">CT 이미지 4종(띠 · 전면 · 중간 · 네이티브) 및 영상(가로형 · 세로형) 자동 검증</p>
      </header>

      <main className="p-6 space-y-4">
        {/* 탭 — 이미지 / 영상 */}
        <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1 w-fit">
          <button
            onClick={() => setTab('image')}
            className={`rounded-md px-4 py-1.5 text-xs font-medium transition-colors ${
              tab === 'image' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >이미지 ({imageResults.length})</button>
          <button
            onClick={() => setTab('video')}
            className={`rounded-md px-4 py-1.5 text-xs font-medium transition-colors ${
              tab === 'video' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >영상 ({videoResults.length})</button>
        </div>

        {/* 규격 안내 */}
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          {tab === 'image' ? (
            <>
              <h2 className="mb-2 text-sm font-semibold text-gray-800">이미지 검사 규격</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {CT_IMAGE_SPECS.map(s => (
                  <div key={s.key} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                    <p className="text-[10px] text-gray-500">{s.label}</p>
                    <p className="text-sm font-bold text-gray-800 tabular-nums">{s.width} × {s.height}</p>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-gray-500">
                ※ 업로드 이미지의 해상도가 위 규격 중 하나와 정확히 일치하면 통과.
              </p>
            </>
          ) : (
            <>
              <h2 className="mb-2 text-sm font-semibold text-gray-800">영상 검사 규격 (CT 비디오)</h2>
              <div className="grid grid-cols-2 gap-2">
                {CT_VIDEO_SPECS.map(s => (
                  <div key={s.key} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                    <p className="text-[10px] text-gray-500">{s.label}</p>
                    <p className="text-sm font-bold text-gray-800 tabular-nums">{s.width} × {s.height}</p>
                  </div>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <div className="rounded border border-gray-200 px-2 py-1">길이 ≤ <b>{CT_VIDEO_MAX_DURATION_SEC}초</b></div>
                <div className="rounded border border-gray-200 px-2 py-1">용량 ≤ <b>{CT_VIDEO_MAX_SIZE_BYTES / 1024 / 1024}MB</b></div>
                <div className="rounded border border-gray-200 px-2 py-1">비트레이트 ≤ <b>{CT_VIDEO_MAX_BITRATE_KBPS}kbps</b></div>
                <div className="rounded border border-gray-200 px-2 py-1">포맷 <b>MP4</b> · H.264/AAC</div>
              </div>
              <p className="mt-2 text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1.5">
                ⚠ 브라우저 검사: 해상도 · 길이 · 용량 · 비트레이트(추정) · MP4 여부 자동 검증.
                Frame rate (30FPS), 코덱(H.264/AAC), 오디오 출력 (-23 LUFS) 은 별도 확인 필요.
              </p>
            </>
          )}
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
            accept={tab === 'image' ? 'image/*' : 'video/*,.mp4,.mov,.m4v,.webm'}
            multiple
            className="hidden"
            onChange={e => { if (e.target.files) handleFiles(e.target.files); e.target.value = '' }}
          />
          <p className="text-sm font-medium text-gray-700">
            {tab === 'image' ? '이미지' : '영상'} 파일을 드래그하거나 버튼 클릭
          </p>
          <p className="text-[11px] text-gray-400 mt-1">
            {tab === 'image' ? 'jpg / png / webp / gif 등' : 'mp4 (권장) / mov / m4v / webm'} — 여러 개 동시 업로드 가능
          </p>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? '검사 중...' : '파일 선택'}
          </button>
        </section>

        {/* 결과 */}
        {tab === 'image' && imageResults.length > 0 && (
          <section className="rounded-xl border border-gray-200 bg-white">
            <header className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
              <h2 className="text-sm font-semibold text-gray-800">이미지 검사 결과</h2>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-emerald-600 font-medium">✓ 통과 {imagePassed}</span>
                <span className="text-red-600 font-medium">✗ 실패 {imageFailed}</span>
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
                  {imageResults.map((r, i) => (
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

        {tab === 'video' && videoResults.length > 0 && (
          <section className="rounded-xl border border-gray-200 bg-white">
            <header className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
              <h2 className="text-sm font-semibold text-gray-800">영상 검사 결과</h2>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-emerald-600 font-medium">✓ 통과 {videoPassed}</span>
                <span className="text-red-600 font-medium">✗ 실패 {videoFailed}</span>
                <button onClick={clearAll} className="rounded-md border border-gray-200 px-2 py-1 text-[10px] text-gray-600 hover:bg-gray-50">전체 비우기</button>
              </div>
            </header>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-500 w-10">상태</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">파일명</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">유형</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">해상도</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">길이</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">용량</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">비트레이트 (추정)</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">사유</th>
                    <th className="px-3 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {videoResults.map((r, i) => (
                    <tr key={i} className={r.passed ? '' : 'bg-red-50/30'}>
                      <td className="px-3 py-2">
                        {r.passed ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">✓ 통과</span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">✗ 실패</span>
                        )}
                      </td>
                      <td className="px-3 py-2 truncate max-w-[260px] font-medium text-gray-800" title={r.fileName}>{r.fileName}</td>
                      <td className="px-3 py-2">
                        {r.matchedSpec ? (
                          <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                            {r.matchedSpec.label}
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-400">—</span>
                        )}
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums ${r.matchedSpec ? 'text-gray-700' : 'text-red-700 font-medium'}`}>
                        {r.width || '-'} × {r.height || '-'}
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums ${r.durationOk ? 'text-gray-700' : 'text-red-700 font-medium'}`}>
                        {fmtDuration(r.duration)}
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums ${r.sizeOk ? 'text-gray-500' : 'text-red-700 font-medium'}`}>
                        {fmtBytes(r.fileSize)}
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums ${r.bitrateOk ? 'text-gray-500' : 'text-red-700 font-medium'}`}>
                        {r.bitrateKbps > 0 ? `${r.bitrateKbps} kbps` : '-'}
                      </td>
                      <td className="px-3 py-2 text-[10px] text-gray-500">
                        {r.passed
                          ? `${r.matchedSpec?.label ?? ''} ${r.width}×${r.height} · ${fmtDuration(r.duration)} · ${(r.fileSize / 1024 / 1024).toFixed(1)}MB · ${r.bitrateKbps}kbps`
                          : (r.issues.length > 0 ? r.issues.join(' · ') : '검사 실패')
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
