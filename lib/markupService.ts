/**
 * markupService.ts
 * raw rows에 캠페인별 수수료율(마크업)을 적용하여 계산된 rows를 반환
 *
 * 흐름: raw rows → campaign csvNames 매칭 → 수수료율 적용 → computed rows
 * raw rows는 변경되지 않음. computed rows는 캠페인 설정 변경 시 재계산 가능.
 */

import type { RawRow } from './rawDataParser'
import type { DmpType } from './rawDataParser'
import type { Campaign } from './campaignTypes'
import type { MediaType } from './reportTypes'
import { MEDIA_MARKUP_RATE } from './campaignTypes'
import { detectDmpType, calcCosts, DMP_FEE_RATES_DECIMAL } from './calculationService'

// MediaType → 캠페인 미디어 레이블 (MediaBudget.media)
const MEDIA_TYPE_TO_LABEL: Record<MediaType, string> = {
  google: 'Google',
  naver:  '네이버 GFA',
  kakao:  '카카오모먼트',
  meta:   'META',
}

// 미디어 레이블 → MediaType 역매핑
const LABEL_TO_MEDIA_TYPE: Record<string, MediaType> = {
  'Google':       'google',
  '네이버 GFA':   'naver',
  '카카오모먼트': 'kakao',
  'META':         'meta',
}

function buildCsvLookup(campaigns: Campaign[]): Map<string, Campaign> {
  const map = new Map<string, Campaign>()
  for (const c of campaigns) {
    for (const name of c.csvNames ?? []) {
      map.set(name.trim().toLowerCase(), c)
    }
  }
  return map
}

function getAgencyFeeDecimal(campaign: Campaign, mediaType: MediaType, isDmp: boolean): number {
  const label = MEDIA_TYPE_TO_LABEL[mediaType]
  const mb = campaign.mediaBudgets.find(m => m.media === label)
  if (!mb) return 0
  // 신규: totalFeeRate가 있으면 미디어 마크업과 DMP 수수료를 포함한 통합 수수료율 사용
  if (mb.totalFeeRate !== undefined) return mb.totalFeeRate / 100
  const targeting = isDmp ? mb.dmp : mb.nonDmp
  return targeting.agencyFeeRate / 100
}

function getMediaMarkupDecimal(mediaType: MediaType): number {
  const label = MEDIA_TYPE_TO_LABEL[mediaType]
  return (MEDIA_MARKUP_RATE[label] ?? 0) / 100
}

/**
 * raw rows에 캠페인 수수료율 적용 → computed rows 반환
 * rawRows의 supplyValue를 기준으로 계산.
 * matchedCampaignId가 없는 행은 markup 0 (raw 값 그대로 유지)
 */
export function applyMarkupToRows(rawRows: RawRow[], campaigns: Campaign[]): RawRow[] {
  const csvLookup = buildCsvLookup(campaigns)

  return rawRows.map(row => {
    const mediaType = LABEL_TO_MEDIA_TYPE[row.media]
    if (!mediaType) return row

    const matched = csvLookup.get(row.campaignName.trim().toLowerCase()) ?? null
    const dmpType: DmpType = detectDmpType(row.dmpName)
    const isDmpRow = dmpType !== 'DIRECT'

    const mb = matched ? matched.mediaBudgets.find(m => m.media === MEDIA_TYPE_TO_LABEL[mediaType]) : null

    // SubCampaign.csvCampaignNames 기반 세부 매칭 (우선순위 높음)
    let matchedSubCampaign: import('./campaignTypes').SubCampaign | null = null
    if (matched && mb) {
      for (const sc of mb.subCampaigns ?? []) {
        const scNames = (sc.csvCampaignNames ?? []).map(n => n.trim().toLowerCase())
        if (scNames.includes(row.campaignName.trim().toLowerCase())) {
          matchedSubCampaign = sc
          break
        }
      }
    }

    // 수수료율 우선순위: SubCampaign.totalFeeRate > MediaBudget.totalFeeRate > 개별 계산
    const effectiveFeeRate = matchedSubCampaign?.totalFeeRate ?? mb?.totalFeeRate
    const mediaMarkup    = effectiveFeeRate !== undefined ? 0 : getMediaMarkupDecimal(mediaType)
    const dmpFeeRate     = effectiveFeeRate !== undefined ? 0 : (isDmpRow ? DMP_FEE_RATES_DECIMAL[dmpType] ?? 0 : 0)
    const agencyFee      = effectiveFeeRate !== undefined
      ? effectiveFeeRate / 100
      : (matched ? getAgencyFeeDecimal(matched, mediaType, isDmpRow) : 0)
    const totalFeeDecimal = mediaMarkup + dmpFeeRate + agencyFee

    const isNaver = mediaType === 'naver'
    const { netAmount, executionAmount } = calcCosts(row.supplyValue, isNaver, totalFeeDecimal)

    return {
      ...row,
      netAmount,
      netCost:         netAmount,
      executionAmount,
      grossCost:       executionAmount,
      matchedCampaignId: matched?.id ?? row.matchedCampaignId,
    }
  })
}

/**
 * 특정 캠페인에 매칭되는 rows만 필터링 후 markup 적용
 */
export function computeCampaignRows(
  rawRows: RawRow[],
  campaigns: Campaign[],
  campaignId: string,
): RawRow[] {
  const allComputed = applyMarkupToRows(rawRows, campaigns)
  return allComputed.filter(r => r.matchedCampaignId === campaignId)
}

// ── 캠페인별 computed rows 로컬스토리지 영속 ────────────────────

const COMPUTED_KEY_PREFIX = 'ct-plus-computed-v1-'

export function saveComputedRows(campaignId: string, rows: RawRow[]): void {
  try {
    localStorage.setItem(COMPUTED_KEY_PREFIX + campaignId, JSON.stringify(rows))
  } catch {}
}

export function loadComputedRows(campaignId: string): RawRow[] {
  try {
    const s = localStorage.getItem(COMPUTED_KEY_PREFIX + campaignId)
    return s ? (JSON.parse(s) as RawRow[]) : []
  } catch { return [] }
}

export function clearComputedRows(campaignId: string): void {
  localStorage.removeItem(COMPUTED_KEY_PREFIX + campaignId)
}

/**
 * raw + campaigns -> computed rows -> localStorage
 */
export function recomputeAllCampaigns(rawRows: RawRow[], campaigns: Campaign[]): void {
  const allComputed = applyMarkupToRows(rawRows, campaigns)
  const byCampaign = new Map<string, RawRow[]>()
  for (const row of allComputed) {
    if (row.matchedCampaignId) {
      const arr = byCampaign.get(row.matchedCampaignId) ?? []
      arr.push(row)
      byCampaign.set(row.matchedCampaignId, arr)
    }
  }
  for (const [cid, rows] of byCampaign.entries()) {
    saveComputedRows(cid, rows)
  }
}
