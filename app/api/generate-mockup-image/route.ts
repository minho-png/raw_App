import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

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

  try {
    const ct = req.headers.get('content-type') ?? ''
    if (ct.includes('multipart/form-data')) {
      const form = await req.formData()
      prompt = String(form.get('prompt') ?? '')
      campaignName = form.get('campaignName') ? String(form.get('campaignName')) : null
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
      prompt = String(body.prompt ?? '')
      campaignName = body.campaignName ?? null
      referenceImageData = body.referenceImageData ?? null
      referenceImageMime = body.referenceImageMime ?? 'image/jpeg'
      mediaImageData = body.mediaImageData ?? null
      mediaImageMime = body.mediaImageMime ?? 'image/png'
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!prompt.trim() && !referenceImageData && !mediaImageData) {
    return NextResponse.json({ error: '프롬프트 또는 이미지가 필요합니다.' }, { status: 400 })
  }

  const IMAGEN_URL = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-ultra-generate-exp-05-20:predict?key=${apiKey}`

  // ── Case A: 지면 이미지 + 광고 소재 → 게재 목업 합성 ────────────────────────
  if (mediaImageData && referenceImageData) {
    const campaignCtx = campaignName ? `캠페인: ${campaignName}. ` : ''
    const userExtra = prompt.trim() ? `\n추가 요청: ${prompt.trim()}` : ''
    const compositingPrompt = `${campaignCtx}당신은 광고 목업 제작 전문가입니다. 다음 광고 목업 이미지를 생성해주세요.

배경이 되는 지면 이미지(카카오, 유튜브 등 실제 매체 앱 화면)에 광고 소재가 자연스럽게 삽입된 완성된 게재 목업 이미지를 만들어주세요.

작업 내용:
- 지면 이미지의 광고 영역(배너·카드·피드 등)에 광고 소재를 정확히 배치
- 광고 소재의 색상·레이아웃·브랜드 요소를 최대한 원형 유지
- 지면의 UI 요소(앱 상단바·텍스트·버튼·아이콘 등)는 원본 그대로 유지
- 실제 집행된 광고처럼 보이는 고품질 합성 결과물 출력
- 한국 디지털 광고 시장 게재 목업 형식${userExtra}`

    try {
      const res = await fetch(IMAGEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{
            prompt: compositingPrompt,
            referenceImages: [
              {
                referenceType: 'REFERENCE_TYPE_RAW',
                referenceId: 1,
                referenceImage: { bytesBase64Encoded: mediaImageData, mimeType: mediaImageMime },
              },
              {
                referenceType: 'REFERENCE_TYPE_RAW',
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

      // referenceImages 미지원 시 텍스트 프롬프트만으로 재시도
      const fallbackRes = await fetch(IMAGEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt: compositingPrompt }],
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

  // ── Case B: 광고 소재만 → 스타일 기반 소재 생성 ─────────────────────────────
  if (referenceImageData) {
    const campaignCtx = campaignName ? `캠페인: ${campaignName}. ` : ''
    const finalPrompt = prompt.trim() ||
      '업로드된 광고 소재 이미지의 디자인·색상·브랜드 요소를 충실히 반영하여, 동일한 스타일의 고품질 광고 소재 이미지를 생성하세요.'
    const adPrompt = `${campaignCtx}당신은 전문 광고 크리에이티브 디자이너입니다.
${finalPrompt}

이미지 요구사항:
- 참고 이미지의 핵심 디자인 요소(색상, 레이아웃, 브랜드 요소)를 충실히 반영
- 광고 소재로 바로 사용할 수 있는 고품질 이미지
- 배경이 깔끔하고 주제가 명확한 구성
- 한국 디지털 광고 시장에 적합한 스타일`

    try {
      const res = await fetch(IMAGEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{
            prompt: adPrompt,
            referenceImages: [{
              referenceType: 'REFERENCE_TYPE_STYLE',
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

  // ── Case C: 텍스트 전용 → Imagen 4 Ultra 텍스트-투-이미지 ─────────────────────
  const campaignCtx = campaignName ? `캠페인: ${campaignName}. ` : ''
  const imagenPrompt = `${campaignCtx}당신은 전문 광고 크리에이티브 디자이너입니다.
다음 요청에 맞는 광고 이미지를 생성하세요.

요청: ${prompt}

이미지 요구사항:
- 광고 소재로 바로 사용할 수 있는 고품질 이미지
- 배경이 깔끔하고 주제가 명확한 구성
- 한국 디지털 광고 시장에 적합한 스타일`

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
