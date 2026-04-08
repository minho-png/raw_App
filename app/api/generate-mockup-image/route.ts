import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

const MODEL = 'gpt-image-1'
const GENERATIONS_URL = 'https://api.openai.com/v1/images/generations'
const EDITS_URL       = 'https://api.openai.com/v1/images/edits'

const PRESET_SURFACE_DESC: Record<string, string> = {
  'bizboard':         'Kakao Talk chat tab, top banner strip slot (비즈보드)',
  'native-1200x600':  'Kakao "더보기" tab, native card 1200×600 slot',
  'native-1000x800':  'Kakao feed tab, native card 1000×800 slot with logo and CTA button',
  'native-view':      'Kakao View, full-width native card slot',
}

function b64ToBlob(data: string, mime: string): Blob {
  return new Blob([Buffer.from(data, 'base64')], { type: mime })
}

function extractB64(json: unknown): string | null {
  return (json as { data?: { b64_json?: string }[] })?.data?.[0]?.b64_json ?? null
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 })
  }

  const authHeader = { Authorization: `Bearer ${apiKey}` }

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
        referenceImageData = Buffer.from(await refFile.arrayBuffer()).toString('base64')
        referenceImageMime = refFile.type || 'image/jpeg'
      }
      const mediaFile = form.get('mediaImage') as File | null
      if (mediaFile) {
        mediaImageData = Buffer.from(await mediaFile.arrayBuffer()).toString('base64')
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

  // ── Case A: 지면 이미지 + 광고 소재 → 게재 목업 합성 ──────────────────────
  if (mediaImageData && referenceImageData) {
    const campaignCtx = campaignName ? `Campaign: ${campaignName}. ` : ''
    const surfaceDesc = presetId ? PRESET_SURFACE_DESC[presetId] ?? 'Korean digital media app screen' : 'Korean digital media app screen'
    const userExtra   = prompt.trim() ? `\nAdditional requirement: ${prompt.trim()}` : ''

    const compositingPrompt = `${campaignCtx}Composite the ad creative (second image) into the advertising slot of the media app screen (first image).

Screen (first image — ${surfaceDesc}):
Preserve the app UI chrome exactly — navigation bars, tabs, icons, background colors, and all surrounding interface elements remain pixel-identical.

Ad creative (second image):
Place the creative into the banner/card/feed advertising slot naturally. Preserve brand colors, logo, typography, and layout. The creative fits the slot dimensions with no visible seam or distortion.

Output: A photorealistic composited screenshot indistinguishable from an actual ad delivery proof (게재 확인 목업).${userExtra}`

    try {
      const form = new FormData()
      form.append('model',           MODEL)
      form.append('prompt',          compositingPrompt)
      form.append('n',               '1')
      form.append('size',            '1024x1536')
      form.append('response_format', 'b64_json')
      // gpt-image-1 accepts multiple images via image[] for multi-reference compositing
      form.append('image[]', b64ToBlob(mediaImageData, mediaImageMime),     'media.png')
      form.append('image[]', b64ToBlob(referenceImageData, referenceImageMime), 'creative.jpg')

      const res = await fetch(EDITS_URL, { method: 'POST', headers: authHeader, body: form })
      if (!res.ok) {
        const errBody = await res.text()
        console.error('[generate-mockup-image/compositing]', res.status, errBody)
        return NextResponse.json(
          { error: `OpenAI 오류 (${res.status}): ${errBody.slice(0, 200)}` },
          { status: 500 },
        )
      }
      const json = await res.json()
      const imageData = extractB64(json)
      if (!imageData) return NextResponse.json({ error: '목업 이미지 생성에 실패했습니다.' }, { status: 500 })
      return NextResponse.json({ imageData, mimeType: 'image/png' })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[generate-mockup-image/compositing]', msg)
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }

  // ── Case B: 광고 소재만 → 브랜드 아이덴티티 보존 소재 변형/개선 ──────────────
  if (referenceImageData) {
    const campaignCtx = campaignName ? `Campaign: ${campaignName}. ` : ''
    const customReq   = prompt.trim()
      ? `Additional requirement: ${prompt.trim()}`
      : 'Maintain all brand colors, logo placement, and layout structure from the reference.'

    const adPrompt = `${campaignCtx}Produce an improved version of the ad creative shown in the reference image, preserving brand identity.

Rules:
- Carry over the exact brand color palette, logo, and core layout from the reference image
- Do not invent new visual elements or alter brand marks
- Improve visual polish: cleaner composition, sharper contrast, better hierarchy
- Output format: Korean digital advertising creative, ready for direct media placement
- Clean background, single clear subject, no decorative borders

${customReq}`

    try {
      const form = new FormData()
      form.append('model',           MODEL)
      form.append('prompt',          adPrompt)
      form.append('n',               '1')
      form.append('size',            '1024x1024')
      form.append('response_format', 'b64_json')
      form.append('image',           b64ToBlob(referenceImageData, referenceImageMime), 'reference.jpg')

      const res = await fetch(EDITS_URL, { method: 'POST', headers: authHeader, body: form })
      if (!res.ok) {
        const errBody = await res.text()
        console.error('[generate-mockup-image/reference]', res.status, errBody)
        return NextResponse.json(
          { error: `OpenAI 오류 (${res.status}): ${errBody.slice(0, 200)}` },
          { status: 500 },
        )
      }
      const json = await res.json()
      const imageData = extractB64(json)
      if (!imageData) return NextResponse.json({ error: '응답에서 이미지를 찾을 수 없습니다.' }, { status: 500 })
      return NextResponse.json({ imageData, mimeType: 'image/png' })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[generate-mockup-image/reference]', msg)
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }

  // ── Case C: 텍스트 전용 → 이미지 생성 ──────────────────────────────────────
  const campaignCtx = campaignName ? `Campaign: ${campaignName}. ` : ''
  const surfaceCtx  = presetId ? `Media surface: ${PRESET_SURFACE_DESC[presetId] ?? 'Korean digital media'}. ` : ''
  const genPrompt   = `${campaignCtx}${surfaceCtx}Korean digital advertising creative image.

${prompt}

Requirements:
- High-quality ad creative suitable for direct media placement in Korean digital advertising
- Clean background, clear subject, strong visual hierarchy
- Photorealistic or clean graphic style appropriate for the Korean mobile ad market`

  try {
    const res = await fetch(GENERATIONS_URL, {
      method: 'POST',
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:           MODEL,
        prompt:          genPrompt,
        n:               1,
        size:            '1024x1024',
        response_format: 'b64_json',
      }),
    })
    if (!res.ok) {
      const errBody = await res.text()
      console.error('[generate-mockup-image/text-only]', res.status, errBody)
      return NextResponse.json(
        { error: `OpenAI 오류 (${res.status}): ${errBody.slice(0, 200)}` },
        { status: 500 },
      )
    }
    const json = await res.json()
    const imageData = extractB64(json)
    if (!imageData) return NextResponse.json({ error: '응답에서 이미지를 찾을 수 없습니다.' }, { status: 500 })
    return NextResponse.json({ imageData, mimeType: 'image/png' })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[generate-mockup-image/text-only]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
