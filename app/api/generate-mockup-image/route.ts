import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 })
  }

  let prompt = ''
  let referenceImageData: string | null = null
  let referenceImageMime = 'image/jpeg'

  try {
    const ct = req.headers.get('content-type') ?? ''
    if (ct.includes('multipart/form-data')) {
      const form = await req.formData()
      prompt = String(form.get('prompt') ?? '')
      const refFile = form.get('referenceImage') as File | null
      if (refFile) {
        const buf = await refFile.arrayBuffer()
        referenceImageData = Buffer.from(buf).toString('base64')
        referenceImageMime = refFile.type || 'image/jpeg'
      }
    } else {
      const body = await req.json()
      prompt = String(body.prompt ?? '')
      referenceImageData = body.referenceImageData ?? null
      referenceImageMime = body.referenceImageMime ?? 'image/jpeg'
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  // 참고 이미지도 없고 프롬프트도 없으면 오류
  if (!prompt.trim() && !referenceImageData) {
    return NextResponse.json({ error: '프롬프트 또는 참고 이미지가 필요합니다.' }, { status: 400 })
  }

  // ── 참고 이미지가 있는 경우: Gemini 멀티모달 (Imagen은 이미지 입력 불가) ──────
  if (referenceImageData) {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-preview-image-generation',
      generationConfig: {
        // @ts-expect-error — responseModalities is not yet typed in the SDK
        responseModalities: ['TEXT', 'IMAGE'],
      },
    })

    // 프롬프트가 없으면 자동 생성: 참고 이미지를 배경 광고 영역에 맞게 합성
    const finalPrompt = prompt.trim() ||
      '업로드된 광고 소재 이미지를 분석하여, 동일한 디자인·색상·브랜드 요소를 최대한 유지하면서 배경 광고 지면에 자연스럽게 배치된 것처럼 보이는 고품질 광고 소재 이미지를 생성하세요.'

    const adPrompt = `당신은 전문 광고 크리에이티브 디자이너입니다.
${finalPrompt}

이미지 요구사항:
- 참고 이미지의 핵심 디자인 요소(색상, 레이아웃, 브랜드 요소)를 충실히 반영
- 광고 소재로 바로 사용할 수 있는 고품질 이미지
- 배경이 깔끔하고 주제가 명확한 구성
- 한국 디지털 광고 시장에 적합한 스타일
- 텍스트 없이 이미지만 생성 (텍스트는 별도 레이어로 추가됨)`

    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
      { text: adPrompt },
      { inlineData: { mimeType: referenceImageMime, data: referenceImageData } },
      { text: '위 참고 이미지의 스타일과 구성을 반영하여 광고 소재 이미지를 생성하세요.' },
    ]

    try {
      const result = await model.generateContent(parts)
      const candidate = result.response.candidates?.[0]
      if (!candidate?.content?.parts) {
        return NextResponse.json({ error: '이미지 생성에 실패했습니다.' }, { status: 500 })
      }
      for (const part of candidate.content.parts) {
        const inlineData = (part as { inlineData?: { data?: string; mimeType?: string } }).inlineData
        if (inlineData?.data) {
          return NextResponse.json({ imageData: inlineData.data, mimeType: inlineData.mimeType ?? 'image/png' })
        }
      }
      return NextResponse.json({ error: '응답에서 이미지를 찾을 수 없습니다.' }, { status: 500 })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[generate-mockup-image/gemini]', msg)
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }

  // ── 텍스트 전용: Imagen 4 Ultra Generate ─────────────────────────────────────
  const imagenPrompt = `당신은 전문 광고 크리에이티브 디자이너입니다.
다음 요청에 맞는 광고 이미지를 생성하세요. 결과는 깔끔하고 전문적인 광고 소재 이미지여야 합니다.

요청: ${prompt}

이미지 요구사항:
- 광고 소재로 바로 사용할 수 있는 고품질 이미지
- 배경이 깔끔하고 주제가 명확한 구성
- 한국 디지털 광고 시장에 적합한 스타일
- 텍스트 없이 이미지만 생성`

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-ultra-generate-exp-05-20:predict?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt: imagenPrompt }],
          parameters: { sampleCount: 1, aspectRatio: '1:1' },
        }),
      },
    )

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
    const mimeType: string = prediction?.mimeType ?? 'image/png'
    return NextResponse.json({ imageData, mimeType })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[generate-mockup-image/imagen4]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
