import { NextRequest, NextResponse } from 'next/server'
import { parseUnifiedCsv } from '@/lib/unifiedCsvParser'
import type { Campaign } from '@/lib/campaignTypes'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const campaignJson = formData.get('campaign') as string | null

    if (!file) {
      return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 })
    }

    const campaign: Campaign | null = campaignJson ? JSON.parse(campaignJson) : null

    // UTF-8 → EUC-KR 폴백으로 텍스트 읽기
    let csvText: string
    try {
      const arrayBuffer = await file.arrayBuffer()
      const decoder = new TextDecoder('utf-8', { fatal: true })
      try {
        csvText = decoder.decode(arrayBuffer)
      } catch {
        const euckrDecoder = new TextDecoder('euc-kr', { fatal: false })
        csvText = euckrDecoder.decode(arrayBuffer)
      }
    } catch {
      return NextResponse.json({ error: '파일 인코딩을 읽을 수 없습니다.' }, { status: 400 })
    }

    const result = parseUnifiedCsv(csvText, campaign)

    return NextResponse.json(result)
  } catch (e) {
    console.error('[parse-unified-csv]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '파싱 중 오류가 발생했습니다.' },
      { status: 500 },
    )
  }
}
