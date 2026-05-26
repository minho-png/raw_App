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

// 사용자 QA v4 NEW-BUG-01 (PM v2 + R1 검토) — getAgencyFeeDecimal dead 함수 제거.
// 본 함수는 totalFeeRate 미설정 시 항상 0 을 반환 (Option A 적용 완료) — applyMarkupToRows
// 의 fallback chain 도 0 으로 통일됐으므로 별도 함수 호출 자체가 불필요. 인라인화.

function getMediaMarkupDecimal(mediaType: MediaType): number {
  const label = MEDIA_TYPE_TO_LABEL[mediaType]
  return (MEDIA_MARKUP_RATE[label] ?? 0) / 100
}

/**
 * raw rows에 캠페인 수수료율 적용 → computed rows 반환.
 * rawRows의 supplyValue를 기준으로 계산.
 * matchedCampaignId가 없는 행은 markup 0 (raw 값 그대로 유지)
 *
 * ⚠ 사용자 핵심 원칙 (D4 검증) — **campaigns / rawRows 원본 객체 mutation 금지**.
 * 본 함수는 새 RawRow[] 를 반환하며, 인자 객체를 절대 수정하지 않는다.
 * CSV 파일 입력 시 사용자가 이미 입력한 campaign 데이터(actualSettingCost,
 * sub-camp budget/totalFeeRate, dashboardNetAmount 등) 가 변경되면 안 됨.
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

    // 수수료율 우선순위: SubCampaign.totalFeeRate > MediaBudget.totalFeeRate > 개별 계산.
    // NEW-BUG-01 — totalFeeRate 미설정 시 agencyFee fallback 도 0 으로 통일 (getAgencyFeeDecimal 인라인).
    const effectiveFeeRate = matchedSubCampaign?.totalFeeRate ?? mb?.totalFeeRate
    const mediaMarkup    = effectiveFeeRate !== undefined ? 0 : getMediaMarkupDecimal(mediaType)
    const dmpFeeRate     = effectiveFeeRate !== undefined ? 0 : (isDmpRow ? DMP_FEE_RATES_DECIMAL[dmpType] ?? 0 : 0)
    const agencyFee      = effectiveFeeRate !== undefined ? effectiveFeeRate / 100 : 0
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
      // V4-INFO-03 — 합계 카드의 sum-then-round 정밀합 산출용 fee 동봉.
      appliedFeeDecimal: totalFeeDecimal,
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

// ── 사용자 QA v4 V4-WARN-01 (PM v2 + R1 검토) — dead cache 함수 4개 제거 ──
// 이전: saveComputedRows / loadComputedRows / clearComputedRows / recomputeAllCampaigns
//        + COMPUTED_KEY_PREFIX. grep 결과 외부 호출 0건 확인 — 모두 미사용 dead code.
// 1회성 cleanup: localStorage 의 'ct-plus-computed-v1-*' 잔존 키 일괄 제거 (idempotent).
export function cleanupOrphanComputedCache(): number {
  if (typeof window === 'undefined') return 0
  let removed = 0
  try {
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('ct-plus-computed-v1-')) toRemove.push(key)
    }
    for (const k of toRemove) { localStorage.removeItem(k); removed += 1 }
  } catch {}
  return removed
}
