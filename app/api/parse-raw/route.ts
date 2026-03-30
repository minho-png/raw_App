import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { MEDIA_CONFIG } from '@/lib/reportTypes'
import type { MediaType } from '@/lib/reportTypes'
import { MEDIA_MARKUP_RATE, DMP_TARGETS, DMP_FEE_RATES } from '@/lib/campaignTypes'
import type { Campaign } from '@/lib/campaignTypes'
import type { RawRow } from '@/lib/rawDataParser'
import { detectDmpType, calcCosts } from '@/lib/calculationService'

// ── 헬퍼 ────────────────────────────────────────────────────

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[\s_\-()（）\.··]/g, '')
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
    // Excel 시리얼 날짜 (1900년 기준)
    const epoch = new Date(Date.UTC(1899, 11, 30))
    const d = new Date(epoch.getTime() + raw * 86400000)
    return d.toISOString().slice(0, 10)
  }
  if (raw instanceof Date) {
    return raw.toISOString().slice(0, 10)
  }
  const s = String(raw).trim()

  // 범위 형식: "2026.02.10. ~ 2026.03.01." → 시작일 추출
  const rangeMatch = s.match(/^(\d{4}[.\-\/]\d{2}[.\-\/]\d{2})/)
  if (rangeMatch) {
    return rangeMatch[1].replace(/[.\/]/g, '-').slice(0, 10)
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  if (/^\d{4}\.\d{2}\.\d{2}/.test(s)) return s.slice(0, 10).replace(/\./g, '-')
  if (/^\d{4}\/\d{2}\/\d{2}/.test(s)) return s.slice(0, 10).replace(/\//g, '-')
  // YYYYMMDD compact
  if (/^\d{8}$/.test(s)) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`
  // MM/DD/YYYY
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

/**
 * 캠페인 설정 기반 마크업 팩터 계산 (기존 로직 유지)
 * 반환값: 0~1 (예: 마크업 25% → 0.75)
 */
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

  // RAW_APP 방식: 날짜 컬럼 후보 확장 (한국어/영어 모두 지원)
  const DATE_KEYS = media === 'naver'
    ? ['시작일', '날짜', 'date', '일자', '기준일', '일', '기간', '보고기간시작']
    : ['일', '날짜', 'date', '일자', '기준일', '시작일', '기간', '보고기간시작', 'day']

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
      // ── 날짜 ──────────────────────────────────────────────
      let rawDate: string
      if (media === 'naver') {
        rawDate = findStringValue(row,
          '시작일', '날짜', 'date', '일자', '기준일', '기간', '보고 기간 시작', '보고기간시작', '집행일'
        )
      } else {
        rawDate = findStringValue(row,
          '일', '날짜', 'date', '일자', '기준일', '기간', '보고 기간 시작', '보고기간시작', 'Day', '집행일'
        )
      }

      if (!rawDate) continue
      const dateStr = parseDate(rawDate)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue

      const dayOfWeek = getDayOfWeek(dateStr)

      // ── 광고그룹명 / 소재명 (RAW_APP 컬럼 alias 통합) ──────
      let creativeName: string
      let adGroupName: string  // 원본 광고그룹명 (DMP 감지용)

      if (media === 'google') {
        creativeName = findStringValue(row,
          '이미지 광고 이름', '이미지광고이름', '광고이름', '광고 이름', 'ad name', 'adname', '광고명', '광고소재이름',
          '소재명', '소재 이름', '소재이름'
        )
        adGroupName = findStringValue(row,
          '광고그룹', '광고 그룹', 'ad group', 'adgroup', '광고그룹명', '그룹이름', '광고 그룹 이름', '광고그룹이름',
          '캠페인'
        )
      } else if (media === 'meta') {
        creativeName = findStringValue(row,
          '광고 이름', '광고이름', 'ad name', 'adname', '광고명', '소재명'
        )
        adGroupName = findStringValue(row,
          '광고 세트 이름', '광고세트이름', '광고세트명', '광고 세트명',
          'ad set name', 'adsetname', 'adset name', '광고세트'
        )
      } else if (media === 'naver') {
        creativeName = findStringValue(row,
          '광고 소재 이름', '광고소재이름', '소재 이름', '소재이름', '소재명', '광고소재',
          '소재', '소재 명'
        )
        adGroupName = findStringValue(row,
          '광고 그룹 이름', '광고그룹이름', '광고그룹 이름', '광고그룹명', '광고 그룹명', '그룹명',
          '광고그룹', '광고 그룹'
        )
      } else {
        // kakao
        creativeName = findStringValue(row,
          '소재 이름', '소재이름', '소재명', 'creative name', 'ad name', 'adname', '소재', '광고소재'
        )
        adGroupName = findStringValue(row,
          '광고그룹 명', '광고그룹명', '광고그룹 이름', '광고그룹이름', '그룹명', 'ad group name', '그룹이름',
          '광고그룹', '광고 그룹'
        )
      }

      // ── 지표 (RAW_APP alias 통합) ──────────────────────────
      const impressions = findValue(row,
        '노출수', '노출', 'impressions', 'impr', '노출량', 'impr.', 'Impressions', 'Imps'
      )
      const clicks = media === 'meta'
        ? findValue(row, '링크 클릭', '링크클릭', '클릭수', '클릭', 'clicks', 'click', '링크 클릭수', '링크클릭수', 'Clicks')
        : findValue(row, '클릭수', '클릭', 'clicks', 'click', '링크 클릭수', '링크클릭수', 'Clicks')

      let views: number | null = null
      if (media === 'google') {
        views = findValue(row,
          'TrueView 조회수', 'trueview 조회수', 'trueview조회수', '조회수', 'views', 'video views',
          'trueview views', '동영상 조회수', '동영상조회수'
        )
      } else if (media === 'meta') {
        views = findValue(row, '결과', 'results', '결과수')
      }

      // ── 원본 비용 (supplyValue) ────────────────────────────
      let supplyValue: number
      if (media === 'naver') {
        supplyValue = findValue(row,
          '이 비용', '이비용', '총 비용', '총비용', 'total cost', '합계 비용', '합계비용', '비용', 'cost',
          '집행 금액(VAT 별도)', '집행금액(vat별도)', '공급가액', '집행금액', '소진금액'
        )
      } else if (media === 'meta') {
        supplyValue = findValue(row,
          '지출 금액 (KRW)', '지출금액(krw)', '지출금액 (krw)', '지출금액krw', '지출금액',
          '비용', 'cost', 'spend', '소진금액', '집행금액', '금액', '청구금액',
          '합계금액', 'amount spent', 'amountspent', '총비용'
        )
      } else {
        supplyValue = findValue(row,
          '비용', 'cost', 'spend', '소진금액', '집행금액', '금액', '청구금액',
          '합계금액', 'amount spent', 'amountspent', '총 비용', '총비용', '합계비용'
        )
      }

      if (impressions === 0 && clicks === 0 && supplyValue === 0) continue

      // ── DMP 자동 감지 (광고그룹명 기반, RAW_APP 로직) ────────
      const dmpType = detectDmpType(adGroupName)

      // ── 비용 계산 ─────────────────────────────────────────
      // grossCost: 기존 캠페인 마크업 역산 방식 (하위 호환)
      const markupFactor = getMarkupFactor(media, adGroupName, campaign)
      const grossCost = isNaver
        ? Math.round((supplyValue / 1.1) / markupFactor)
        : Math.round(supplyValue / markupFactor)

      // RAW_APP 방식: netAmount + executionAmount 분리 계산
      // 에이전시 수수료율 추출 (캠페인 설정 기반)
      let agencyFeeDecimal = 0
      if (campaign) {
        const mediaLabel2 = MEDIA_CONFIG[media].label
        const mediaBudget = campaign.mediaBudgets.find(mb => mb.media === mediaLabel2)
        if (mediaBudget) {
          const isDmpRow = dmpType !== 'DIRECT'
          agencyFeeDecimal = isDmpRow
            ? mediaBudget.dmp.agencyFeeRate / 100
            : mediaBudget.nonDmp.agencyFeeRate / 100
        }
      }

      const { netAmount, executionAmount } = calcCosts(supplyValue, isNaver, agencyFeeDecimal)

      result.push({
        date: dateStr,
        dayOfWeek,
        media: mediaLabel,
        creativeName,
        dmpName: adGroupName,
        dmpType,
        impressions: Math.round(impressions),
        clicks: Math.round(clicks),
        views: views !== null ? Math.round(views) : null,
        grossCost,
        netCost: isNaver ? Math.round(supplyValue / 1.1) : Math.round(supplyValue),
        executionAmount: Math.round(executionAmount),
        netAmount: Math.round(netAmount),
        supplyValue: Math.round(supplyValue),
      })
    }

    return NextResponse.json(result.sort((a, b) => a.date.localeCompare(b.date)))
  } catch (e) {
    console.error('[parse-raw] error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
