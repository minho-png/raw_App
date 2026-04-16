"use client"

import { useState, useRef, useCallback } from "react"

// ── 규격 정의 ─────────────────────────────────────────────────
const IMAGE_SPECS = [
  { w: 300,  h: 250 },
  { w: 640,  h: 100 },
  { w: 640,  h: 960 },
  { w: 1200, h: 627 },
  { w: 80,   h: 80  },
]

const VIDEO_SPEC = {
  w: 1920, h: 1080,
  durations: [15, 30],
  format: 'MP4',
}

// ── 타입 ──────────────────────────────────────────────────────
interface ImageAsset {
  id: string
  file: File
  objectUrl: string
  width: number | null
  height: number | null
  preview: string | null
  loaded: boolean
}

interface VideoAsset {
  id: string
  file: File
  objectUrl: string
  width: number | null
  height: number | null
  duration: number | null
  loaded: boolean
}

interface LandingUrl {
  id: string
  url: string
  checked: boolean
  note: string
}

type Tab = 'image' | 'video' | 'url'

// ── MMP / UTM 분석 ────────────────────────────────────────────
const UTM_META: { key: string; label: string; color: string }[] = [
  { key: 'utm_source',   label: '소스 (Source)',         color: 'bg-blue-50 border-blue-200 text-blue-800' },
  { key: 'utm_medium',   label: '매체 (Medium)',          color: 'bg-violet-50 border-violet-200 text-violet-800' },
  { key: 'utm_campaign', label: '캠페인 (Campaign)',      color: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
  { key: 'utm_term',     label: '키워드 (Term)',          color: 'bg-amber-50 border-amber-200 text-amber-800' },
  { key: 'utm_content',  label: '콘텐츠 (Content)',       color: 'bg-rose-50 border-rose-200 text-rose-800' },
  { key: 'utm_id',       label: 'Campaign ID',            color: 'bg-gray-50 border-gray-200 text-gray-700' },
]

const MMP_PATTERNS: { pattern: RegExp; name: string; color: string }[] = [
  { pattern: /onelink\.me|appsflyer\.com|af\.io/i,       name: 'AppsFlyer',         color: 'bg-green-100 text-green-800' },
  { pattern: /adj\.st|adjust\.com|adjust\.io/i,          name: 'Adjust',            color: 'bg-teal-100 text-teal-800' },
  { pattern: /branch\.io|app\.link|bnc\.lt/i,            name: 'Branch',            color: 'bg-indigo-100 text-indigo-800' },
  { pattern: /singular\.net/i,                           name: 'Singular',          color: 'bg-cyan-100 text-cyan-800' },
  { pattern: /kochava\.com/i,                            name: 'Kochava',           color: 'bg-orange-100 text-orange-800' },
  { pattern: /abr\.ge|airbridge\.io|airbridgeapp\.com/i, name: 'Airbridge',         color: 'bg-pink-100 text-pink-800' },
  { pattern: /click\.mmp\.kakao\.com/i,                  name: 'Kakao MMP',         color: 'bg-yellow-100 text-yellow-800' },
  { pattern: /go\.af\.io/i,                              name: 'AppsFlyer (Short)', color: 'bg-green-100 text-green-800' },
]

// MMP 필수 파라미터
const MMP_REQUIRED_PARAMS = [
  {
    key: 'clk_id',
    placeholder: '{clk_id}',
    label: '클릭 ID',
    desc: '광고 클릭 추적에 필요한 클릭 ID 파라미터',
  },
  {
    key: 'gaid',
    placeholder: '{GAID}',
    label: 'GAID (Google Advertising ID)',
    desc: '안드로이드 기기 식별자(Google Advertising ID)',
  },
]

interface UrlAnalysis {
  hasUtm: boolean
  utmParams: { key: string; value: string; label: string; color: string }[]
  missingUtm: { key: string; label: string }[]
  mmp: { name: string; color: string } | null
  missingMmpParams: { key: string; placeholder: string; label: string; desc: string }[]
}

function analyzeUrl(urlStr: string): UrlAnalysis {
  try {
    const url = new URL(urlStr)
    const params = url.searchParams
    const utmParams = UTM_META
      .filter(m => params.has(m.key))
      .map(m => ({ key: m.key, value: params.get(m.key)!, label: m.label, color: m.color }))
    const missingUtm = UTM_META
      .filter(m => ['utm_source', 'utm_medium', 'utm_campaign'].includes(m.key) && !params.has(m.key))
      .map(m => ({ key: m.key, label: m.label }))
    const fullUrl = urlStr.toLowerCase()
    const mmpMatch = MMP_PATTERNS.find(p => p.pattern.test(fullUrl)) ?? null

    // MMP 필수 파라미터 누락 확인 (key 로 쿼리스트링 검색 + placeholder 문자열 검색)
    const missingMmpParams = mmpMatch
      ? MMP_REQUIRED_PARAMS.filter(p => {
          const hasKey = params.has(p.key) || params.has(p.key.toUpperCase())
          const hasPlaceholder = urlStr.includes(p.placeholder)
          return !hasKey && !hasPlaceholder
        })
      : []

    return {
      hasUtm: utmParams.length > 0,
      utmParams,
      missingUtm,
      mmp: mmpMatch ? { name: mmpMatch.name, color: mmpMatch.color } : null,
      missingMmpParams,
    }
  } catch {
    return { hasUtm: false, utmParams: [], missingUtm: [], mmp: null, missingMmpParams: [] }
  }
}

// ── 유틸 ──────────────────────────────────────────────────────
function specLabel(w: number, h: number) { return `${w}×${h}` }

function matchesImageSpec(w: number, h: number) {
  return IMAGE_SPECS.find(s => s.w === w && s.h === h) ?? null
}

function isValidMp4(file: File) {
  return file.type === 'video/mp4' || file.name.toLowerCase().endsWith('.mp4')
}

function durationLabel(sec: number) {
  const r = Math.round(sec)
  return `${r}초`
}

function isDurationOk(sec: number) {
  return VIDEO_SPEC.durations.some(d => Math.abs(sec - d) < 0.5)
}

// ── 드래그앤드롭 영역 ─────────────────────────────────────────
function DropZone({
  accept, multiple, onFiles, children,
}: {
  accept: string
  multiple?: boolean
  onFiles: (files: File[]) => void
  children: React.ReactNode
}) {
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const items = Array.from(e.dataTransfer.files)
    if (items.length) onFiles(items)
  }, [onFiles])

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`cursor-pointer rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
        dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={e => {
          const items = Array.from(e.target.files ?? [])
          if (items.length) onFiles(items)
          e.target.value = ''
        }}
      />
      {children}
    </div>
  )
}

// ── 메인 페이지 ───────────────────────────────────────────────
export default function CreativeCheckPage() {
  const [tab, setTab] = useState<Tab>('image')

  // 이미지 소재
  const [images, setImages] = useState<ImageAsset[]>([])

  // 영상 소재
  const [videos, setVideos] = useState<VideoAsset[]>([])

  // 랜딩 URL
  const [urls, setUrls] = useState<LandingUrl[]>([])
  const [urlInput, setUrlInput] = useState('')

  // ── 이미지 추가 ────────────────────────────────────────────
  function addImages(files: File[]) {
    files.forEach(file => {
      const objectUrl = URL.createObjectURL(file)
      const id = `${Date.now()}-${Math.random()}`
      const asset: ImageAsset = {
        id, file, objectUrl,
        width: null, height: null, preview: null,
        loaded: false,
      }
      setImages(prev => [...prev, asset])

      const img = new window.Image()
      img.onload = () => {
        setImages(prev => prev.map(a => a.id === id
          ? { ...a, width: img.naturalWidth, height: img.naturalHeight, preview: objectUrl, loaded: true }
          : a
        ))
      }
      img.onerror = () => {
        setImages(prev => prev.map(a => a.id === id ? { ...a, loaded: true } : a))
      }
      img.src = objectUrl
    })
  }

  function removeImage(id: string) {
    setImages(prev => {
      const a = prev.find(x => x.id === id)
      if (a) URL.revokeObjectURL(a.objectUrl)
      return prev.filter(x => x.id !== id)
    })
  }

  // ── 영상 추가 ──────────────────────────────────────────────
  function addVideos(files: File[]) {
    files.forEach(file => {
      const objectUrl = URL.createObjectURL(file)
      const id = `${Date.now()}-${Math.random()}`
      const asset: VideoAsset = {
        id, file, objectUrl,
        width: null, height: null, duration: null,
        loaded: false,
      }
      setVideos(prev => [...prev, asset])

      const vid = document.createElement('video')
      vid.preload = 'metadata'
      vid.onloadedmetadata = () => {
        setVideos(prev => prev.map(a => a.id === id
          ? { ...a, width: vid.videoWidth, height: vid.videoHeight, duration: vid.duration, loaded: true }
          : a
        ))
      }
      vid.onerror = () => {
        setVideos(prev => prev.map(a => a.id === id ? { ...a, loaded: true } : a))
      }
      vid.src = objectUrl
    })
  }

  function removeVideo(id: string) {
    setVideos(prev => {
      const a = prev.find(x => x.id === id)
      if (a) URL.revokeObjectURL(a.objectUrl)
      return prev.filter(x => x.id !== id)
    })
  }

  // ── 랜딩 URL ───────────────────────────────────────────────
  function addUrl() {
    const trimmed = urlInput.trim()
    if (!trimmed) return
    setUrls(prev => [...prev, { id: Date.now().toString(), url: trimmed, checked: false, note: '' }])
    setUrlInput('')
  }

  function removeUrl(id: string) {
    setUrls(prev => prev.filter(u => u.id !== id))
  }

  function toggleChecked(id: string) {
    setUrls(prev => prev.map(u => u.id === id ? { ...u, checked: !u.checked } : u))
  }

  function updateNote(id: string, note: string) {
    setUrls(prev => prev.map(u => u.id === id ? { ...u, note } : u))
  }

  // ── 통계 ───────────────────────────────────────────────────
  const imgPass  = images.filter(a => a.loaded && a.width !== null && matchesImageSpec(a.width!, a.height!)).length
  const imgFail  = images.filter(a => a.loaded && (a.width === null || !matchesImageSpec(a.width!, a.height!))).length
  const vidPass  = videos.filter(a => a.loaded && isValidMp4(a.file) && a.width === VIDEO_SPEC.w && a.height === VIDEO_SPEC.h && a.duration !== null && isDurationOk(a.duration)).length
  const vidFail  = videos.filter(a => a.loaded && !(isValidMp4(a.file) && a.width === VIDEO_SPEC.w && a.height === VIDEO_SPEC.h && a.duration !== null && isDurationOk(a.duration))).length

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-gray-900">소재 및 랜딩URL 확인</h1>
            <p className="text-xs text-gray-400 mt-0.5">캠페인 리포트 · CT+ · 소재 검수</p>
          </div>
          {/* 요약 뱃지 */}
          <div className="flex items-center gap-2 text-xs">
            {images.length > 0 && (
              <div className="flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1">
                <span className="text-gray-500">이미지</span>
                <span className="font-semibold text-green-600">{imgPass}개 적합</span>
                {imgFail > 0 && <span className="font-semibold text-red-500">{imgFail}개 부적합</span>}
              </div>
            )}
            {videos.length > 0 && (
              <div className="flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1">
                <span className="text-gray-500">영상</span>
                <span className="font-semibold text-green-600">{vidPass}개 적합</span>
                {vidFail > 0 && <span className="font-semibold text-red-500">{vidFail}개 부적합</span>}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="p-6">
        {/* 탭 */}
        <div className="mb-6 flex gap-1 border-b border-gray-200">
          {([
            { key: 'image', label: '이미지 소재', count: images.length },
            { key: 'video', label: '영상 소재',   count: videos.length },
            { key: 'url',   label: '랜딩 URL',    count: urls.length   },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 border-b-2 px-5 py-2.5 text-sm font-medium transition-colors ${
                tab === t.key
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
              {t.count > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  tab === t.key ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── 이미지 소재 탭 ────────────────────────────────── */}
        {tab === 'image' && (
          <div className="space-y-5">
            {/* 규격 안내 */}
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-5 py-4">
              <p className="mb-2 text-xs font-semibold text-blue-700">크로스타겟 이미지 규격 (필수 충족)</p>
              <div className="flex flex-wrap gap-2">
                {IMAGE_SPECS.map(s => (
                  <span key={`${s.w}x${s.h}`} className="rounded-md bg-white border border-blue-200 px-3 py-1 text-xs font-mono font-medium text-blue-800">
                    {specLabel(s.w, s.h)}
                  </span>
                ))}
              </div>
            </div>

            {/* 드롭존 */}
            <DropZone accept="image/*" multiple onFiles={addImages}>
              <div className="flex flex-col items-center gap-2">
                <svg className="h-9 w-9 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 3h18M3 3v18M21 3v18" />
                </svg>
                <p className="text-sm font-medium text-gray-600">이미지 파일을 여기에 드래그하거나 클릭하여 업로드</p>
                <p className="text-xs text-gray-400">PNG, JPG, GIF, WEBP 등 · 여러 파일 동시 업로드 가능</p>
              </div>
            </DropZone>

            {/* 결과 테이블 */}
            {images.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">미리보기</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">파일명</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">감지된 크기</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">일치 규격</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">결과</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {images.map(a => {
                      const matched = a.width !== null && a.height !== null
                        ? matchesImageSpec(a.width, a.height)
                        : null
                      const pass = !!matched
                      const dimLabel = a.width !== null ? specLabel(a.width, a.height!) : '—'

                      return (
                        <tr key={a.id} className="hover:bg-gray-50/50 transition-colors">
                          {/* 미리보기 */}
                          <td className="px-4 py-3">
                            {a.preview ? (
                              <img
                                src={a.preview}
                                alt=""
                                className="h-10 w-10 rounded object-contain border border-gray-100 bg-gray-50"
                              />
                            ) : (
                              <div className="h-10 w-10 rounded border border-gray-100 bg-gray-100 animate-pulse" />
                            )}
                          </td>
                          {/* 파일명 */}
                          <td className="px-4 py-3">
                            <p className="max-w-[200px] truncate font-medium text-gray-800 text-xs">{a.file.name}</p>
                            <p className="text-[11px] text-gray-400">{(a.file.size / 1024).toFixed(0)} KB</p>
                          </td>
                          {/* 크기 */}
                          <td className="px-4 py-3">
                            {!a.loaded ? (
                              <span className="text-xs text-gray-400">분석 중…</span>
                            ) : (
                              <span className="font-mono text-xs text-gray-700">{dimLabel}</span>
                            )}
                          </td>
                          {/* 일치 규격 */}
                          <td className="px-4 py-3">
                            {matched ? (
                              <span className="rounded-md bg-green-50 border border-green-200 px-2 py-0.5 font-mono text-xs text-green-700">
                                {specLabel(matched.w, matched.h)}
                              </span>
                            ) : a.loaded ? (
                              <span className="text-xs text-gray-400">해당 없음</span>
                            ) : null}
                          </td>
                          {/* 결과 */}
                          <td className="px-4 py-3">
                            {!a.loaded ? null : pass ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
                                <span>✓</span> 적합
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-600">
                                <span>✕</span> 부적합
                              </span>
                            )}
                          </td>
                          {/* 삭제 */}
                          <td className="px-3 py-3 text-right">
                            <button
                              onClick={() => removeImage(a.id)}
                              className="rounded p-1 text-gray-500 hover:bg-red-50 hover:text-red-400 transition-colors"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>

                {/* 미달 규격 안내 */}
                {(() => {
                  const uploadedSpecs = new Set(
                    images.filter(a => a.width).map(a => `${a.width}x${a.height}`)
                  )
                  const missing = IMAGE_SPECS.filter(s => !uploadedSpecs.has(`${s.w}x${s.h}`))
                  return missing.length > 0 && (
                    <div className="border-t border-gray-100 bg-amber-50 px-5 py-3">
                      <p className="text-xs text-amber-700">
                        <span className="font-semibold">미전달 규격:</span>{' '}
                        {missing.map(s => specLabel(s.w, s.h)).join(', ')}
                      </p>
                    </div>
                  )
                })()}
              </div>
            )}
          </div>
        )}

        {/* ── 영상 소재 탭 ──────────────────────────────────── */}
        {tab === 'video' && (
          <div className="space-y-5">
            {/* 규격 안내 */}
            <div className="rounded-xl border border-purple-100 bg-purple-50 px-5 py-4">
              <p className="mb-2 text-xs font-semibold text-purple-700">크로스타겟TV 영상 규격 (필수 충족)</p>
              <div className="flex flex-wrap gap-3">
                <div className="rounded-md bg-white border border-purple-200 px-3 py-2">
                  <p className="text-[10px] text-gray-400 mb-0.5">해상도</p>
                  <p className="font-mono text-xs font-semibold text-purple-800">{specLabel(VIDEO_SPEC.w, VIDEO_SPEC.h)}</p>
                </div>
                <div className="rounded-md bg-white border border-purple-200 px-3 py-2">
                  <p className="text-[10px] text-gray-400 mb-0.5">파일 형식</p>
                  <p className="font-mono text-xs font-semibold text-purple-800">{VIDEO_SPEC.format}</p>
                </div>
                <div className="rounded-md bg-white border border-purple-200 px-3 py-2">
                  <p className="text-[10px] text-gray-400 mb-0.5">소재 길이</p>
                  <p className="font-mono text-xs font-semibold text-purple-800">{VIDEO_SPEC.durations.map(d => `${d}초`).join(' 또는 ')}</p>
                </div>
              </div>
            </div>

            {/* 드롭존 */}
            <DropZone accept="video/*" multiple onFiles={addVideos}>
              <div className="flex flex-col items-center gap-2">
                <svg className="h-9 w-9 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                </svg>
                <p className="text-sm font-medium text-gray-600">영상 파일을 여기에 드래그하거나 클릭하여 업로드</p>
                <p className="text-xs text-gray-400">MP4 권장 · 여러 파일 동시 업로드 가능</p>
              </div>
            </DropZone>

            {/* 결과 테이블 */}
            {videos.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">파일명</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">형식</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">해상도</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">길이</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">결과</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {videos.map(a => {
                      const isMp4    = isValidMp4(a.file)
                      const dimOk    = a.width === VIDEO_SPEC.w && a.height === VIDEO_SPEC.h
                      const durOk    = a.duration !== null && isDurationOk(a.duration)
                      const pass     = a.loaded && isMp4 && dimOk && durOk
                      const dimLabel = a.width !== null ? specLabel(a.width, a.height!) : '—'
                      const durLabel = a.duration !== null ? durationLabel(a.duration) : '—'

                      return (
                        <tr key={a.id} className="hover:bg-gray-50/50 transition-colors">
                          {/* 파일명 */}
                          <td className="px-4 py-3">
                            <p className="max-w-[200px] truncate font-medium text-gray-800 text-xs">{a.file.name}</p>
                            <p className="text-[11px] text-gray-400">{(a.file.size / 1024 / 1024).toFixed(1)} MB</p>
                          </td>
                          {/* 형식 */}
                          <td className="px-4 py-3">
                            <CheckCell ok={isMp4} label={a.file.name.split('.').pop()?.toUpperCase() ?? '?'} />
                          </td>
                          {/* 해상도 */}
                          <td className="px-4 py-3">
                            {!a.loaded ? (
                              <span className="text-xs text-gray-400">분석 중…</span>
                            ) : (
                              <CheckCell ok={dimOk} label={dimLabel} />
                            )}
                          </td>
                          {/* 길이 */}
                          <td className="px-4 py-3">
                            {!a.loaded ? null : (
                              <CheckCell ok={durOk} label={durLabel} />
                            )}
                          </td>
                          {/* 결과 */}
                          <td className="px-4 py-3">
                            {!a.loaded ? null : pass ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
                                <span>✓</span> 적합
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-600">
                                <span>✕</span> 부적합
                              </span>
                            )}
                          </td>
                          {/* 삭제 */}
                          <td className="px-3 py-3 text-right">
                            <button
                              onClick={() => removeVideo(a.id)}
                              className="rounded p-1 text-gray-500 hover:bg-red-50 hover:text-red-400 transition-colors"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── 랜딩 URL 탭 ───────────────────────────────────── */}
        {tab === 'url' && (
          <div className="space-y-5">
            {/* URL 입력 */}
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <p className="mb-3 text-xs font-semibold text-gray-700">랜딩 URL 추가</p>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addUrl() }}
                  placeholder="https://example.com/landing?utm_source=google&utm_medium=cpc"
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 font-mono"
                />
                <button
                  onClick={addUrl}
                  disabled={!urlInput.trim()}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
                >
                  추가
                </button>
              </div>
            </div>

            {urls.length === 0 ? (
              <div className="rounded-xl border border-gray-200 bg-white px-6 py-12 text-center">
                <p className="text-sm text-gray-400">추가된 랜딩 URL이 없습니다.</p>
                <p className="mt-1 text-xs text-gray-500">URL을 입력하면 UTM 파라미터와 MMP 트래커를 자동으로 분석합니다.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {urls.map((u, idx) => {
                  const analysis = u.url ? analyzeUrl(u.url) : null
                  return (
                    <div
                      key={u.id}
                      className={`rounded-xl border bg-white overflow-hidden transition-colors ${u.checked ? 'border-green-200' : 'border-gray-200'}`}
                    >
                      {/* URL 헤더 */}
                      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-50">
                        <button
                          onClick={() => toggleChecked(u.id)}
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${
                            u.checked ? 'border-green-500 bg-green-500 text-white' : 'border-gray-300 hover:border-green-400'
                          }`}
                        >
                          {u.checked && (
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                        <span className="text-[11px] font-semibold text-gray-400 shrink-0">#{idx + 1}</span>
                        <a
                          href={u.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 min-w-0 truncate text-xs font-mono text-blue-600 hover:underline"
                        >
                          {u.url}
                        </a>
                        {/* MMP 뱃지 */}
                        {analysis?.mmp && (
                          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${analysis.mmp.color}`}>
                            {analysis.mmp.name}
                          </span>
                        )}
                        <button
                          onClick={() => removeUrl(u.id)}
                          className="shrink-0 rounded p-1 text-gray-500 hover:bg-red-50 hover:text-red-400 transition-colors"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>

                      {/* 분석 결과 */}
                      {analysis && u.url && (
                        <div className="px-5 py-3 space-y-3">
                          {/* UTM 파라미터 */}
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <p className="text-[11px] font-semibold text-gray-500">UTM 파라미터</p>
                              {analysis.hasUtm ? (
                                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600">
                                  {analysis.utmParams.length}개 감지
                                </span>
                              ) : (
                                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-400">
                                  없음
                                </span>
                              )}
                            </div>
                            {analysis.hasUtm ? (
                              <div className="flex flex-wrap gap-2">
                                {analysis.utmParams.map(p => (
                                  <div key={p.key} className={`rounded-lg border px-3 py-1.5 ${p.color}`}>
                                    <p className="text-[10px] font-semibold opacity-60 mb-0.5">{p.label}</p>
                                    <p className="text-xs font-mono font-medium">{p.value}</p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-gray-400">UTM 파라미터가 없습니다. 성과 추적을 위해 utm_source, utm_medium, utm_campaign 추가를 권장합니다.</p>
                            )}
                            {/* 필수 UTM 누락 경고 */}
                            {analysis.hasUtm && analysis.missingUtm.length > 0 && (
                              <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                                <span className="text-amber-500 text-xs">⚠</span>
                                <p className="text-xs text-amber-700">
                                  필수 파라미터 누락: {analysis.missingUtm.map(m => m.key).join(', ')}
                                </p>
                              </div>
                            )}
                          </div>

                          {/* MMP */}
                          <div>
                            <p className="text-[11px] font-semibold text-gray-500 mb-2">MMP 트래커</p>
                            {analysis.mmp ? (
                              <div className="space-y-2">
                                <div className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 ${analysis.mmp.color} border-current/20`}>
                                  <span className="text-sm">🔗</span>
                                  <div>
                                    <p className="text-xs font-semibold">{analysis.mmp.name}</p>
                                    <p className="text-[10px] opacity-70">MMP(앱 트래커) 링크 감지됨</p>
                                  </div>
                                </div>
                                {/* 필수 파라미터 확인 */}
                                <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 space-y-1.5">
                                  <p className="text-[11px] font-semibold text-gray-500 mb-2">필수 파라미터 확인</p>
                                  {MMP_REQUIRED_PARAMS.map(p => {
                                    const missing = analysis.missingMmpParams.some(m => m.key === p.key)
                                    return (
                                      <div key={p.key} className={`flex items-start gap-2 rounded-lg px-3 py-2 border ${missing ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                                        <span className={`mt-0.5 text-xs font-bold ${missing ? 'text-red-500' : 'text-green-500'}`}>
                                          {missing ? '✕' : '✓'}
                                        </span>
                                        <div className="min-w-0">
                                          <p className={`text-xs font-semibold ${missing ? 'text-red-700' : 'text-green-700'}`}>
                                            {p.label}
                                            <span className="ml-1.5 font-mono text-[10px] opacity-70">{p.placeholder}</span>
                                          </p>
                                          {missing && (
                                            <p className="text-[11px] text-red-500 mt-0.5">{p.desc}가 누락되었습니다.</p>
                                          )}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs text-gray-400">알려진 MMP 트래커가 감지되지 않았습니다.</p>
                            )}
                          </div>

                          {/* 메모 */}
                          <div>
                            <input
                              type="text"
                              value={u.note}
                              onChange={e => updateNote(u.id, e.target.value)}
                              placeholder="메모 입력 (선택)"
                              className="w-full rounded-lg border border-gray-100 bg-gray-50 px-3 py-1.5 text-xs text-gray-600 outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* 요약 */}
                <div className="rounded-xl border border-gray-100 bg-white px-5 py-3 flex items-center gap-4 text-xs text-gray-500">
                  <span>총 {urls.length}개</span>
                  <span className="text-green-600 font-medium">확인 완료 {urls.filter(u => u.checked).length}개</span>
                  {urls.some(u => !u.checked) && (
                    <span className="text-amber-500">미확인 {urls.filter(u => !u.checked).length}개</span>
                  )}
                  <span>UTM 포함 {urls.filter(u => u.url && analyzeUrl(u.url).hasUtm).length}개</span>
                  <span>MMP 감지 {urls.filter(u => u.url && analyzeUrl(u.url).mmp).length}개</span>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

// ── 인라인 체크셀 컴포넌트 ────────────────────────────────────
function CheckCell({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`text-xs ${ok ? 'text-green-500' : 'text-red-400'}`}>
        {ok ? '✓' : '✕'}
      </span>
      <span className={`font-mono text-xs ${ok ? 'text-gray-700' : 'text-red-500'}`}>
        {label}
      </span>
    </div>
  )
}
