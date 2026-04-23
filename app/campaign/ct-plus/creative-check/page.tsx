"use client"

import { useState } from "react"
import { Platform, getImageSpecs, getVideoSpecs, checkImageSpec, checkVideoSpec } from "@/lib/adSpecs"
import { PlatformSelector } from "./PlatformSelector"
import SpecTable from "./SpecTable"
import SpecMatchBadge from "./SpecMatchBadge"
import DropZone from "./DropZone"

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
const specLabel = (w: number, h: number) => `\${w}×\${h}`
const isValidMp4 = (file: File) => file.type === 'video/mp4' || file.name.toLowerCase().endsWith('.mp4')
const durationLabel = (sec: number) => `\${Math.round(sec)}초`
const getFileExtension = (name: string) => name.split('.').pop()?.toUpperCase() ?? '?'
const getFileSizeLabel = (bytes: number) => bytes < 1024 * 1024 ? `\${(bytes / 1024).toFixed(0)} KB` : `\${(bytes / 1024 / 1024).toFixed(1)} MB`

// ── 메인 페이지 ───────────────────────────────────────────────
export default function CreativeCheckPage() {
  const [tab, setTab] = useState<Tab>('image')
  const [platform, setPlatform] = useState<Platform>('kakao')
  const [images, setImages] = useState<ImageAsset[]>([])
  const [videos, setVideos] = useState<VideoAsset[]>([])
  const [urls, setUrls] = useState<LandingUrl[]>([])
  const [urlInput, setUrlInput] = useState('')

  // ── 이미지 관리 ────────────────────────────────────────────
  const addImages = (files: File[]) => {
    files.forEach(file => {
      const objectUrl = URL.createObjectURL(file)
      const id = `\${Date.now()}-\${Math.random()}`
      const asset: ImageAsset = { id, file, objectUrl, width: null, height: null, preview: null, loaded: false }
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

  const removeImage = (id: string) => {
    setImages(prev => {
      const a = prev.find(x => x.id === id)
      if (a) URL.revokeObjectURL(a.objectUrl)
      return prev.filter(x => x.id !== id)
    })
  }

  // ── 영상 관리 ──────────────────────────────────────────────
  const addVideos = (files: File[]) => {
    files.forEach(file => {
      const objectUrl = URL.createObjectURL(file)
      const id = `\${Date.now()}-\${Math.random()}`
      const asset: VideoAsset = { id, file, objectUrl, width: null, height: null, duration: null, loaded: false }
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

  const removeVideo = (id: string) => {
    setVideos(prev => {
      const a = prev.find(x => x.id === id)
      if (a) URL.revokeObjectURL(a.objectUrl)
      return prev.filter(x => x.id !== id)
    })
  }

  // ── URL 관리 ───────────────────────────────────────────────
  const addUrl = () => {
    const trimmed = urlInput.trim()
    if (!trimmed) return
    setUrls(prev => [...prev, { id: Date.now().toString(), url: trimmed, checked: false, note: '' }])
    setUrlInput('')
  }

  const removeUrl = (id: string) => {
    setUrls(prev => prev.filter(u => u.id !== id))
  }

  const toggleChecked = (id: string) => {
    setUrls(prev => prev.map(u => u.id === id ? { ...u, checked: !u.checked } : u))
  }

  const updateNote = (id: string, note: string) => {
    setUrls(prev => prev.map(u => u.id === id ? { ...u, note } : u))
  }

  // ── 통계 ───────────────────────────────────────────────────
  const imgPass = images.filter(a => a.loaded && a.width !== null).length
  const imgFail = images.filter(a => a.loaded && a.width === null).length
  const vidPass = videos.filter(a => a.loaded && isValidMp4(a.file)).length
  const vidFail = videos.filter(a => a.loaded && !isValidMp4(a.file)).length

  const imageSpecs = getImageSpecs(platform)
  const videoSpecs = getVideoSpecs(platform)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-gray-900">소재 및 랜딩URL 확인</h1>
            <p className="text-xs text-gray-400 mt-0.5">캠페인 리포트 · CT+ · 소재 검수</p>
          </div>
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
              className={`flex items-center gap-1.5 border-b-2 px-5 py-2.5 text-sm font-medium transition-colors \${
                tab === t.key
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
              {t.count > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold \${
                  tab === t.key ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* 이미지 탭 */}
        {tab === 'image' && (
          <ImageTab
            platform={platform}
            setPlatform={setPlatform}
            images={images}
            imageSpecs={imageSpecs}
            onAdd={addImages}
            onRemove={removeImage}
          />
        )}

        {/* 영상 탭 */}
        {tab === 'video' && (
          <VideoTab
            platform={platform}
            setPlatform={setPlatform}
            videos={videos}
            videoSpecs={videoSpecs}
            onAdd={addVideos}
            onRemove={removeVideo}
          />
        )}

        {/* URL 탭 */}
        {tab === 'url' && (
          <UrlTab
            urls={urls}
            urlInput={urlInput}
            onInputChange={setUrlInput}
            onAdd={addUrl}
            onRemove={removeUrl}
            onToggle={toggleChecked}
            onNoteChange={updateNote}
          />
        )}
      </main>
    </div>
  )
}

// ── 이미지 탭 컴포넌트 ─────────────────────────────────────────
function ImageTab({ platform, setPlatform, images, imageSpecs, onAdd, onRemove }: any) {
  return (
    <div className="space-y-5">
      <PlatformSelector platform={platform} onChange={setPlatform} />
      <div>
        <p className="mb-3 text-sm font-semibold text-gray-700">선택 매체 규격</p>
        <SpecTable specs={imageSpecs} />
      </div>
      <DropZone accept="image/*" multiple onFiles={onAdd}>
        <svg className="h-9 w-9 text-gray-500 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 3h18M3 3v18M21 3v18" />
        </svg>
        <p className="text-sm font-medium text-gray-600">이미지 파일을 여기에 드래그하거나 클릭하여 업로드</p>
        <p className="text-xs text-gray-400">PNG, JPG, GIF, WEBP 등 · 여러 파일 동시 업로드 가능</p>
      </DropZone>
      {images.length > 0 && <ImageResultTable images={images} specs={imageSpecs} onRemove={onRemove} />}
    </div>
  )
}

// ── 영상 탭 컴포넌트 ───────────────────────────────────────────
function VideoTab({ platform, setPlatform, videos, videoSpecs, onAdd, onRemove }: any) {
  return (
    <div className="space-y-5">
      <PlatformSelector platform={platform} onChange={setPlatform} />
      <div>
        <p className="mb-3 text-sm font-semibold text-gray-700">선택 매체 규격</p>
        <SpecTable specs={videoSpecs} />
      </div>
      <DropZone accept="video/*" multiple onFiles={onAdd}>
        <svg className="h-9 w-9 text-gray-500 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
        </svg>
        <p className="text-sm font-medium text-gray-600">영상 파일을 여기에 드래그하거나 클릭하여 업로드</p>
        <p className="text-xs text-gray-400">MP4 권장 · 여러 파일 동시 업로드 가능</p>
      </DropZone>
      {videos.length > 0 && <VideoResultTable videos={videos} specs={videoSpecs} onRemove={onRemove} />}
    </div>
  )
}

// ── URL 탭 컴포넌트 ────────────────────────────────────────────
function UrlTab({ urls, urlInput, onInputChange, onAdd, onRemove, onToggle, onNoteChange }: any) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <p className="mb-3 text-xs font-semibold text-gray-700">랜딩 URL 추가</p>
        <div className="flex gap-2">
          <input
            type="url"
            value={urlInput}
            onChange={e => onInputChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onAdd() }}
            placeholder="https://example.com/landing?utm_source=google&utm_medium=cpc"
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 font-mono"
          />
          <button
            onClick={onAdd}
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
        </div>
      ) : (
        <UrlResultList urls={urls} onRemove={onRemove} onToggle={onToggle} onNoteChange={onNoteChange} />
      )}
    </div>
  )
}

// ── 이미지 결과 테이블 ─────────────────────────────────────────
function ImageResultTable({ images, specs, onRemove }: any) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">미리보기</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">파일명</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">감지된 크기</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">규격 매칭</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {images.map((a: ImageAsset) => {
            const dimLabel = a.width !== null ? specLabel(a.width, a.height!) : '—'
            let bestMatch: any = null
            
            if (a.width !== null && a.height !== null) {
              for (const spec of specs) {
                const result = checkImageSpec(a.width, a.height, spec)
                if (result.matchType === 'exact') {
                  bestMatch = { spec, matchType: 'exact' }
                  break
                } else if (result.matchType === 'ratio-match' && !bestMatch) {
                  bestMatch = { spec, matchType: 'ratio-match' }
                }
              }
            }

            return (
              <tr key={a.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-4 py-3">
                  {a.preview ? (
                    <img src={a.preview} alt="" className="h-10 w-10 rounded object-contain border border-gray-100 bg-gray-50" />
                  ) : (
                    <div className="h-10 w-10 rounded border border-gray-100 bg-gray-100 animate-pulse" />
                  )}
                </td>
                <td className="px-4 py-3">
                  <p className="max-w-[200px] truncate font-medium text-gray-800 text-xs">{a.file.name}</p>
                  <p className="text-[11px] text-gray-400">{getFileSizeLabel(a.file.size)}</p>
                </td>
                <td className="px-4 py-3">
                  {!a.loaded ? (
                    <span className="text-xs text-gray-400">분석 중…</span>
                  ) : (
                    <span className="font-mono text-xs text-gray-700">{dimLabel}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {!a.loaded ? null : bestMatch ? (
                    <SpecMatchBadge matchType={bestMatch.matchType} specName={bestMatch.spec.name} />
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
                <td className="px-3 py-3 text-right">
                  <button onClick={() => onRemove(a.id)} className="rounded p-1 text-gray-500 hover:bg-red-50 hover:text-red-400 transition-colors">
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
  )
}

// ── 영상 결과 테이블 ───────────────────────────────────────────
function VideoResultTable({ videos, specs, onRemove }: any) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">파일명</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">형식</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">해상도</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">길이</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">규격 매칭</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {videos.map((a: VideoAsset) => {
            const isMp4 = isValidMp4(a.file)
            const dimLabel = a.width !== null ? specLabel(a.width, a.height!) : '—'
            const durLabel = a.duration !== null ? durationLabel(a.duration) : '—'
            
            let bestMatch: any = null
            if (a.width !== null && a.height !== null && a.duration !== null && isMp4) {
              for (const spec of specs) {
                const result = checkVideoSpec(a.width, a.height, a.duration, spec)
                if (result.matchType === 'exact') {
                  bestMatch = { spec, matchType: 'exact' }
                  break
                } else if (result.matchType === 'ratio-match' && !bestMatch) {
                  bestMatch = { spec, matchType: 'ratio-match' }
                }
              }
            }

            return (
              <tr key={a.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-4 py-3">
                  <p className="max-w-[200px] truncate font-medium text-gray-800 text-xs">{a.file.name}</p>
                  <p className="text-[11px] text-gray-400">{getFileSizeLabel(a.file.size)}</p>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs \${isMp4 ? 'text-green-500' : 'text-red-400'}`}>
                      {isMp4 ? '✓' : '✕'}
                    </span>
                    <span className={`text-xs \${isMp4 ? 'text-gray-700' : 'text-red-500'}`}>
                      {getFileExtension(a.file.name)}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {!a.loaded ? <span className="text-xs text-gray-400">분석 중…</span> : <span className="font-mono text-xs text-gray-700">{dimLabel}</span>}
                </td>
                <td className="px-4 py-3">
                  {!a.loaded ? <span className="text-xs text-gray-400">분석 중…</span> : <span className="font-mono text-xs text-gray-700">{durLabel}</span>}
                </td>
                <td className="px-4 py-3">
                  {!a.loaded || !isMp4 ? null : bestMatch ? (
                    <SpecMatchBadge matchType={bestMatch.matchType} specName={bestMatch.spec.name} />
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
                <td className="px-3 py-3 text-right">
                  <button onClick={() => onRemove(a.id)} className="rounded p-1 text-gray-500 hover:bg-red-50 hover:text-red-400 transition-colors">
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
  )
}

// ── URL 결과 리스트 ────────────────────────────────────────────
function UrlResultList({ urls, onRemove, onToggle, onNoteChange }: any) {
  return (
    <div className="space-y-3">
      {urls.map((u: LandingUrl, idx: number) => {
        const analysis = u.url ? analyzeUrl(u.url) : null
        return (
          <div key={u.id} className={`rounded-xl border bg-white overflow-hidden transition-colors \${u.checked ? 'border-green-200' : 'border-gray-200'}`}>
            <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-50">
              <button
                onClick={() => onToggle(u.id)}
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors \${
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
              <a href={u.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 truncate text-xs font-mono text-blue-600 hover:underline">
                {u.url}
              </a>
              {analysis?.mmp && <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold \${analysis.mmp.color}`}>{analysis.mmp.name}</span>}
              <button onClick={() => onRemove(u.id)} className="shrink-0 rounded p-1 text-gray-500 hover:bg-red-50 hover:text-red-400 transition-colors">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {analysis && u.url && (
              <div className="px-5 py-3 space-y-3">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-[11px] font-semibold text-gray-500">UTM 파라미터</p>
                    {analysis.hasUtm ? (
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600">{analysis.utmParams.length}개 감지</span>
                    ) : (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-400">없음</span>
                    )}
                  </div>
                  {analysis.hasUtm ? (
                    <div className="flex flex-wrap gap-2">
                      {analysis.utmParams.map(p => (
                        <div key={p.key} className={`rounded-lg border px-3 py-1.5 \${p.color}`}>
                          <p className="text-[10px] font-semibold opacity-60 mb-0.5">{p.label}</p>
                          <p className="text-xs font-mono font-medium">{p.value}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">UTM 파라미터가 없습니다.</p>
                  )}
                  {analysis.hasUtm && analysis.missingUtm.length > 0 && (
                    <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                      <span className="text-amber-500 text-xs">⚠</span>
                      <p className="text-xs text-amber-700">필수 파라미터 누락: {analysis.missingUtm.map(m => m.key).join(', ')}</p>
                    </div>
                  )}
                </div>
                <div>
                  <input
                    type="text"
                    value={u.note}
                    onChange={e => onNoteChange(u.id, e.target.value)}
                    placeholder="메모 입력 (선택)"
                    className="w-full rounded-lg border border-gray-100 bg-gray-50 px-3 py-1.5 text-xs text-gray-600 outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100"
                  />
                </div>
              </div>
            )}
          </div>
        )
      })}
      <div className="rounded-xl border border-gray-100 bg-white px-5 py-3 flex items-center gap-4 text-xs text-gray-500">
        <span>총 {urls.length}개</span>
        <span className="text-green-600 font-medium">확인 완료 {urls.filter((u: LandingUrl) => u.checked).length}개</span>
      </div>
    </div>
  )
}
