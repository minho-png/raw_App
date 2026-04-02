import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

// 프리셋별 지면 설명 (text-only fallback에서 정확한 화면 묘사에 활용)
const PRESET_SURFACE_DESC: Record<string, string> = {
  'bizboard':         'Kakao Talk chat tab, top banner strip slot (비즈보드)',
  'native-1200x600':  'Kakao "더보기" tab, native card 1200×600 slot',
  'native-1000x800':  'Kakao feed tab, native card 1000×800 slot with logo and CTA button',
  'native-view':      'Kakao View, full-width native card slot',
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 })
  }

  let prompt = ''
  let referenceImageData: string | null = null
  let referenceImageMime = 'image/jpeg'
  let mediaImageData: string | null = null
  let mediaImageMime = 'image/png'
  let campaignName: string | null = null
  let presetId: string | null = null

  try {
    const ct = req.headers.get('content-type') ?? ''
    if (ct.includes('multipart/form-data')) {
      const form = await req.formData()
      prompt       = String(form.get('prompt') ?? '')
      campaignName = form.get('campaignName') ? String(form.get('campaignName')) : null
      presetId     = form.get('presetId')     ? String(form.get('presetId'))     : null
      const refFile = form.get('referenceImage') as File | null
      if (refFile) {
        const buf = await refFile.arrayBuffer()
        referenceImageData = Buffer.from(buf).toString('base64')
        referenceImageMime = refFile.type || 'image/jpeg'
      }
      const mediaFile = form.get('mediaImage') as File | null
      if (mediaFile) {
        const buf = await mediaFile.arrayBuffer()
        mediaImageData = Buffer.from(buf).toString('base64')
        mediaImageMime = mediaFile.type || 'image/png'
      }
    } else {
      const body = await req.json()
      prompt             = String(body.prompt ?? '')
      campaignName       = body.campaignName ?? null
      presetId           = body.presetId     ?? null
      referenceImageData = body.referenceImageData ?? null
      referenceImageMime = body.referenceImageMime ?? 'image/jpeg'
      mediaImageData     = body.mediaImageData ?? null
      mediaImageMime     = body.mediaImageMime ?? 'image/png'
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!prompt.trim() && !referenceImageData && !mediaImageData) {
    return NextResponse.json({ error: '프롬프트 또는 이미지가 필요합니다.' }, { status: 400 })
  }

  const IMAGEN_URL = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-ultra-generate-001:predict?key=${apiKey}`

  // ── Case A: 지면 이미지 + 광고 소재 → 게재 목업 합성 ───────────────────────
  if (mediaImageData && referenceImageData) {
    const campaignCtx  = campaignName ? `Campaign: ${campaignName}. ` : ''
    const surfaceDesc  = presetId ? PRESET_SURFACE_DESC[presetId] ?? 'Korean digital media app screen' : 'Korean digital media app screen'
    const userExtra    = prompt.trim() ? `\nAdditional requirement: ${prompt.trim()}` : ''

    // 이미지 참조 경로: 지면(RAW) + 소재(SUBJECT) 명시 합성
    const compositingPrompt = `${campaignCtx}This is a completed ad placement mockup screenshot showing an advertisement composited into a live Korean mobile media surface.

Scene (reference image 1 — ${surfaceDesc}):
The app UI chrome is preserved exactly as shown — navigation bars, tabs, icons, background colors, and all surrounding interface elements remain pixel-identical to the original screenshot.

Ad creative (reference image 2):
The ad creative fills the advertising banner/card/feed slot naturally. Its brand colors, logo, typography, and layout are preserved without modification. The creative fits the slot's exact dimensions and corner-rounding with no visible seam, shadow artifact, or distortion.

Output: A photorealistic composited screenshot at mobile screen resolution. The result looks indistinguishable from an actual ad delivery proof (게재 확인 목업) — not a generated illustration, but a real screen capture showing the ad running in the media app.${userExtra}`

    try {
      const res = await fetch(IMAGEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{
            prompt: compositingPrompt,
            referenceImages: [
              {
                // 지면 화면: 씬의 배경 캔버스
                referenceType: 'REFERENCE_TYPE_RAW',
                referenceId: 1,
                referenceImage: { bytesBase64Encoded: mediaImageData, mimeType: mediaImageMime },
              },
              {
                // 광고 소재: 지면에 삽입할 대상(subject) — RAW가 아닌 SUBJECT로 아이덴티티 보존
                referenceType: 'REFERENCE_TYPE_SUBJECT',
                referenceId: 2,
                referenceImage: { bytesBase64Encoded: referenceImageData, mimeType: referenceImageMime },
              },
            ],
          }],
          parameters: { sampleCount: 1, aspectRatio: '9:16' },
        }),
      })

      if (res.ok) {
        const json = await res.json()
        const prediction = json.predictions?.[0]
        const imageData: string | undefined = prediction?.bytesBase64Encoded
        if (imageData) {
          return NextResponse.json({ imageData, mimeType: prediction?.mimeType ?? 'image/png' })
        }
      }

      // referenceImages 미지원 시: 지면 화면을 텍스트로 묘사하는 별도 fallback 프롬프트
      const fallbackPrompt = `${campaignCtx}Korean mobile ad placement mockup screenshot.

Screen: ${surfaceDesc} — the app's full UI chrome (status bar, navigation, tabs, feed list, background) is visible exactly as it appears on a real smartphone.

Ad slot: The banner or card advertising slot within the app screen contains a brand advertisement. The creative fills the slot cleanly with crisp colors, logo, and typography — no border, drop shadow, or compression artifact. The transition between the ad and the surrounding app UI is seamless, as if the ad is natively rendered by the app.

Style: Photorealistic smartphone screen capture. High resolution, sharp text, accurate app color scheme. Ad delivery proof (게재 확인) quality.${userExtra}`

      const fallbackRes = await fetch(IMAGEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt: fallbackPrompt }],
          parameters: { sampleCount: 1, aspectRatio: '9:16' },
        }),
      })

      if (!fallbackRes.ok) {
        const errBody = await fallbackRes.text()
        console.error('[generate-mockup-image/compositing]', fallbackRes.status, errBody)
        return NextResponse.json(
          { error: `Imagen 4 Ultra 오류 (${fallbackRes.status}): ${errBody.slice(0, 200)}` },
          { status: 500 },
        )
      }

      const fallbackJson = await fallbackRes.json()
      const fallbackPrediction = fallbackJson.predictions?.[0]
      const fallbackImageData: string | undefined = fallbackPrediction?.bytesBase64Encoded
      if (!fallbackImageData) {
        return NextResponse.json({ error: '목업 이미지 생성에 실패했습니다.' }, { status: 500 })
      }
      return NextResponse.json({ imageData: fallbackImageData, mimeType: fallbackPrediction?.mimeType ?? 'image/png' })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[generate-mockup-image/compositing]', msg)
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }

  // ── Case B: 광고 소재만 → 브랜드 아이덴티티 보존 소재 변형/개선 ───────────────
  if (referenceImageData) {
    const campaignCtx = campaignName ? `Campaign: ${campaignName}. ` : ''
    const customReq   = prompt.trim()
      ? `Additional requirement: ${prompt.trim()}`
      : 'Maintain all brand colors, logo placement, and layout structure from the reference.'

    // "생성"이 아닌 "변형/발전" 프레임: 브랜드 소재 원형 보존
    const adPrompt = `${campaignCtx}Produce an improved version of the ad creative shown in the reference image, preserving brand identity.

Compositing rules:
- Carry over the exact brand color palette, logo, and core layout from the reference image
- Do not invent new visual elements or alter brand marks
- Improve visual polish: cleaner composition, sharper contrast, better hierarchy
- Output format: Korean digital advertising creative, ready for direct media placement
- Clean background, single clear subject, no decorative borders

${customReq}`

    try {
      const res = await fetch(IMAGEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{
            prompt: adPrompt,
            referenceImages: [{
              // SUBJECT(not STYLE): 브랜드 로고·레이아웃·색상 구조 보존이 목적
              referenceType: 'REFERENCE_TYPE_SUBJECT',
              referenceId: 1,
              referenceImage: { bytesBase64Encoded: referenceImageData, mimeType: referenceImageMime },
            }],
          }],
          parameters: { sampleCount: 1 },
        }),
      })

      if (res.ok) {
        const json = await res.json()
        const prediction = json.predictions?.[0]
        const imageData: string | undefined = prediction?.bytesBase64Encoded
        if (imageData) {
          return NextResponse.json({ imageData, mimeType: prediction?.mimeType ?? 'image/png' })
        }
      }

      // 미지원 시 텍스트만으로 재시도
      const fallbackRes = await fetch(IMAGEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt: adPrompt }],
          parameters: { sampleCount: 1 },
        }),
      })

      if (!fallbackRes.ok) {
        const errBody = await fallbackRes.text()
        return NextResponse.json(
          { error: `Imagen 4 Ultra 오류 (${fallbackRes.status}): ${errBody.slice(0, 200)}` },
          { status: 500 },
        )
      }

      const fallbackJson = await fallbackRes.json()
      const fallbackPrediction = fallbackJson.predictions?.[0]
      const fallbackImageData: string | undefined = fallbackPrediction?.bytesBase64Encoded
      if (!fallbackImageData) {
        return NextResponse.json({ error: '응답에서 이미지를 찾을 수 없습니다.' }, { status: 500 })
      }
      return NextResponse.json({ imageData: fallbackImageData, mimeType: fallbackPrediction?.mimeType ?? 'image/png' })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[generate-mockup-image/reference]', msg)
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }

  // ── Case C: 텍스트 전용 → Imagen 4 Ultra 텍스트-투-이미지 ────────────────────
  const campaignCtx = campaignName ? `Campaign: ${campaignName}. ` : ''
  const surfaceCtx  = presetId ? `Media surface: ${PRESET_SURFACE_DESC[presetId] ?? 'Korean digital media'}. ` : ''
  const imagenPrompt = `${campaignCtx}${surfaceCtx}Korean digital advertising creative image.

${prompt}

Requirements:
- High-quality ad creative suitable for direct media placement in Korean digital advertising
- Clean background, clear subject, strong visual hierarchy
- Photorealistic or clean graphic style appropriate for the Korean mobile ad market`

  try {
    const res = await fetch(IMAGEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt: imagenPrompt }],
        parameters: { sampleCount: 1, aspectRatio: '1:1' },
      }),
    })

    if (!res.ok) {
      const errBody = await res.text()
      console.error('[generate-mockup-image/imagen4]', res.status, errBody)
      return NextResponse.json(
        { error: `Imagen 4 Ultra 오류 (${res.status}): ${errBody.slice(0, 200)}` },
        { status: 500 },
      )
    }

    const json = await res.json()
    const prediction = json.predictions?.[0]
    const imageData: string | undefined = prediction?.bytesBase64Encoded
    if (!imageData) {
      return NextResponse.json({ error: '응답에서 이미지를 찾을 수 없습니다.' }, { status: 500 })
    }
    return NextResponse.json({ imageData, mimeType: prediction?.mimeType ?? 'image/png' })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[generate-mockup-image/imagen4]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
