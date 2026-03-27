"use client"

import { useState, useRef, useEffect } from "react"

// ── 카카오 비즈보드 기본 위치값 ───────────────────────────────────
const DEFAULT = {
  xRatio: 0.030,    // 좌측 여백
  yRatio: 0.160,    // 상단 위치 (%)
  wRatio: 0.940,    // 너비 (%)
  hRatio: 0.115,    // 높이 (%)
  radiusPct: 0.022, // 모서리 둥글기 (너비 대비 %)
}

const KAKAO_BG = "rgb(235, 235, 235)"

// ── 유틸 ─────────────────────────────────────────────────────────
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

interface Pos { xRatio: number; yRatio: number; wRatio: number; hRatio: number; radiusPct: number }

function calcRect(iw: number, ih: number, pos: Pos) {
  return {
    x: Math.round(iw * pos.xRatio),
    y: Math.round(ih * pos.yRatio),
    w: Math.round(iw * pos.wRatio),
    h: Math.round(ih * pos.hRatio),
    r: Math.round(iw * pos.radiusPct),
  }
}

// 둥근 사각형 경로
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y,     x + w, y + r,     r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x,     y + h, x,     y + h - r, r)
  ctx.lineTo(x,     y + r)
  ctx.arcTo(x,     y,     x + r, y,         r)
  ctx.closePath()
}

// ── 파일 입력 ────────────────────────────────────────────────────
function FileInput({ label, hint, onChange }: {
  label: string; hint?: string; onChange: (f: File) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div onClick={() => ref.current?.click()}
      className="cursor-pointer rounded-xl border-2 border-dashed border-gray-200 px-4 py-5 text-center hover:border-gray-300 hover:bg-gray-50 transition-colors">
      <input ref={ref} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) { onChange(f); e.target.value = "" } }} />
      <p className="text-sm font-medium text-gray-600">{label}</p>
      {hint && <p className="mt-1 text-[11px] text-gray-400">{hint}</p>}
    </div>
  )
}

// ── 미세조정 행 ──────────────────────────────────────────────────
function AdjustRow({ label, value, onUp, onDown }: {
  label: string; value: number; step?: number; onUp: () => void; onDown: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-gray-500 w-20 shrink-0">{label}</span>
      <div className="flex items-center gap-1">
        <button onClick={onDown} className="flex h-6 w-6 items-center justify-center rounded-md border border-gray-200 text-xs text-gray-500 hover:bg-gray-50">▼</button>
        <span className="w-12 text-center text-[11px] font-mono text-gray-700">{(value * 100).toFixed(1)}%</span>
        <button onClick={onUp} className="flex h-6 w-6 items-center justify-center rounded-md border border-gray-200 text-xs text-gray-500 hover:bg-gray-50">▲</button>
      </div>
    </div>
  )
}

// ── 스텝 카드 ────────────────────────────────────────────────────
function StepCard({ n, done, active, title, disabled, children }: {
  n: number; done: boolean; active: boolean; title: string
  disabled?: boolean; children: React.ReactNode
}) {
  return (
    <div className={`rounded-xl border p-3.5 space-y-2.5 transition-opacity ${
      disabled ? "opacity-40 pointer-events-none border-gray-100" : "border-gray-200"
    }`}>
      <div className="flex items-center gap-2">
        <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
          done ? "bg-green-500 text-white" : active ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-400"
        }`}>{done ? "✓" : n}</div>
        <p className="text-xs font-semibold text-gray-700">{title}</p>
      </div>
      {children}
    </div>
  )
}

// ── 메인 ─────────────────────────────────────────────────────────
export default function MockupPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [bgImg,    setBgImg]    = useState<HTMLImageElement | null>(null)
  const [creative, setCreative] = useState<HTMLImageElement | null>(null)
  const [pos, setPos]           = useState<Pos>({ ...DEFAULT })
  const [showAdj, setShowAdj]   = useState(false)

  const [downloadName, setDownloadName] = useState("bizboard_mockup")

  // ── 캔버스 렌더 ────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !bgImg) return
    canvas.width  = bgImg.naturalWidth
    canvas.height = bgImg.naturalHeight
    const ctx = canvas.getContext("2d")!

    ctx.drawImage(bgImg, 0, 0)

    const { x, y, w, h, r } = calcRect(bgImg.naturalWidth, bgImg.naturalHeight, pos)

    // 광고 영역 → 카카오 배경색 (둥근 모서리)
    ctx.save()
    roundRectPath(ctx, x, y, w, h, r)
    ctx.fillStyle = KAKAO_BG
    ctx.fill()
    ctx.restore()

    // 소재 합성 (둥근 모서리로 클리핑)
    if (creative) {
      ctx.save()
      roundRectPath(ctx, x, y, w, h, r)
      ctx.clip()
      ctx.drawImage(creative, x, y, w, h)
      ctx.restore()
    }
  }, [bgImg, creative, pos])

  const adj = (key: keyof Pos, delta: number) =>
    setPos(p => ({ ...p, [key]: Math.max(0, Math.min(1, +(p[key] + delta).toFixed(4))) }))

  async function handleBg(file: File) {
    const img = await loadImage(file)
    setBgImg(img)
    setCreative(null)
  }

  async function handleCreative(file: File) {
    setCreative(await loadImage(file))
  }

  function handleDownload() {
    const canvas = canvasRef.current
    if (!canvas) return
    const a = document.createElement("a")
    a.download = `${downloadName || "mockup"}.png`
    a.href = canvas.toDataURL("image/png")
    a.click()
  }

  const step = !bgImg ? 1 : !creative ? 2 : 3

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-base font-semibold text-gray-900">목업 게재 이미지 생성</h1>
        <p className="text-xs text-gray-400 mt-0.5">카카오톡 비즈보드 · 스크린샷 업로드 후 소재를 합성합니다</p>
      </header>

      <main className="flex h-[calc(100vh-73px)]">

        {/* ── 왼쪽 패널 ─────────────────────────────────── */}
        <div className="w-64 shrink-0 border-r border-gray-200 bg-white overflow-y-auto p-4 space-y-4">

          {/* STEP 1 */}
          <StepCard n={1} done={step > 1} active={step === 1} title="배경 스크린샷 업로드">
            <p className="text-[11px] text-gray-400">카카오톡 채팅 화면 캡처를 업로드하세요.</p>
            {bgImg ? (
              <div className="space-y-2">
                <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2">
                  <p className="text-[11px] font-semibold text-green-700">✓ 배경 적용됨</p>
                  <p className="text-[10px] text-green-600 mt-0.5 font-mono">
                    {bgImg.naturalWidth} × {bgImg.naturalHeight} px
                  </p>
                </div>
                <button onClick={() => { setBgImg(null); setCreative(null) }}
                  className="w-full rounded-lg border border-gray-200 py-1.5 text-xs text-gray-500 hover:bg-gray-50">
                  다시 업로드
                </button>
              </div>
            ) : (
              <FileInput label="스크린샷 업로드" hint="PNG, JPG" onChange={handleBg} />
            )}
          </StepCard>

          {/* 위치 미세 조정 */}
          {bgImg && (
            <div className="rounded-xl border border-gray-200">
              <button
                onClick={() => setShowAdj(v => !v)}
                className="flex w-full items-center justify-between px-4 py-3 text-xs font-semibold text-gray-600 hover:bg-gray-50 rounded-xl"
              >
                <span>광고 영역 위치 조정</span>
                <span className="text-gray-400">{showAdj ? "▲" : "▼"}</span>
              </button>
              {showAdj && (
                <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-2.5">
                  <AdjustRow label="상하 위치"  value={pos.yRatio}    step={0.005} onUp={() => adj("yRatio", -0.005)} onDown={() => adj("yRatio", 0.005)} />
                  <AdjustRow label="높이"       value={pos.hRatio}    step={0.005} onUp={() => adj("hRatio", 0.005)}  onDown={() => adj("hRatio", -0.005)} />
                  <AdjustRow label="좌우 여백"  value={pos.xRatio}    step={0.005} onUp={() => adj("xRatio", -0.005)} onDown={() => adj("xRatio", 0.005)} />
                  <AdjustRow label="너비"       value={pos.wRatio}    step={0.005} onUp={() => adj("wRatio", 0.005)}  onDown={() => adj("wRatio", -0.005)} />
                  <AdjustRow label="모서리"     value={pos.radiusPct} step={0.002} onUp={() => adj("radiusPct", 0.002)} onDown={() => adj("radiusPct", -0.002)} />
                  <button
                    onClick={() => setPos({ ...DEFAULT })}
                    className="w-full rounded-lg border border-gray-200 py-1.5 text-[11px] text-gray-400 hover:bg-gray-50 mt-1"
                  >
                    기본값으로 초기화
                  </button>
                </div>
              )}
            </div>
          )}

          {/* STEP 2 */}
          <StepCard n={2} done={step > 2} active={step === 2} title="소재 이미지 업로드" disabled={step < 2}>
            <p className="text-[11px] text-gray-400">소재를 업로드하면 비즈보드 영역에 자동 합성됩니다.</p>
            {creative ? (
              <div className="space-y-2">
                <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2">
                  <p className="text-[11px] font-semibold text-green-700">✓ 소재 합성됨</p>
                </div>
                <button onClick={() => setCreative(null)}
                  className="w-full rounded-lg border border-gray-200 py-1.5 text-xs text-gray-500 hover:bg-gray-50">
                  소재 교체
                </button>
              </div>
            ) : (
              <FileInput label="소재 이미지 업로드" hint="PNG, JPG" onChange={handleCreative} />
            )}
          </StepCard>

          {/* STEP 3 */}
          <StepCard n={3} done={false} active={step === 3} title="다운로드" disabled={step < 3}>
            <input
              type="text" value={downloadName}
              onChange={e => setDownloadName(e.target.value)}
              placeholder="파일명"
              className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 focus:border-blue-300 focus:outline-none"
            />
            <button onClick={handleDownload} disabled={step !== 3}
              className="w-full rounded-lg bg-blue-600 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40 flex items-center justify-center gap-1.5">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              PNG 다운로드
            </button>
          </StepCard>
        </div>

        {/* ── 오른쪽 캔버스 ─────────────────────────────── */}
        <div className="flex-1 overflow-auto bg-gray-100 flex items-start justify-center p-6">
          {!bgImg ? (
            <div className="flex h-full w-full items-center justify-center">
              <div className="text-center">
                <svg className="mx-auto h-16 w-16 text-gray-200 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 3h18M3 21h18" />
                </svg>
                <p className="text-sm font-medium text-gray-400">
                  카카오톡 채팅 스크린샷을 업로드하면<br />비즈보드 영역이 자동으로 채워집니다
                </p>
              </div>
            </div>
          ) : (
            <div className="shadow-2xl rounded-lg overflow-hidden">
              <canvas
                ref={canvasRef}
                style={{ display: "block", maxWidth: "420px", width: "100%", height: "auto" }}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
