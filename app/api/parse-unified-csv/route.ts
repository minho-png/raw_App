import { NextRequest, NextResponse } from 'next/server'
import { parseUnifiedCsv } from '@/lib/unifiedCsvParser'
import type { Campaign } from '@/lib/campaignTypes'

// 대용량 CSV 파일 지원 (모티브 광고성과 등 4~5MB 파일)
export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    // campaigns: JSON array of Campaign objects (다중 캠페인)
    // campaign:  단일 Campaign (하위 호환)
    const campaignsJson = formData.get('campaigns') as string | null
    const campaignJson  = formData.get('campaign')  as string | null

    if (!file) {
      return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 })
    }

    let campaigns: Campaign[]
    if (campaignsJson) {
      campaigns = JSON.parse(campaignsJson) as Campaign[]
    } else if (campaignJson) {
      const c = JSON.parse(campaignJson) as Campaign | null
      campaigns = c ? [c] : []
    } else {
      campaigns = []
    }

    // UTF-8(with BOM 포함) → EUC-KR 폴백으로 텍스트 읽기
    let csvText: string
    try {
      const arrayBuffer = await file.arrayBuffer()
      // ignoreBOM: true → BOM 자동 제거
      const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
      try {
        csvText = decoder.decode(arrayBuffer)
      } catch {
        const euckrDecoder = new TextDecoder('euc-kr', { fatal: false })
        csvText = euckrDecoder.decode(arrayBuffer)
      }
    } catch {
      return NextResponse.json({ error: '파일 인코딩을 읽을 수 없습니다.' }, { status: 400 })
    }

    const result = parseUnifiedCsv(csvText, campaigns)

    return NextResponse.json(result)
  } catch (e) {
    console.error('[parse-unified-csv]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '파싱 중 오류가 발생했습니다.' },
      { status: 500 },
    )
  }
}
