import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { MEDIA_CONFIG } from '@/lib/reportTypes'
import type { MediaType } from '@/lib/reportTypes'
import { MEDIA_MARKUP_RATE, DMP_TARGETS, DMP_FEE_RATES } from '@/lib/campaignTypes'
import type { Campaign } from '@/lib/campaignTypes'
import type { RawRow } from '@/lib/rawDataParser'

// ── 헬퍼 ────────────────────────────────────────────────────

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[\s_\-()（）\.·]/g, '')
}

function findValue(row: Record<string, unknown>, ...candidates: string[]): number {
  const normalized = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [normalizeKey(k), v])
  )
  for (const c of candidates) {
    const val = normalized[normalizeKey(c)]
    if (val !== undefined && val !== null && val !== '') {
      const num = parseFloat(String(val).replace(/,/g, ''))
      if (!isNaN(num)) return num
    }
  }
  return 0
}

function findStringValue(row: Record<string, unknown>, ...candidates: string[]): string {
  const normalized = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [normalizeKey(k), v])
  )
  for (const c of candidates) {
    const val = normalized[normalizeKey(c)]
    if (val !== undefined && val !== null && val !== '') return String(val).trim()
  }
  return ''
}

function parseDate(raw: unknown): string {
  if (typeof raw === 'number') {
    const epoch = new Date(Date.UTC(1899, 11, 30))
    const d = new Date(epoch.getTime() + raw * 86400000)
    return d.toISOString().slice(0, 10)
  }
  if (raw instanceof Date) {
    return raw.toISOString().slice(0, 10)
  }
  const s = String(raw).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  if (/^\d{4}\.\d{2}\.\d{2}/.test(s)) return s.slice(0, 10).replace(/\./g, '-')
  if (/^\d{4}\/\d{2}\/\d{2}/.test(s)) return s.slice(0, 10).replace(/\//g, '-')
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`
  const d = new Date(s)
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return s
}

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']

function getDayOfWeek(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00')
    return DAY_NAMES[d.getDay()] ?? ''
  } catch {
    return ''
  }
}

function getMarkupFactor(media: MediaType, dmpName: string, campaign: Campaign | null): number {
  const mediaLabel = MEDIA_CONFIG[media].label
  const mediaMarkup = MEDIA_MARKUP_RATE[mediaLabel] ?? 0

  if (!campaign) return 1 - mediaMarkup / 100

  const mediaBudget = campaign.mediaBudgets.find(mb => mb.media === mediaLabel)
  if (!mediaBudget) return 1 - mediaMarkup / 100

  const upperDmp = dmpName.toUpperCase()
  const matchedDmp = DMP_TARGETS.find(t => upperDmp.includes(t.toUpperCase()))

  let dmpFeeRate = 0
  let agencyFeeRate = 0

  if (matchedDmp) {
    dmpFeeRate = DMP_FEE_RATES[matchedDmp] ?? 0
    agencyFeeRate = mediaBudget.dmp.agencyFeeRate
  } else {
    agencyFeeRate = mediaBudget.nonDmp.agencyFeeRate
  }

  const totalMarkup = mediaMarkup + dmpFeeRate + agencyFeeRate
  const factor = 1 - totalMarkup / 100
  return factor > 0 ? factor : 1
}

/** 메타데이터 행을 건너뛰고 실제 헤더 행을 찾아 rows 반환 */
function extractRows(sheet: XLSX.WorkSheet, media: MediaType): Record<string, unknown>[] {
  const rawData = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })

  const DATE_KEYS = media === 'naver'
    ? ['시작일', '날짜', 'date', '일자', '기준일', '일']
    : ['일', '날짜', 'date', '일자', '기준일', '시작일']

  const headerRowIndex = rawData.findIndex(row =>
    Array.isArray(row) && row.some(cell =>
      DATE_KEYS.some(h => normalizeKey(String(cell)) === normalizeKey(h))
    )
  )

  if (headerRowIndex === -1) return []

  const headers = (rawData[headerRowIndex] as unknown[]).map(h => String(h))
  const dataRows = rawData.slice(headerRowIndex + 1)

  return dataRows
    .filter(row => Array.isArray(row) && (row as unknown[]).some(cell => cell !== ''))
    .map(row => {
      const arr = row as unknown[]
      return Object.fromEntries(headers.map((h, i) => [h, arr[i] ?? '']))
    })
}

// ── POST 핸들러 ──────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const media = formData.get('media') as MediaType
    const campaignJson = formData.get('campaign') as string
    const campaign: Campaign | null = campaignJson && campaignJson !== 'null'
      ? JSON.parse(campaignJson)
      : null

    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(Buffer.from(buffer), { type: 'buffer', cellDates: true })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const allRows = extractRows(sheet, media)

    const mediaLabel = MEDIA_CONFIG[media].label
    const isNaver = media === 'naver'
    const result: RawRow[] = []

    for (const row of allRows) {
      // ── 날짜 ──
      let rawDate: string
      if (media === 'naver') {
        rawDate = findStringValue(row, '시작일', '날짜', 'date', '일자', '기준일', '기간', '보고 기간 시작', '보고기간시작')
      } else {
        rawDate = findStringValue(row, '일', '날짜', 'date', '일자', '기준일', '기간', '보고 기간 시작', '보고기간시작')
      }

      if (!rawDate) continue
      const dateStr = parseDate(rawDate)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue

      const dayOfWeek = getDayOfWeek(dateStr)

      // ── 매체별 컬럼 매핑 ──
      let creativeName: string
      let dmpName: string

      if (media === 'google') {
        creativeName = findStringValue(row,
          '이미지 광고 이름', '이미지광고이름', '광고이름', '광고 이름', 'ad name', 'adname', '광고명', '광고소재이름'
        )
        dmpName = findStringValue(row,
          '광고그룹', '광고 그룹', 'ad group', 'adgroup', '광고그룹명', '그룹이름', '캠페인'
        )
      } else if (media === 'meta') {
        creativeName = findStringValue(row,
          '광고 이름', '광고이름', 'ad name', 'adname', '광고명'
        )
        dmpName = findStringValue(row,
          '광고 세트 이름', '광고세트이름', '광고세트명', '광고 세트명',
          'ad set name', 'adsetname', 'adset name'
        )
      } else if (media === 'naver') {
        creativeName = findStringValue(row,
          '광고 소재 이름', '광고소재이름', '소재 이름', '소재이름', '소재명', '광고소재'
        )
        dmpName = findStringValue(row,
          '광고 그룹 이름', '광고그룹이름', '광고그룹 이름', '광고그룹명', '광고 그룹명', '그룹명'
        )
      } else {
        // kakao
        creativeName = findStringValue(row,
          '소재 이름', '소재이름', '소재명', 'creative name', 'ad name', 'adname'
        )
        dmpName = findStringValue(row,
          '광고그룹 명', '광고그룹명', '광고그룹 이름', '광고그룹이름', '그룹명', 'ad group name', '그룹이름'
        )
      }

      // ── 지표 ──
      const impressions = findValue(row, '노출수', '노출', 'impressions', 'impr', '노출량', 'impr.')
      const clicks = media === 'meta'
        ? findValue(row, '링크 클릭', '링크클릭', '클릭수', '클릭', 'clicks', 'click', '링크 클릭수', '링크클릭수')
        : findValue(row, '클릭수', '클릭', 'clicks', 'click', '링크 클릭수', '링크클릭수')

      let views: number | null = null
      if (media === 'google') {
        views = findValue(row,
          'TrueView 조회수', 'trueview 조회수', 'trueview조회수', '조회수', 'views', 'video views',
          'trueview views', '동영상 조회수', '동영상조회수'
        )
      } else if (media === 'meta') {
        views = findValue(row, '결과', 'results', '결과수')
      }

      let netCost: number
      if (media === 'naver') {
        netCost = findValue(row, '이 비용', '이비용', '총 비용', '총비용', 'total cost', '합계 비용', '합계비용', '비용', 'cost')
      } else if (media === 'meta') {
        netCost = findValue(row,
          '지출 금액 (KRW)', '지출금액(krw)', '지출금액 (krw)', '지출금액krw', '지출금액',
          '비용', 'cost', 'spend', '소진금액', '집행금액', '금액', '청구금액',
          '합계금액', 'amount spent', 'amountspent'
        )
      } else {
        netCost = findValue(row,
          '비용', 'cost', 'spend', '소진금액', '집행금액', '금액', '청구금액',
          '합계금액', 'amount spent', 'amountspent'
        )
      }

      if (impressions === 0 && clicks === 0 && netCost === 0) continue

      const markupFactor = getMarkupFactor(media, dmpName, campaign)
      const grossCost = isNaver
        ? Math.round((netCost / 1.1) / markupFactor)
        : Math.round(netCost / markupFactor)

      result.push({
        date: dateStr,
        dayOfWeek,
        media: mediaLabel,
        creativeName,
        dmpName,
        impressions: Math.round(impressions),
        clicks: Math.round(clicks),
        views: views !== null ? Math.round(views) : null,
        grossCost,
        netCost: Math.round(netCost),
      })
    }

    return NextResponse.json(result.sort((a, b) => a.date.localeCompare(b.date)))
  } catch (e) {
    console.error('[parse-raw] error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
