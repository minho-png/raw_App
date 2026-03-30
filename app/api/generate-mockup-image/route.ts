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

  if (!prompt.trim()) {
    return NextResponse.json({ error: 'prompt is required' }, { status: 400 })
  }

  const genAI = new GoogleGenerativeAI(apiKey)

  // Gemini 2.0 Flash image generation model
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash-preview-image-generation',
    generationConfig: {
      // @ts-expect-error — responseModalities is not yet typed in the SDK
      responseModalities: ['TEXT', 'IMAGE'],
    },
  })

  // Build prompt with context for ad creative
  const adPrompt = `당신은 전문 광고 크리에이티브 디자이너입니다.
다음 요청에 맞는 광고 이미지를 생성하세요. 결과는 깔끔하고 전문적인 광고 소재 이미지여야 합니다.

요청: ${prompt}

이미지 요구사항:
- 광고 소재로 바로 사용할 수 있는 고품질 이미지
- 배경이 깔끔하고 주제가 명확한 구성
- 한국 디지털 광고 시장에 적합한 스타일
- 텍스트 없이 이미지만 생성 (텍스트는 별도 레이어로 추가됨)`

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: adPrompt },
  ]

  if (referenceImageData) {
    parts.push({
      inlineData: { mimeType: referenceImageMime, data: referenceImageData },
    })
    parts.push({ text: '위 참고 이미지의 스타일과 주제를 반영하여 광고 이미지를 생성하세요.' })
  }

  try {
    const result = await model.generateContent(parts)
    const response = result.response

    // Extract image from response parts
    const candidate = response.candidates?.[0]
    if (!candidate?.content?.parts) {
      return NextResponse.json({ error: '이미지 생성에 실패했습니다.' }, { status: 500 })
    }

    for (const part of candidate.content.parts) {
      const inlineData = (part as { inlineData?: { data?: string; mimeType?: string } }).inlineData
      if (inlineData?.data) {
        const imageData: string = inlineData.data
        const mimeType: string = inlineData.mimeType ?? 'image/png'
        return NextResponse.json({ imageData, mimeType })
      }
    }

    return NextResponse.json({ error: '응답에서 이미지를 찾을 수 없습니다.' }, { status: 500 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[generate-mockup-image]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
