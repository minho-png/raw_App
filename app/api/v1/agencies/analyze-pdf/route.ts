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

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds 20MB limit. Current: ${(file.size / 1024 / 1024).toFixed(2)}MB` },
        { status: 400 }
      )
    }

    // MIME 타입 관대하게 검증 (일부 브라우저/OS는 다른 타입을 반환)
    const isPdf = file.type === 'application/pdf' ||
                  file.type === 'application/octet-stream' ||
                  file.name.toLowerCase().endsWith('.pdf')
    if (!isPdf) {
      return NextResponse.json(
        { error: `PDF 파일이 아닙니다. (타입: ${file.type})` },
        { status: 400 }
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    const pdfBuffer = Buffer.from(arrayBuffer)

    // PDF 시그니처 확인
    if (!pdfBuffer.slice(0, 5).toString('ascii').startsWith('%PDF')) {
      return NextResponse.json({ error: '유효한 PDF 파일이 아닙니다.' }, { status: 400 })
    }

    const fields = await extractBusinessRegistrationFields(pdfBuffer)

    return NextResponse.json({ ok: true, fields }, { status: 200 })
  } catch (error) {
    console.error('PDF analyze error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
