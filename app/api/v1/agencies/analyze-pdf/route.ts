import { NextRequest, NextResponse } from 'next/server'
import { extractBusinessRegistrationFields, type OcrExtractedFields } from '@/lib/pdfOcr'

interface AnalyzeResponse {
  ok?: true
  fields?: OcrExtractedFields
  error?: string
}

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB

export async function POST(req: NextRequest): Promise<NextResponse<AnalyzeResponse>> {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    // 파라미터 검증
    if (!file) {
      return NextResponse.json(
        { error: 'File is required' },
        { status: 400 }
      )
    }

    // 파일 크기 검증
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds 20MB limit. Current size: ${(file.size / 1024 / 1024).toFixed(2)}MB` },
        { status: 400 }
      )
    }

    // 파일 타입 검증
    if (file.type !== 'application/pdf') {
      return NextResponse.json(
        { error: `Invalid file type. Expected PDF, received: ${file.type}` },
        { status: 400 }
      )
    }

    // PDF Buffer 생성
    const arrayBuffer = await file.arrayBuffer()
    const pdfBuffer = Buffer.from(arrayBuffer)

    // Python pdfplumber OCR 분석
    const fields = await extractBusinessRegistrationFields(pdfBuffer)

    return NextResponse.json(
      { ok: true, fields },
      { status: 200 }
    )
  } catch (error) {
    console.error('PDF analyze error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
