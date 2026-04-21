import { NextRequest, NextResponse } from 'next/server'
import clientPromise from '@/lib/mongodb'
import type { Agency } from '@/lib/campaignTypes'

interface UploadResponse {
  ok?: true
  agencyId?: string
  pdfBase64?: string
  pdfName?: string
  error?: string
}

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export async function POST(req: NextRequest): Promise<NextResponse<UploadResponse>> {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const agencyId = formData.get('agencyId') as string | null

    // 파라미터 검증
    if (!file) {
      return NextResponse.json(
        { error: 'File is required' },
        { status: 400 }
      )
    }

    if (!agencyId) {
      return NextResponse.json(
        { error: 'agencyId is required' },
        { status: 400 }
      )
    }

    // 파일 크기 검증
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds 10MB limit. Current size: ${(file.size / 1024 / 1024).toFixed(2)}MB` },
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

    // 파일을 base64로 변환
    const arrayBuffer = await file.arrayBuffer()
    const base64String = Buffer.from(arrayBuffer).toString('base64')

    // MongoDB 연결
    const client = await clientPromise
    const db = client.db('kim_dashboard')
    const collection = db.collection('ct_master_data')

    // ct_master_data 문서 조회
    const masterData = await collection.findOne({
      workspace_id: 'system',
      type: 'agencies',
    })

    if (!masterData) {
      return NextResponse.json(
        { error: 'Master data not found' },
        { status: 404 }
      )
    }

    // agencies 배열에서 해당 id의 항목 찾기
    const agencies = masterData.data as Agency[]
    const agencyIndex = agencies.findIndex((agency) => agency.id === agencyId)

    if (agencyIndex === -1) {
      return NextResponse.json(
        { error: `Agency with id '${agencyId}' not found` },
        { status: 404 }
      )
    }

    // 해당 항목의 PDF 정보 업데이트
    agencies[agencyIndex].registrationPdfBase64 = base64String
    agencies[agencyIndex].registrationPdfName = file.name
    agencies[agencyIndex].updatedAt = new Date().toISOString()

    // MongoDB 업데이트
    await collection.updateOne(
      {
        workspace_id: 'system',
        type: 'agencies',
      },
      {
        $set: {
          data: agencies,
        },
      }
    )

    return NextResponse.json(
      { ok: true, agencyId, pdfBase64: base64String, pdfName: file.name },
      { status: 200 }
    )
  } catch (error) {
    console.error('PDF upload error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}