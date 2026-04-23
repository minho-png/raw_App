"use client"

import { useState, useRef, useEffect } from "react"
import type { Campaign, Agency, Advertiser } from '@/lib/campaignTypes'
import { useMasterData } from "@/lib/hooks/useMasterData"

// ── Types ─────────────────────────────────────────────────────
interface CoverRect { xR: number; yR: number; wR: number; hR: number; fill: string }

type Layer = { id: string; label: string; visible: boolean } & (
  | { type: "image";  img: HTMLImageElement; xR: number; yR: number; wR: number; hR: number; radiusPct: number }
  | { type: "text";   text: string; xR: number; yR: number; sizeR: number; color: string; weight: string; align: CanvasTextAlign; cover?: CoverRect }
  | { type: "button"; text: string; xR: number; yR: number; wR: number; hR: number; rR: number; bg: string; fg: string; sizeR: number; borderColor?: string; cover?: CoverRect }
  | { type: "logo";   img: HTMLImageElement | null; cxR: number; cyR: number; rR: number; coverFill: string }
)

interface PresetTextDef {
  label: string; default: string; cover: CoverRect
  draw:
    | { type: "text";   xR: number; yR: number; sizeR: number; fill: string; weight?: string; align?: CanvasTextAlign }
    | { type: "button"; xR: number; yR: number; wR: number; hR: number; rR: number; bg: string; fg: string; sizeR: number; borderColor?: string }
}
interface PresetLogoDef { label: string; coverFill: string; cxR: number; cyR: number; rR: number }
interface Preset {
  id: string; label: string; src: string
  imagePos: { xR: number; yR: number; wR: number; hR: number; radiusPct: number }
  textDefs?: PresetTextDef[]
  logoDef?: PresetLogoDef
}

// ── Presets ───────────────────────────────────────────────────
const PRESETS: Preset[] = [
  {
    id: "bizboard", label: "카카오 비즈보드 (채팅탭)",
    src: "/%EC%B9%B4%EC%B9%B4%EC%98%A4%20%EB%B9%84%EC%A6%88%EB%B3%B4%EB%93%9C.png",
    imagePos: { xR: 0.030, yR: 0.155, wR: 0.925, hR: 0.100, radiusPct: 0.032 },
  },
  {
    // 실측: 배경 323×720, 텍스트 스트립 y=539~576 (yR 0.748~0.800)
    id: "native-1200x600", label: "카카오 네이티브 1200×600 (더보기탭)",
    src: "/%EC%B9%B4%EC%B9%B4%EC%98%A4%20%EB%84%A4%EC%9D%B4%ED%8B%B0%EB%B8%8C%201200X600.png",
    imagePos: { xR: 0.040, yR: 0.540, wR: 0.925, hR: 0.195, radiusPct: 0.016 },
    textDefs: [
      {
        label: "광고 제목", default: "광고 제목",
        cover: { xR: 0.010, yR: 0.746, wR: 0.722, hR: 0.056, fill: "#FFFFFF" },
        draw: { type: "text", xR: 0.035, yR: 0.774, sizeR: 0.038, fill: "#222222", weight: "500" },
      },
      {
        label: "버튼", default: "바로가기",
        cover: { xR: 0.732, yR: 0.748, wR: 0.248, hR: 0.052, fill: "#FFFFFF" },
        draw: { type: "button", xR: 0.736, yR: 0.752, wR: 0.240, hR: 0.044, rR: 0.012, bg: "#FFFFFF", fg: "#222222", sizeR: 0.033, borderColor: "#CCCCCC" },
      },
    ],
  },
  {
    // 실측: 배경 323×720, 광고이미지 y=78~428, 문구 y=475~505, 버튼 y=508~545
    id: "native-1000x800", label: "카카오 네이티브 1000×800 (피드탭)",
    src: "/%EC%B9%B4%EC%B9%B4%EC%98%A4%20%EB%84%A4%EC%9D%B4%ED%8B%B0%EB%B8%8C1000x800.jpg",
    imagePos: { xR: 0.031, yR: 0.108, wR: 0.938, hR: 0.486, radiusPct: 0.020 },
    textDefs: [
      {
        label: "브랜드명", default: "브랜드",
        cover: { xR: 0.150, yR: 0.063, wR: 0.250, hR: 0.040, fill: "#FFFFFF" },
        draw: { type: "text", xR: 0.161, yR: 0.083, sizeR: 0.040, fill: "#111111", weight: "700" },
      },
      {
        label: "광고 문구", default: "광고 문구를 입력하세요",
        cover: { xR: 0.020, yR: 0.658, wR: 0.960, hR: 0.048, fill: "#FFFFFF" },
        draw: { type: "text", xR: 0.040, yR: 0.682, sizeR: 0.037, fill: "#444444" },
      },
      {
        label: "버튼", default: "바로가기",
        cover: { xR: 0.020, yR: 0.702, wR: 0.960, hR: 0.058, fill: "#FFFFFF" },
        draw: { type: "button", xR: 0.020, yR: 0.704, wR: 0.960, hR: 0.054, rR: 0.014, bg: "#6600CC", fg: "#FFFFFF", sizeR: 0.040 },
      },
    ],
    logoDef: { label: "브랜드 로고", coverFill: "#DDDDDD", cxR: 0.099, cyR: 0.081, rR: 0.037 },
  },
  {
    id: "native-view", label: "카카오 네이티브 (카카오뷰)",
    src: "/%EC%B9%B4%EC%B9%B4%EC%98%A4%EB%84%A4%EC%9D%B4%ED%8B%B0%EB%B8%8C12x6.jpg",
    imagePos: { xR: 0.000, yR: 0.085, wR: 1.000, hR: 0.445, radiusPct: 0.000 },
  },
]

const KAKAO_BG = "rgb(235,235,235)"
const FONT = `"KakaoSmallSans", "Apple SD Gothic Neo", sans-serif`

// ── Utils ─────────────────────────────────────────────────────
let _uid = 0
const uid = () => `l${++_uid}`

function loadFile(file: File): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image(); img.onload = () => res(img); img.onerror = rej
    img.src = URL.createObjectURL(file)
  })
}
function loadUrl(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image(); img.crossOrigin = "anonymous"
    img.onload = () => res(img); img.onerror = rej; img.src = src
  })
}
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.arcTo(x+w,y,x+w,y+r,r)
  ctx.lineTo(x+w,y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r)
  ctx.lineTo(x+r,y+h); ctx.arcTo(x,y+h,x,y+h-r,r)
  ctx.lineTo(x,y+r); ctx.arcTo(x,y,x+r,y,r); ctx.closePath()
}
const cl = (v: number) => Math.max(0, Math.min(1, v))

// ── Sub-components ────────────────────────────────────────────
function FileBtn({ label, hint, onChange }: { label: string; hint?: string; onChange: (f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div onClick={() => ref.current?.click()}
      className="cursor-pointer rounded-lg border-2 border-dashed border-gray-200 px-3 py-3 text-center hover:border-gray-300 hover:bg-gray-50 transition-colors">
      <input ref={ref} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) { onChange(f); e.target.value = "" } }} />
      <p className="text-xs font-medium text-gray-600">{label}</p>
      {hint && <p className="mt-0.5 text-[10px] text-gray-400">{hint}</p>}
    </div>
  )
}

function AdjRow({ label, value, onUp, onDown, onChange }: {
  label: string; value: number; onUp: () => void; onDown: () => void
  onChange?: (v: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  function commit() {
    const n = parseFloat(draft)
    if (!isNaN(n) && onChange) onChange(Math.max(0, Math.min(1, n / 100)))
    setEditing(false)
  }
  return (
    <div className="flex items-center justify-between gap-1">
      <span className="text-[10px] text-gray-500 w-16 shrink-0">{label}</span>
      <div className="flex items-center gap-1">
        <button onClick={onDown} className="flex h-5 w-5 items-center justify-center rounded border border-gray-200 text-[10px] text-gray-500 hover:bg-gray-50">▼</button>
        {editing ? (
          <input autoFocus value={draft} onChange={e => setDraft(e.target.value)}
            onBlur={commit} onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false) }}
            className="w-12 rounded border border-blue-300 px-1 py-0.5 text-center text-[10px] font-mono focus:outline-none" />
        ) : (
          <span onClick={() => { setDraft((value*100).toFixed(1)); setEditing(true) }}
            title="클릭하여 직접 입력"
            className="w-12 text-center text-[10px] font-mono text-gray-700 cursor-text hover:bg-blue-50 rounded px-1 py-0.5">
            {(value*100).toFixed(1)}%
          </span>
        )}
        <button onClick={onUp} className="flex h-5 w-5 items-center justify-center rounded border border-gray-200 text-[10px] text-gray-500 hover:bg-gray-50">▲</button>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────
export default function MockupPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const layersRef = useRef<Layer[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dragRef = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number } | null>(null)

  const [bgImg,          setBgImg]          = useState<HTMLImageElement | null>(null)
  const [layers,         setLayers]         = useState<Layer[]>([])
  const [selectedId,     setSelectedId]     = useState<string | null>(null)
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null)
  const [isLoading,      setIsLoading]      = useState(false)
  const [newText,        setNewText]        = useState("")
  const [showAddText,    setShowAddText]    = useState(false)
  const [downloadName,   setDownloadName]   = useState("kakao_mockup")

  // AI 이미지 생성 상태
  const [aiPrompt,        setAiPrompt]        = useState("")
  const [aiRefFile,       setAiRefFile]       = useState<File | null>(null)
  const [aiGenerating,    setAiGenerating]    = useState(false)
  const [aiError,         setAiError]         = useState<string | null>(null)
  const aiRefInputRef = useRef<HTMLInputElement>(null)

  // 캠페인 연동
  const { campaigns, agencies, advertisers } = useMasterData()
  const [selectedCampaignId, setSelectedCampaignId]   = useState<string | null>(null)

  // 게재 목업 (소재 + 지면 합성)
  const [compositFile, setCompositFile]               = useState<File | null>(null)
  const [compositGenerating, setCompositGenerating]   = useState(false)
  const [compositError, setCompositError]             = useState<string | null>(null)
  const compositInputRef                              = useRef<HTMLInputElement>(null)

  // ── KakaoSmallSans 폰트 로드 (Canvas용 FontFace API) ─────────
  useEffect(() => {
    async function loadKakaoFonts() {
      try {
        const fonts = [
          new FontFace("KakaoSmallSans", "url(/fonts/kakao/KakaoSmallSans-Regular.ttf)", { weight: "400" }),
          new FontFace("KakaoSmallSans", "url(/fonts/kakao/KakaoSmallSans-Light.ttf)",   { weight: "300" }),
          new FontFace("KakaoSmallSans", "url(/fonts/kakao/KakaoSmallSans-Bold.ttf)",    { weight: "700" }),
        ]
        await Promise.all(fonts.map(async (f) => {
          await f.load()
          document.fonts.add(f)
        }))
      } catch (e) {
        console.warn("KakaoSmallSans 로드 실패, 시스템 폰트로 대체:", e)
      }
    }
    loadKakaoFonts()
  }, [])

  useEffect(() => { layersRef.current = layers }, [layers])

  // 캠페인 선택 시 다운로드 파일명 자동 설정
  useEffect(() => {
    if (selectedCampaignId) {
      const c = campaigns.find(x => x.id === selectedCampaignId)
      if (c) setDownloadName(c.campaignName.replace(/[/\\?%*:|"<>]/g, '_'))
    }
  }, [selectedCampaignId, campaigns])

  // ── Canvas render ─────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !bgImg) return
    const iw = bgImg.naturalWidth, ih = bgImg.naturalHeight
    canvas.width = iw; canvas.height = ih
    const ctx = canvas.getContext("2d")!
    ctx.drawImage(bgImg, 0, 0)

    for (const layer of layers) {
      if (!layer.visible) continue

      if (layer.type === "image") {
        const { xR, yR, wR, hR, radiusPct } = layer
        const x = xR*iw, y = yR*ih, w = wR*iw, h = hR*ih, rad = radiusPct*iw
        ctx.save(); rr(ctx,x,y,w,h,rad); ctx.fillStyle=KAKAO_BG; ctx.fill(); ctx.clip()
        ctx.drawImage(layer.img, x, y, w, h); ctx.restore()
        if (layer.id === selectedId) {
          ctx.save(); ctx.strokeStyle="#3B82F6"; ctx.lineWidth=Math.max(2,iw*0.004)
          ctx.setLineDash([iw*0.012,iw*0.006]); rr(ctx,x-2,y-2,w+4,h+4,rad+2); ctx.stroke(); ctx.restore()
        }
      }

      else if (layer.type === "text") {
        if (layer.cover) { ctx.fillStyle=layer.cover.fill; ctx.fillRect(layer.cover.xR*iw,layer.cover.yR*ih,layer.cover.wR*iw,layer.cover.hR*ih) }
        ctx.font=`${layer.weight} ${Math.round(layer.sizeR*iw)}px ${FONT}`
        ctx.fillStyle=layer.color; ctx.textAlign=layer.align; ctx.textBaseline="middle"
        ctx.fillText(layer.text, layer.xR*iw, layer.yR*ih)
      }

      else if (layer.type === "button") {
        if (layer.cover) { ctx.fillStyle=layer.cover.fill; ctx.fillRect(layer.cover.xR*iw,layer.cover.yR*ih,layer.cover.wR*iw,layer.cover.hR*ih) }
        const bx=layer.xR*iw, by=layer.yR*ih, bw=layer.wR*iw, bh=layer.hR*ih
        rr(ctx,bx,by,bw,bh,layer.rR*iw); ctx.fillStyle=layer.bg; ctx.fill()
        if (layer.borderColor) { ctx.save(); ctx.strokeStyle=layer.borderColor; ctx.lineWidth=Math.max(1,iw*0.004); rr(ctx,bx,by,bw,bh,layer.rR*iw); ctx.stroke(); ctx.restore() }
        ctx.font=`600 ${Math.round(layer.sizeR*iw)}px ${FONT}`
        ctx.fillStyle=layer.fg; ctx.textAlign="center"; ctx.textBaseline="middle"
        ctx.fillText(layer.text, bx+bw/2, by+bh/2)
      }

      else if (layer.type === "logo") {
        const cx=layer.cxR*iw, cy=layer.cyR*ih, lr=layer.rR*iw
        ctx.save(); ctx.beginPath(); ctx.arc(cx,cy,lr,0,2*Math.PI)
        if (layer.img) { ctx.clip(); ctx.drawImage(layer.img,cx-lr,cy-lr,lr*2,lr*2) }
        else { ctx.fillStyle=layer.coverFill; ctx.fill() }
        ctx.restore()
      }
    }
  }, [bgImg, layers, selectedId])

  // ── Canvas interaction ────────────────────────────────────
  function toRatio(e: React.MouseEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!; const rect = c.getBoundingClientRect()
    return { xR: (e.clientX-rect.left)/rect.width, yR: (e.clientY-rect.top)/rect.height }
  }

  function hitTest(l: Layer, xR: number, yR: number): boolean {
    const asp = bgImg ? bgImg.naturalHeight/bgImg.naturalWidth : 1
    if (l.type==="image")  return xR>=l.xR && xR<=l.xR+l.wR && yR>=l.yR && yR<=l.yR+l.hR
    if (l.type==="text")   { const tw=Math.min(0.8,l.text.length*l.sizeR*0.55); return xR>=l.xR && xR<=l.xR+tw && yR>=l.yR-l.sizeR && yR<=l.yR+l.sizeR }
    if (l.type==="button") return xR>=l.xR && xR<=l.xR+l.wR && yR>=l.yR && yR<=l.yR+l.hR
    if (l.type==="logo")   { const dx=xR-l.cxR, dy=(yR-l.cyR)/asp; return Math.sqrt(dx*dx+dy*dy)<=l.rR*1.4 }
    return false
  }

  function onDown(e: React.MouseEvent<HTMLCanvasElement>) {
    const { xR, yR } = toRatio(e)
    const hit = [...layersRef.current].reverse().find(l => l.visible && hitTest(l, xR, yR))
    if (hit) {
      setSelectedId(hit.id)
      const ox = hit.type==="logo" ? hit.cxR : hit.xR
      const oy = hit.type==="logo" ? hit.cyR : hit.yR
      dragRef.current = { id: hit.id, sx: xR, sy: yR, ox, oy }
    } else { setSelectedId(null) }
  }

  function onMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!dragRef.current) return
    const { xR, yR } = toRatio(e)
    const { id, sx, sy, ox, oy } = dragRef.current
    const dx = xR-sx, dy = yR-sy
    setLayers(prev => prev.map(l => {
      if (l.id!==id) return l
      if (l.type==="logo") return { ...l, cxR: cl(ox+dx), cyR: cl(oy+dy) }
      return { ...l, xR: cl(ox+dx), yR: cl(oy+dy) }
    }))
  }

  function onUp() { dragRef.current = null }

  // ── Layer helpers ─────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upd = (id: string, patch: any) =>
    setLayers(prev => prev.map(l => l.id!==id ? l : { ...l, ...patch } as Layer))

  const del = (id: string) => {
    setLayers(prev => prev.filter(l => l.id!==id))
    if (selectedId===id) setSelectedId(null)
  }

  const reorder = (id: string, dir: 1|-1) =>
    setLayers(prev => {
      const i = prev.findIndex(l => l.id===id); const j = i+dir
      if (j<0||j>=prev.length) return prev
      const next=[...prev]; [next[i],next[j]]=[next[j],next[i]]; return next
    })

  // ── Add layers ────────────────────────────────────────────
  async function addImage(file: File) {
    const img = await loadFile(file)
    const ip = PRESETS.find(p=>p.id===selectedPreset)?.imagePos
    const layer: Layer = {
      id: uid(), type: "image", label: file.name.replace(/\.[^.]+$/,"").slice(0,14), visible: true,
      img, xR: ip?.xR??0.02, yR: ip?.yR??0.20, wR: ip?.wR??0.96, hR: ip?.hR??0.30,
      radiusPct: ip?.radiusPct??0.010,
    }
    setLayers(prev => [layer, ...prev])  // insert below text layers
    setSelectedId(layer.id)
  }

  async function generateAiImage() {
    if (!aiPrompt.trim() && !aiRefFile) return
    setAiGenerating(true)
    setAiError(null)
    try {
      const form = new FormData()
      form.append('prompt', aiPrompt)
      if (aiRefFile) form.append('referenceImage', aiRefFile)
      if (selectedPreset) form.append('presetId', selectedPreset)
      if (selectedCampaignId) {
        form.append('campaignId', selectedCampaignId)
        const c = campaigns.find(x => x.id === selectedCampaignId)
        if (c) form.append('campaignName', c.campaignName)
      }

      // 지면 이미지가 있으면 base64로 직렬화해 mediaImage로 전달
      if (bgImg) {
        const tmp = document.createElement('canvas')
        tmp.width = bgImg.naturalWidth; tmp.height = bgImg.naturalHeight
        tmp.getContext('2d')!.drawImage(bgImg, 0, 0)
        const dataUrl = tmp.toDataURL('image/png')
        const blob = await fetch(dataUrl).then(r => r.blob())
        form.append('mediaImage', new File([blob], 'media.png', { type: 'image/png' }))
      }
      const res = await fetch('/api/generate-mockup-image', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? '생성 실패')

      // base64 → HTMLImageElement
      const img = new Image()
      img.src = `data:${data.mimeType};base64,${data.imageData}`
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('이미지 로드 실패'))
      })

      const ip = PRESETS.find(p => p.id === selectedPreset)?.imagePos
      const layer: Layer = {
        id: uid(), type: "image", label: "AI 생성 이미지", visible: true,
        img, xR: ip?.xR ?? 0.02, yR: ip?.yR ?? 0.20,
        wR: ip?.wR ?? 0.96, hR: ip?.hR ?? 0.30,
        radiusPct: ip?.radiusPct ?? 0.010,
      }
      setLayers(prev => [layer, ...prev])
      setSelectedId(layer.id)
      setAiPrompt("")
      setAiRefFile(null)
    } catch (e) {
      setAiError(e instanceof Error ? e.message : '생성 중 오류가 발생했습니다.')
    } finally {
      setAiGenerating(false)
    }
  }

  async function generateCompositeMockup() {
    if (!compositFile || !bgImg) return
    setCompositGenerating(true)
    setCompositError(null)
    try {
      const form = new FormData()
      form.append('prompt', '')
      form.append('referenceImage', compositFile)
      if (selectedPreset) form.append('presetId', selectedPreset)
      // 현재 지면 이미지를 mediaImage로 전달
      const tmp = document.createElement('canvas')
      tmp.width = bgImg.naturalWidth; tmp.height = bgImg.naturalHeight
      tmp.getContext('2d')!.drawImage(bgImg, 0, 0)
      const dataUrl = tmp.toDataURL('image/png')
      const blob = await fetch(dataUrl).then(r => r.blob())
      form.append('mediaImage', new File([blob], 'media.png', { type: 'image/png' }))
      // 캠페인 컨텍스트 전달
      if (selectedCampaignId) {
        form.append('campaignId', selectedCampaignId)
        const c = campaigns.find(x => x.id === selectedCampaignId)
        if (c) form.append('campaignName', c.campaignName)
      }

      const res = await fetch('/api/generate-mockup-image', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? '생성 실패')

      const img = new Image()
      img.src = `data:${data.mimeType};base64,${data.imageData}`
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve(); img.onerror = () => reject(new Error('이미지 로드 실패'))
      })

      const ip = PRESETS.find(p => p.id === selectedPreset)?.imagePos
      const layer: Layer = {
        id: uid(), type: 'image', label: '게재 목업', visible: true,
        img, xR: ip?.xR ?? 0.02, yR: ip?.yR ?? 0.20,
        wR: ip?.wR ?? 0.96, hR: ip?.hR ?? 0.30,
        radiusPct: ip?.radiusPct ?? 0.010,
      }
      setLayers(prev => [layer, ...prev])
      setSelectedId(layer.id)
      setCompositFile(null)
    } catch (e) {
      setCompositError(e instanceof Error ? e.message : '생성 중 오류가 발생했습니다.')
    } finally {
      setCompositGenerating(false)
    }
  }

  function addText() {
    if (!newText.trim()) return
    const layer: Layer = {
      id: uid(), type: "text", label: newText.slice(0,12), visible: true,
      text: newText, xR: 0.05, yR: 0.50, sizeR: 0.050,
      color: "#000000", weight: "500", align: "left",
    }
    setLayers(prev => [...prev, layer])
    setSelectedId(layer.id); setNewText(""); setShowAddText(false)
  }

  // ── Preset load ───────────────────────────────────────────
  async function loadPreset(pid: string) {
    if (pid==="") {
      setSelectedPreset(null); setBgImg(null); setLayers([]); setSelectedId(null); return
    }
    const preset = PRESETS.find(p=>p.id===pid); if (!preset) return
    setIsLoading(true); setSelectedPreset(pid); setSelectedId(null)
    try {
      setBgImg(await loadUrl(preset.src))
      const next: Layer[] = []
      for (const td of preset.textDefs??[]) {
        const d = td.draw
        if (d.type==="text") {
          next.push({ id:uid(), type:"text", label:td.label, visible:true, text:td.default,
            xR:d.xR, yR:d.yR, sizeR:d.sizeR, color:d.fill, weight:d.weight??"normal",
            align:d.align??"left", cover:td.cover })
        } else {
          next.push({ id:uid(), type:"button", label:td.label, visible:true, text:td.default,
            xR:d.xR, yR:d.yR, wR:d.wR, hR:d.hR, rR:d.rR, bg:d.bg, fg:d.fg, sizeR:d.sizeR, ...(d.borderColor ? { borderColor: d.borderColor } : {}), cover:td.cover })
        }
      }
      if (preset.logoDef) {
        const ld = preset.logoDef
        next.push({ id:uid(), type:"logo", label:ld.label, visible:true,
          img:null, cxR:ld.cxR, cyR:ld.cyR, rR:ld.rR, coverFill:ld.coverFill })
      }
      setLayers(next)
    } catch { setBgImg(null); setSelectedPreset(null); setLayers([])
    } finally { setIsLoading(false) }
  }

  async function uploadBg(file: File) {
    setBgImg(await loadFile(file)); setLayers([]); setSelectedId(null)
  }

  // ── Render ────────────────────────────────────────────────
  const selLayer = layers.find(l=>l.id===selectedId)
  const activePreset = PRESETS.find(p=>p.id===selectedPreset)
  const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId) ?? null
  const selectedAgency = selectedCampaign ? agencies.find(a => a.id === selectedCampaign.agencyId) ?? null : null
  const selectedAdvertiser = selectedCampaign ? advertisers.find(a => a.id === selectedCampaign.advertiserId) ?? null : null

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-base font-semibold text-gray-900">목업 게재 이미지 생성</h1>
            <p className="text-xs text-gray-400 mt-0.5">레이어를 추가하고 캔버스에서 드래그로 위치를 조정하세요</p>
          </div>
          {campaigns.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 shrink-0">캠페인</span>
              <select
                value={selectedCampaignId ?? ''}
                onChange={e => setSelectedCampaignId(e.target.value || null)}
                className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 focus:border-blue-300 focus:outline-none min-w-[160px]"
              >
                <option value="">캠페인 선택</option>
                {campaigns.map(c => (
                  <option key={c.id} value={c.id}>{c.campaignName}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </header>

      <main className="flex h-[calc(100vh-73px)]">

        {/* ── Left panel ────────────────────────────── */}
        <div className="w-64 shrink-0 border-r border-gray-200 bg-white overflow-y-auto p-4 space-y-5">

          {/* 배경 */}
          <section className="space-y-2">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">배경</p>
            {bgImg ? (
              <div className="space-y-1.5">
                <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2">
                  <p className="text-[11px] font-semibold text-green-700">✓ {activePreset?.label ?? "직접 업로드"}</p>
                  <p className="text-[10px] text-green-600 font-mono mt-0.5">{bgImg.naturalWidth} × {bgImg.naturalHeight} px</p>
                </div>
                <button onClick={() => { setBgImg(null); setLayers([]); setSelectedId(null); setSelectedPreset(null) }}
                  className="w-full rounded-lg border border-gray-200 py-1.5 text-xs text-gray-500 hover:bg-gray-50">
                  다시 선택
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <select value={selectedPreset??""} onChange={e=>loadPreset(e.target.value)} disabled={isLoading}
                  className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 bg-white focus:border-blue-300 focus:outline-none disabled:opacity-50">
                  <option value="">직접 업로드</option>
                  {PRESETS.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
                {isLoading && <p className="text-center text-[11px] text-blue-500">불러오는 중...</p>}
                {!selectedPreset && !isLoading && <FileBtn label="스크린샷 업로드" hint="PNG, JPG" onChange={uploadBg} />}
              </div>
            )}
          </section>

          {/* ── 캠페인 정보 ──────────────────────── */}
          {selectedCampaign && (
            <section className="space-y-2 rounded-xl border border-blue-100 bg-blue-50/50 p-3">
              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">캠페인 정보</p>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-[10px] text-gray-500">캠페인</span>
                  <span className="text-[10px] font-medium text-gray-800 text-right max-w-[110px] truncate" title={selectedCampaign.campaignName}>{selectedCampaign.campaignName}</span>
                </div>
                {selectedAdvertiser && (
                  <div className="flex justify-between">
                    <span className="text-[10px] text-gray-500">광고주</span>
                    <span className="text-[10px] text-gray-700">{selectedAdvertiser.name}</span>
                  </div>
                )}
                {selectedAgency && (
                  <div className="flex justify-between">
                    <span className="text-[10px] text-gray-500">대행사</span>
                    <span className="text-[10px] text-gray-700">{selectedAgency.name}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-[10px] text-gray-500">기간</span>
                  <span className="text-[10px] text-gray-700">{selectedCampaign.startDate} ~ {selectedCampaign.endDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[10px] text-gray-500">상태</span>
                  <span className={`text-[10px] font-medium ${selectedCampaign.status === '집행 중' ? 'text-green-600' : 'text-gray-400'}`}>{selectedCampaign.status}</span>
                </div>
              </div>
            </section>
          )}

          {/* ── AI 이미지 생성 ─────────────────────── */}
          {bgImg && (
            <section className="space-y-2 rounded-xl border border-violet-100 bg-violet-50/50 p-3">
              <div className="flex items-center gap-1.5">
                <svg className="h-3 w-3 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
                <p className="text-[10px] font-bold text-violet-600 uppercase tracking-widest">AI 이미지 생성</p>
              </div>

              {/* 프롬프트 입력 */}
              <textarea
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
                placeholder="생성할 광고 이미지를 설명하세요&#10;예: 여름 화장품 광고, 파란 배경에 세럼 제품"
                rows={3}
                className="w-full rounded-lg border border-violet-200 bg-white px-2.5 py-2 text-xs text-gray-700 focus:border-violet-400 focus:outline-none resize-none placeholder:text-gray-500"
              />

              {/* 참고 이미지 업로드 */}
              <div>
                <input
                  ref={aiRefInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) { setAiRefFile(f); e.target.value = "" }
                  }}
                />
                {aiRefFile ? (
                  <div className="flex items-center justify-between rounded-lg border border-violet-200 bg-white px-2.5 py-2">
                    <span className="text-[10px] text-violet-700 truncate max-w-[120px]">{aiRefFile.name}</span>
                    <button onClick={() => setAiRefFile(null)} className="text-[10px] text-gray-400 hover:text-red-500 ml-1">×</button>
                  </div>
                ) : (
                  <button
                    onClick={() => aiRefInputRef.current?.click()}
                    className="w-full rounded-lg border border-dashed border-violet-200 bg-white px-2.5 py-2 text-[10px] text-gray-400 hover:border-violet-300 hover:bg-violet-50 transition-colors text-left"
                  >
                    + 참고 이미지 업로드 (선택)
                  </button>
                )}
              </div>

              {/* 에러 표시 */}
              {aiError && (
                <p className="rounded-lg bg-red-50 px-2.5 py-2 text-[10px] text-red-600 border border-red-200">{aiError}</p>
              )}

              {/* 생성 버튼 */}
              <button
                onClick={generateAiImage}
                disabled={aiGenerating || !aiPrompt.trim()}
                className="w-full rounded-lg bg-violet-600 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-1.5"
              >
                {aiGenerating ? (
                  <>
                    <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    생성 중...
                  </>
                ) : (
                  <>
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                    Gemini로 생성
                  </>
                )}
              </button>
              <p className="text-[9px] text-violet-400 text-center">GEMINI_API_KEY 환경변수 필요</p>
            </section>
          )}

          {/* ── 게재 목업 합성 ──────────────────── */}
          {bgImg && (
            <section className="space-y-2 rounded-xl border border-orange-100 bg-orange-50/50 p-3">
              <div className="flex items-center gap-1.5">
                <svg className="h-3 w-3 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-[10px] font-bold text-orange-600 uppercase tracking-widest">게재 목업 합성</p>
              </div>
              <p className="text-[9px] text-gray-400">광고 소재를 업로드하면 현재 지면에 합성된 목업을 생성합니다</p>
              {compositFile ? (
                <div className="rounded-lg bg-orange-50 border border-orange-200 px-2 py-1.5 flex items-center justify-between">
                  <span className="text-[10px] text-orange-700 truncate max-w-[110px]">{compositFile.name}</span>
                  <button onClick={() => setCompositFile(null)} className="text-[10px] text-gray-400 hover:text-red-500 ml-1">✕</button>
                </div>
              ) : (
                <>
                  <input ref={compositInputRef} type="file" accept="image/*" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) { setCompositFile(f); e.target.value = '' } }} />
                  <div
                    onClick={() => compositInputRef.current?.click()}
                    className="cursor-pointer rounded-lg border-2 border-dashed border-orange-200 px-3 py-3 text-center hover:border-orange-300 hover:bg-orange-50 transition-colors"
                  >
                    <p className="text-xs font-medium text-orange-600">광고 소재 업로드</p>
                    <p className="mt-0.5 text-[10px] text-gray-400">PNG, JPG</p>
                  </div>
                </>
              )}
              {compositError && <p className="text-[10px] text-red-500">{compositError}</p>}
              <button
                onClick={generateCompositeMockup}
                disabled={!compositFile || compositGenerating}
                className="w-full rounded-lg bg-orange-500 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {compositGenerating ? '합성 중...' : '목업 생성'}
              </button>
            </section>
          )}

          {/* 레이어 */}
          {bgImg && (
            <section className="space-y-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">레이어</p>

              {/* Layer list – rendered top-first */}
              <div className="space-y-0.5">
                {[...layers].reverse().map(layer => {
                  const realIdx = layers.findIndex(l=>l.id===layer.id)
                  const isTop    = realIdx===layers.length-1
                  const isBottom = realIdx===0
                  const isSel    = layer.id===selectedId
                  const icon = layer.type==="image" ? "🖼" : layer.type==="logo" ? "⬤" : layer.type==="button" ? "◻" : "T"
                  return (
                    <div key={layer.id} onClick={()=>setSelectedId(isSel?null:layer.id)}
                      className={`flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer transition-colors text-[11px] ${
                        isSel ? "bg-blue-50 border border-blue-200" : "border border-transparent hover:bg-gray-50"
                      }`}>
                      <button onClick={e=>{e.stopPropagation(); upd(layer.id,{visible:!layer.visible})}}
                        className={`w-4 shrink-0 text-center ${layer.visible?"text-gray-500":"text-gray-500"}`}>
                        {layer.visible ? "●" : "○"}
                      </button>
                      <span className="flex-1 truncate text-gray-700">{icon} {layer.label}</span>
                      <button onClick={e=>{e.stopPropagation(); reorder(layer.id,1)}} disabled={isTop}
                        className="h-5 w-4 text-[10px] text-gray-400 hover:text-gray-700 disabled:opacity-20">▲</button>
                      <button onClick={e=>{e.stopPropagation(); reorder(layer.id,-1)}} disabled={isBottom}
                        className="h-5 w-4 text-[10px] text-gray-400 hover:text-gray-700 disabled:opacity-20">▼</button>
                      <button onClick={e=>{e.stopPropagation(); del(layer.id)}}
                        className="h-5 w-4 text-[10px] text-red-400 hover:text-red-600">×</button>
                    </div>
                  )
                })}
                {layers.length===0 && <p className="text-center text-[11px] text-gray-400 py-2">레이어 없음</p>}
              </div>

              {/* Add buttons */}
              <div className="grid grid-cols-2 gap-1.5">
                <FileBtn label="+ 이미지" onChange={addImage} />
                <button onClick={()=>setShowAddText(v=>!v)}
                  className={`rounded-lg border-2 border-dashed py-3 text-xs transition-colors ${
                    showAddText ? "border-blue-300 bg-blue-50 text-blue-600" : "border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50"
                  }`}>
                  + 텍스트
                </button>
              </div>
              {showAddText && (
                <div className="flex gap-1.5">
                  <input autoFocus value={newText} onChange={e=>setNewText(e.target.value)}
                    onKeyDown={e=>{if(e.key==="Enter")addText(); if(e.key==="Escape")setShowAddText(false)}}
                    placeholder="텍스트 입력 후 Enter"
                    className="flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:border-blue-300 focus:outline-none" />
                  <button onClick={addText}
                    className="rounded-lg bg-blue-600 px-2.5 text-xs font-semibold text-white hover:bg-blue-700">추가</button>
                </div>
              )}
            </section>
          )}

          {/* 선택 레이어 속성 */}
          {selLayer && (
            <section className="space-y-2 rounded-xl border border-blue-100 bg-blue-50/40 p-3">
              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">{selLayer.label}</p>

              {selLayer.type==="image" && (
                <div className="space-y-1.5">
                  <AdjRow label="상하 위치" value={selLayer.yR}
                    onUp={()=>upd(selLayer.id,{yR:cl(selLayer.yR-0.005)})} onDown={()=>upd(selLayer.id,{yR:cl(selLayer.yR+0.005)})}
                    onChange={v=>upd(selLayer.id,{yR:v})} />
                  <AdjRow label="높이" value={selLayer.hR}
                    onUp={()=>upd(selLayer.id,{hR:cl(selLayer.hR+0.005)})} onDown={()=>upd(selLayer.id,{hR:cl(selLayer.hR-0.005)})}
                    onChange={v=>upd(selLayer.id,{hR:v})} />
                  <AdjRow label="좌우 여백" value={selLayer.xR}
                    onUp={()=>upd(selLayer.id,{xR:cl(selLayer.xR-0.005)})} onDown={()=>upd(selLayer.id,{xR:cl(selLayer.xR+0.005)})}
                    onChange={v=>upd(selLayer.id,{xR:v})} />
                  <AdjRow label="너비" value={selLayer.wR}
                    onUp={()=>upd(selLayer.id,{wR:cl(selLayer.wR+0.005)})} onDown={()=>upd(selLayer.id,{wR:cl(selLayer.wR-0.005)})}
                    onChange={v=>upd(selLayer.id,{wR:v})} />
                  <AdjRow label="모서리" value={selLayer.radiusPct}
                    onUp={()=>upd(selLayer.id,{radiusPct:cl(selLayer.radiusPct+0.002)})} onDown={()=>upd(selLayer.id,{radiusPct:cl(selLayer.radiusPct-0.002)})}
                    onChange={v=>upd(selLayer.id,{radiusPct:v})} />
                  <FileBtn label="이미지 교체" hint="PNG, JPG"
                    onChange={async f=>{const img=await loadFile(f); upd(selLayer.id,{img})}} />
                </div>
              )}

              {selLayer.type==="text" && (
                <div className="space-y-2">
                  <textarea value={selLayer.text}
                    onChange={e=>upd(selLayer.id,{text:e.target.value,label:e.target.value.slice(0,12)||"텍스트"})}
                    rows={2}
                    className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:border-blue-300 focus:outline-none resize-none" />
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] text-gray-500">색상</label>
                    <input type="color" value={selLayer.color} onChange={e=>upd(selLayer.id,{color:e.target.value})}
                      className="h-6 w-8 rounded cursor-pointer border border-gray-200" />
                  </div>
                  <AdjRow label="글자 크기" value={selLayer.sizeR}
                    onUp={()=>upd(selLayer.id,{sizeR:cl(selLayer.sizeR+0.002)})}
                    onDown={()=>upd(selLayer.id,{sizeR:cl(selLayer.sizeR-0.002)})}
                    onChange={v=>upd(selLayer.id,{sizeR:v})} />
                  <AdjRow label="X 위치" value={selLayer.xR}
                    onUp={()=>upd(selLayer.id,{xR:cl(selLayer.xR+0.005)})}
                    onDown={()=>upd(selLayer.id,{xR:cl(selLayer.xR-0.005)})}
                    onChange={v=>upd(selLayer.id,{xR:v})} />
                  <AdjRow label="Y 위치" value={selLayer.yR}
                    onUp={()=>upd(selLayer.id,{yR:cl(selLayer.yR+0.005)})}
                    onDown={()=>upd(selLayer.id,{yR:cl(selLayer.yR-0.005)})}
                    onChange={v=>upd(selLayer.id,{yR:v})} />
                  <select value={selLayer.weight} onChange={e=>upd(selLayer.id,{weight:e.target.value})}
                    className="w-full rounded-lg border border-gray-200 px-2 py-1 text-xs bg-white focus:outline-none">
                    <option value="400">보통</option>
                    <option value="500">중간</option>
                    <option value="700">굵게</option>
                  </select>
                  <select value={selLayer.align} onChange={e=>upd(selLayer.id,{align:e.target.value as CanvasTextAlign})}
                    className="w-full rounded-lg border border-gray-200 px-2 py-1 text-xs bg-white focus:outline-none">
                    <option value="left">왼쪽 정렬</option>
                    <option value="center">가운데 정렬</option>
                    <option value="right">오른쪽 정렬</option>
                  </select>
                </div>
              )}

              {selLayer.type==="button" && (
                <div className="space-y-2">
                  <input value={selLayer.text}
                    onChange={e=>upd(selLayer.id,{text:e.target.value})}
                    placeholder="버튼 텍스트"
                    className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:border-blue-300 focus:outline-none" />
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] text-gray-500 w-16 shrink-0">배경색</label>
                    <input type="color" value={selLayer.bg} onChange={e=>upd(selLayer.id,{bg:e.target.value})}
                      className="h-6 w-8 rounded cursor-pointer border border-gray-200" />
                    <input value={selLayer.bg} onChange={e=>upd(selLayer.id,{bg:e.target.value})}
                      className="flex-1 rounded border border-gray-200 px-2 py-0.5 text-[10px] font-mono focus:outline-none focus:border-blue-300" />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] text-gray-500 w-16 shrink-0">글자색</label>
                    <input type="color" value={selLayer.fg} onChange={e=>upd(selLayer.id,{fg:e.target.value})}
                      className="h-6 w-8 rounded cursor-pointer border border-gray-200" />
                    <input value={selLayer.fg} onChange={e=>upd(selLayer.id,{fg:e.target.value})}
                      className="flex-1 rounded border border-gray-200 px-2 py-0.5 text-[10px] font-mono focus:outline-none focus:border-blue-300" />
                  </div>
                  <AdjRow label="글자 크기" value={selLayer.sizeR}
                    onUp={()=>upd(selLayer.id,{sizeR:cl(selLayer.sizeR+0.002)})}
                    onDown={()=>upd(selLayer.id,{sizeR:cl(selLayer.sizeR-0.002)})}
                    onChange={v=>upd(selLayer.id,{sizeR:v})} />
                  <AdjRow label="X 위치" value={selLayer.xR}
                    onUp={()=>upd(selLayer.id,{xR:cl(selLayer.xR+0.005)})}
                    onDown={()=>upd(selLayer.id,{xR:cl(selLayer.xR-0.005)})}
                    onChange={v=>upd(selLayer.id,{xR:v})} />
                  <AdjRow label="Y 위치" value={selLayer.yR}
                    onUp={()=>upd(selLayer.id,{yR:cl(selLayer.yR+0.005)})}
                    onDown={()=>upd(selLayer.id,{yR:cl(selLayer.yR-0.005)})}
                    onChange={v=>upd(selLayer.id,{yR:v})} />
                  <AdjRow label="너비" value={selLayer.wR}
                    onUp={()=>upd(selLayer.id,{wR:cl(selLayer.wR+0.005)})}
                    onDown={()=>upd(selLayer.id,{wR:cl(selLayer.wR-0.005)})}
                    onChange={v=>upd(selLayer.id,{wR:v})} />
                  <AdjRow label="높이" value={selLayer.hR}
                    onUp={()=>upd(selLayer.id,{hR:cl(selLayer.hR+0.005)})}
                    onDown={()=>upd(selLayer.id,{hR:cl(selLayer.hR-0.005)})}
                    onChange={v=>upd(selLayer.id,{hR:v})} />
                  <AdjRow label="모서리" value={selLayer.rR}
                    onUp={()=>upd(selLayer.id,{rR:cl(selLayer.rR+0.002)})}
                    onDown={()=>upd(selLayer.id,{rR:cl(selLayer.rR-0.002)})}
                    onChange={v=>upd(selLayer.id,{rR:v})} />
                </div>
              )}

              {selLayer.type==="logo" && (
                <div className="space-y-2">
                  {selLayer.img ? (
                    <div className="space-y-1.5">
                      <p className="text-[10px] text-green-600 font-semibold">✓ 로고 적용됨</p>
                      <button onClick={()=>upd(selLayer.id,{img:null})}
                        className="w-full rounded-lg border border-gray-200 py-1 text-[11px] text-gray-500 hover:bg-gray-50">제거</button>
                    </div>
                  ) : (
                    <FileBtn label="로고 이미지 업로드" hint="PNG, JPG (정사각형 권장)"
                      onChange={async f=>{const img=await loadFile(f); upd(selLayer.id,{img})}} />
                  )}
                  <AdjRow label="X 위치" value={selLayer.cxR}
                    onUp={()=>upd(selLayer.id,{cxR:cl(selLayer.cxR+0.005)})}
                    onDown={()=>upd(selLayer.id,{cxR:cl(selLayer.cxR-0.005)})}
                    onChange={v=>upd(selLayer.id,{cxR:v})} />
                  <AdjRow label="Y 위치" value={selLayer.cyR}
                    onUp={()=>upd(selLayer.id,{cyR:cl(selLayer.cyR+0.005)})}
                    onDown={()=>upd(selLayer.id,{cyR:cl(selLayer.cyR-0.005)})}
                    onChange={v=>upd(selLayer.id,{cyR:v})} />
                  <AdjRow label="반지름" value={selLayer.rR}
                    onUp={()=>upd(selLayer.id,{rR:cl(selLayer.rR+0.002)})}
                    onDown={()=>upd(selLayer.id,{rR:cl(selLayer.rR-0.002)})}
                    onChange={v=>upd(selLayer.id,{rR:v})} />
                </div>
              )}
            </section>
          )}

          {/* 다운로드 */}
          <section className="space-y-2 pt-2 border-t border-gray-100">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">다운로드</p>
            <input type="text" value={downloadName} onChange={e=>setDownloadName(e.target.value)}
              placeholder="파일명"
              className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 focus:border-blue-300 focus:outline-none" />
            <button disabled={!bgImg}
              onClick={()=>{
                const c=canvasRef.current; if(!c) return
                const a=document.createElement("a"); a.download=`${downloadName||"mockup"}.png`
                a.href=c.toDataURL("image/png"); a.click()
              }}
              className="w-full rounded-lg bg-blue-600 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40 flex items-center justify-center gap-1.5">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              PNG 다운로드
            </button>
          </section>
        </div>

        {/* ── Canvas ──────────────────────────────── */}
        <div className="flex-1 overflow-auto bg-gray-100 flex items-start justify-center p-6">
          {!bgImg ? (
            <div className="flex h-full w-full items-center justify-center">
              <div className="text-center">
                <svg className="mx-auto h-16 w-16 text-gray-200 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 3h18M3 21h18" />
                </svg>
                <p className="text-sm font-medium text-gray-400">
                  배경을 선택하거나 업로드하면<br />레이어를 추가할 수 있습니다
                </p>
              </div>
            </div>
          ) : (
            <div className="shadow-2xl rounded-lg overflow-hidden">
              <canvas ref={canvasRef}
                style={{ display: "block", maxWidth: "420px", width: "100%", height: "auto", cursor: "crosshair" }}
                onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
