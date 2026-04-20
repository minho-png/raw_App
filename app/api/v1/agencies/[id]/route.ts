import { NextRequest, NextResponse } from 'next/server'
import clientPromise from '@/lib/mongodb'
import type { Agency } from '@/lib/campaignTypes'

interface PatchResponse {
  ok?: true
  agency?: Agency
  error?: string
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse<PatchResponse>> {
  try {
    const agencyId = params.id
    const updates = (await req.json()) as Partial<Agency>

    // agencyId 검증
    if (!agencyId || typeof agencyId !== 'string') {
      return NextResponse.json(
        { error: 'Invalid agency id' },
        { status: 400 }
      )
    }

    // registrationPdfBase64와 registrationPdfName은 수정 불가 (PDF 업로드 전용)
    if ('registrationPdfBase64' in updates || 'registrationPdfName' in updates) {
      return NextResponse.json(
        { error: 'PDF fields cannot be updated via this endpoint. Use /upload-pdf instead.' },
        { status: 400 }
      )
    }

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

    // 해당 항목 업데이트
    const updatedAgency: Agency = {
      ...agencies[agencyIndex],
      ...updates,
      id: agencyId, // id는 변경 불가
      updatedAt: new Date().toISOString(),
    }

    agencies[agencyIndex] = updatedAgency

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
      { ok: true, agency: updatedAgency },
      { status: 200 }
    )
  } catch (error) {
    console.error('Agency update error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
