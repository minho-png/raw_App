/**
 * unifiedCsvParser.ts
 * 통합 CSV 형식 파서 (모티브 광고성과 포맷)
 * 컬럼: 수집일,일자,매체,계정명,계정ID,캠페인명,캠페인ID,광고그룹명,광고그룹ID,게재위치,소재명,소재ID,노출,클릭,총재생,비용
 *
 * v2: 다중 캠페인 지원 — 각 행의 campaignName을 csvNames로 역매칭하여
 *     해당 캠페인의 마크업(미디어+DMP+대행사)을 적용하고 matchedCampaignId를 태깅
 */

import type { MediaType } from './reportTypes'
import type { RawRow, DmpType } from './rawDataParser'
import type { Campaign } from './campaignTypes'
import { detectDmpType } from './calculationService'
import { calcCosts } from './calculationService'
import { extractAdvertiserHint } from './advertiserMatcher'

// CSV 매체 코드 → MediaType 매핑
const CSV_MEDIA_CODE_MAP: Record<string, MediaType> = {
  'google-ads':    'google',
  'kakao-moment':  'kakao',
  'naver-gfa':     'naver',
  'meta-ads':      'meta',
}

// MediaType → 캠페인 미디어 레이블 매핑 (MediaBudget.media 와 일치)
const MEDIA_TYPE_TO_LABEL: Record<MediaType, string> = {
  google: 'Google',
  naver:  '네이버 GFA',
  kakao:  '카카오모먼트',
  meta:   'META',
}

const DAY_OF_WEEK = ['일', '월', '화', '수', '목', '금', '토']

function getDayOfWeek(dateStr: string): string {
  const d = new Date(dateStr)
  return isNaN(d.getTime()) ? '' : DAY_OF_WEEK[d.getDay()]
}

/** csvNames 기반 역매칭 맵 구성: CSV캠페인명(소문자) → Campaign */
function buildCsvLookup(campaigns: Campaign[]): Map<string, Campaign> {
  const map = new Map<string, Campaign>()
  for (const c of campaigns) {
    for (const name of c.csvNames ?? []) {
      map.set(name.trim().toLowerCase(), c)
    }
  }
  return map
}

/** CSV 캠페인명으로 매칭 캠페인 조회 (csvNames 완전 일치 우선) */
function lookupCampaign(
  csvCampaignName: string,
  csvLookup: Map<string, Campaign>,
): Campaign | null {
  if (!csvCampaignName) return null
  return csvLookup.get(csvCampaignName.trim().toLowerCase()) ?? null
}

/**
 * 캠페인별 매칭 요약
 */
export interface CampaignMatchEntry {
  campaignId: string
  campaignName: string
  csvNames: string[]       // 매칭에 사용된 csvName들
  rowCount: number
  totalCost: number        // 해당 캠페인 소진 합계 (netAmount 기준)
}

/**
 * 통합 CSV 파싱 결과
 */
export interface ParseUnifiedCsvResult {
  rowsByMedia: Partial<Record<MediaType, RawRow[]>>
  skippedMediaCodes: string[]  // 알 수 없는 매체 코드 목록
  totalRows: number
  skippedRows: number          // 노출+클릭+비용 모두 0인 행
  /** 계정명에서 추출된 광고주 힌트 목록 (Google 제외, 중복 제거) */
  detectedAdvertiserHints: string[]
  /** 캠페인별 매칭 요약 */
  campaignMatchSummary: CampaignMatchEntry[]
  /** 매칭된 캠페인이 없는 CSV 캠페인명 목록 */
  unmatchedCsvNames: string[]
}

/**
 * 통합 CSV 텍스트를 파싱하여 매체별 RawRow 배열로 반환
 *
 * @param csvText   CSV 원문
 * @param campaigns 등록된 캠페인 배열 (각 캠페인의 csvNames로 역매칭)
 *                  하위 호환: Campaign | null 도 수용 (단일 캠페인 모드)
 */
export function parseUnifiedCsv(
  csvText: string,
  campaigns: Campaign[] | Campaign | null,
): ParseUnifiedCsvResult {
  // 하위 호환: 단일 캠페인 or null → 배열로 변환
  const campaignList: Campaign[] = campaigns === null
    ? []
    : Array.isArray(campaigns) ? campaigns : [campaigns]

  // csvNames 역매칭 맵
  const csvLookup = buildCsvLookup(campaignList)

  // BOM(﻿) 제거 — UTF-8 with BOM 파일 지원
  const cleanText = csvText.replace(/^\uFEFF/, '')
  const lines = cleanText.split(/\r?\n/)
  if (lines.length < 2) {
    return {
      rowsByMedia: {}, skippedMediaCodes: [], totalRows: 0, skippedRows: 0,
      detectedAdvertiserHints: [], campaignMatchSummary: [], unmatchedCsvNames: [],
    }
  }

  // 헤더 파싱 (따옴표 제거)
  const headers = parseCsvLine(lines[0]).map(h => h.trim())
  const colIndex: Record<string, number> = {}
  headers.forEach((h, i) => { colIndex[h] = i })

  const idx = {
    date:        headers.indexOf('일자'),
    media:       headers.indexOf('매체'),
    adGroup:     headers.indexOf('광고그룹명'),
    creative:    headers.indexOf('소재명'),
    impressions: headers.indexOf('노출'),
    clicks:      headers.indexOf('클릭'),
    views:       headers.indexOf('총재생'),
    cost:        headers.indexOf('비용'),
  }

  const rowsByMedia: Partial<Record<MediaType, RawRow[]>> = {}
  const unknownMediaCodes = new Set<string>()
  // 캠페인별 집계
  const campaignStats = new Map<string, CampaignMatchEntry>()
  const unmatchedCsvNameSet = new Set<string>()

  let totalRows = 0
  let skippedRows = 0

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const cols = parseCsvLine(line)
    totalRows++

    const dateStr    = idx.date >= 0        ? cols[idx.date]        ?? '' : ''
    const mediaCode  = idx.media >= 0       ? cols[idx.media]       ?? '' : ''
    const adGroup    = idx.adGroup >= 0     ? cols[idx.adGroup]     ?? '' : ''
    const creative   = idx.creative >= 0    ? cols[idx.creative]    ?? '' : ''
    const impStr     = idx.impressions >= 0 ? cols[idx.impressions] ?? '' : ''
    const clkStr     = idx.clicks >= 0      ? cols[idx.clicks]      ?? '' : ''
    const viewStr    = idx.views >= 0       ? cols[idx.views]       ?? '' : ''
    const costStr    = idx.cost >= 0        ? cols[idx.cost]        ?? '' : ''
    const campaignName = String(cols[colIndex['캠페인명']] ?? '').trim()
    const accountName  = String(cols[colIndex['계정명']]  ?? '').trim()

    const mediaType = CSV_MEDIA_CODE_MAP[mediaCode]
    if (!mediaType) {
      unknownMediaCodes.add(mediaCode)
      skippedRows++
      continue
    }

    const impressions = parseNum(impStr)
    const clicks      = parseNum(clkStr)
    const supplyRaw   = parseFloat(costStr) || 0
    const supplyValue = Math.round(supplyRaw)

    // 노출·클릭·비용 모두 0이면 건너뜀
    if (impressions === 0 && clicks === 0 && supplyValue === 0) {
      skippedRows++
      continue
    }

    // 캠페인 역매칭
    const matchedCampaign = lookupCampaign(campaignName, csvLookup)

    const dmpType: DmpType = detectDmpType(adGroup)

    // markup은 파싱 단계에서 적용하지 않음 — markupService.applyMarkupToRows()에서 처리
    const totalFeeDecimal = 0

    // VAT 처리: 네이버 GFA만 VAT 포함 금액 → 공급가 = 비용 ÷ 1.1
    const isNaver = mediaType === 'naver'
    const { netAmount, executionAmount } = calcCosts(supplyValue, isNaver, totalFeeDecimal)

    // views: 구글/메타는 숫자, 그 외 null
    const viewsRaw = viewStr.trim()
    let views: number | null = null
    if ((mediaType === 'google' || mediaType === 'meta') && viewsRaw !== '') {
      const v = parseNum(viewsRaw)
      if (!isNaN(v)) views = v
    }

    const row: RawRow = {
      date:            dateStr,
      dayOfWeek:       getDayOfWeek(dateStr),
      media:           MEDIA_TYPE_TO_LABEL[mediaType],
      campaignName,
      accountName,
      creativeName:    creative,
      dmpName:         adGroup,
      dmpType,
      impressions,
      clicks,
      views,
      grossCost:       executionAmount,
      netCost:         netAmount,
      executionAmount,
      netAmount,
      supplyValue,
      advertiserHint:  extractAdvertiserHint(accountName, mediaType),
      matchedCampaignId: matchedCampaign?.id,
    }

    if (!rowsByMedia[mediaType]) rowsByMedia[mediaType] = []
    rowsByMedia[mediaType]!.push(row)

    // 캠페인 집계
    if (matchedCampaign) {
      if (!campaignStats.has(matchedCampaign.id)) {
        campaignStats.set(matchedCampaign.id, {
          campaignId:   matchedCampaign.id,
          campaignName: matchedCampaign.campaignName,
          csvNames:     [],
          rowCount:     0,
          totalCost:    0,
        })
      }
      const entry = campaignStats.get(matchedCampaign.id)!
      entry.rowCount++
      entry.totalCost += netAmount
      if (campaignName && !entry.csvNames.includes(campaignName)) {
        entry.csvNames.push(campaignName)
      }
    } else if (campaignName) {
      unmatchedCsvNameSet.add(campaignName)
    }
  }

  // 감지된 광고주 힌트 수집 (중복 제거)
  const hintSet = new Set<string>()
  for (const rows of Object.values(rowsByMedia)) {
    for (const row of rows ?? []) {
      if (row.advertiserHint) hintSet.add(row.advertiserHint)
    }
  }

  return {
    rowsByMedia,
    skippedMediaCodes: [...unknownMediaCodes],
    totalRows,
    skippedRows,
    detectedAdvertiserHints: [...hintSet].sort(),
    campaignMatchSummary:    [...campaignStats.values()],
    unmatchedCsvNames:       [...unmatchedCsvNameSet].sort(),
  }
}

// ── 헬퍼 ────────────────────────────────────────────────────────

function parseNum(s: string): number {
  const v = parseFloat(s.replace(/,/g, ''))
  return isNaN(v) ? 0 : Math.round(v)
}

/** RFC 4180 CSV 라인 파서 (따옴표 처리 포함) */
function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let cur = ''
  let inQuote = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ }
        else inQuote = false
      } else {
        cur += ch
      }
    } else {
      if (ch === '"') {
        inQuote = true
      } else if (ch === ',') {
        result.push(cur)
        cur = ''
      } else {
        cur += ch
      }
    }
  }
  result.push(cur)
  return result
}
