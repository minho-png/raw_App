'use client'

/**
 * useReportCampaignSync
 *
 * 저장된 CT+ 데일리 리포트에서 매체별 소진금액을 집계하여
 * 캠페인의 mediaBudgets[].dmp.spend / nonDmp.spend를 자동 업데이트합니다.
 *
 * 연결 로직:
 *  1. SavedReport.detectedAdvertiserHints ↔ Advertiser.name 퍼지 매칭
 *  2. 날짜 범위 내 리포트만 집계 (Campaign.startDate ~ Campaign.endDate)
 *  3. DMP 타입에 따라 dmp.spend / nonDmp.spend 분리 집계
 */

import { useCallback } from 'react'
import type { Campaign } from '@/lib/campaignTypes'
import type { SavedReport } from '@/lib/hooks/useReports'
import type { MediaType } from '@/lib/reportTypes'
import type { RawRow } from '@/lib/rawDataParser'
import { MEDIA_CONFIG } from '@/lib/reportTypes'

// campaignTypes.ts의 MediaName → MediaType 매핑
const MEDIA_NAME_TO_TYPE: Record<string, MediaType> = {
  '네이버 GFA':   'naver',
  '카카오모먼트': 'kakao',
  'Google':       'google',
  'META':         'meta',
}

export interface SpendSyncResult {
  /** 매체명 → { dmpSpend, nonDmpSpend } */
  byMedia: Record<string, { dmpSpend: number; nonDmpSpend: number; totalRows: number }>
  totalSpend: number
  matchedReportIds: string[]
  dateRange: { from: string; to: string } | null
}

/**
 * 광고주 힌트와 캠페인 광고주명의 퍼지 매칭
 * 포함(contains) 관계면 일치로 판단
 */
function hintMatchesCampaign(hints: string[], advertiserName: string): boolean {
  if (!hints || hints.length === 0) return false
  const nameLower = advertiserName.toLowerCase()
  return hints.some(h => {
    const hl = h.toLowerCase()
    return nameLower.includes(hl) || hl.includes(nameLower)
  })
}

/**
 * 날짜가 캠페인 기간 내에 있는지 확인
 */
function isDateInRange(dateStr: string, startDate: string, endDate: string): boolean {
  return dateStr >= startDate && dateStr <= endDate
}

/**
 * DmpType이 DMP 활용인지 여부
 */
function isDmpRow(row: RawRow): boolean {
  return row.dmpType !== 'DIRECT' && row.dmpType !== 'MEDIA_TARGETING'
}

export function useReportCampaignSync() {
  /**
   * 저장된 리포트 목록에서 캠페인과 연결 가능한 리포트를 찾아 소진을 집계
   * @param campaign 소진을 동기화할 캠페인
   * @param reports 전체 저장 리포트 목록
   * @param advertiserName 캠페인의 광고주명 (Advertiser.name)
   * @param expandedRowsByMedia 청크 리포트의 펼쳐진 데이터 (optional)
   */
  const calcSpendFromReports = useCallback((
    campaign: Campaign,
    reports: SavedReport[],
    advertiserName: string,
    expandedRowsByMedia?: Map<string, Partial<Record<MediaType, RawRow[]>>>,
  ): SpendSyncResult => {
    const byMedia: Record<string, { dmpSpend: number; nonDmpSpend: number; totalRows: number }> = {}
    let totalSpend = 0
    const matchedIds: string[] = []
    let minDate: string | null = null
    let maxDate: string | null = null

    for (const report of reports) {
      // 광고주 힌트 매칭 (힌트가 없으면 제외하지 않음 — 날짜로만 필터)
      const hasHints = (report.detectedAdvertiserHints?.length ?? 0) > 0
      if (hasHints && !hintMatchesCampaign(
        report.detectedAdvertiserHints!,
        advertiserName,
      )) continue

      // 리포트 행 데이터 획득
      const rowsByMedia = report.chunked
        ? (expandedRowsByMedia?.get(report.id) ?? {})
        : report.rowsByMedia

      let reportMatched = false

      for (const [mediaKey, rows] of Object.entries(rowsByMedia) as [MediaType, RawRow[]][]) {
        if (!rows || rows.length === 0) continue

        // 매체가 캠페인 mediaBudgets에 포함되는지 확인
        const mediaName = MEDIA_CONFIG[mediaKey]?.label
        if (!mediaName) continue
        const campaignMedia = campaign.mediaBudgets.find(
          mb => MEDIA_NAME_TO_TYPE[mb.media] === mediaKey || mb.media === mediaName
        )
        if (!campaignMedia) continue

        // 날짜 범위 필터
        const filteredRows = rows.filter(r =>
          isDateInRange(r.date, campaign.startDate, campaign.endDate)
        )
        if (filteredRows.length === 0) continue

        reportMatched = true

        if (!byMedia[campaignMedia.media]) {
          byMedia[campaignMedia.media] = { dmpSpend: 0, nonDmpSpend: 0, totalRows: 0 }
        }
        const bucket = byMedia[campaignMedia.media]

        for (const row of filteredRows) {
          const spend = row.netAmount ?? row.netCost ?? 0
          if (isDmpRow(row)) {
            bucket.dmpSpend += spend
          } else {
            bucket.nonDmpSpend += spend
          }
          bucket.totalRows += 1
          totalSpend += spend

          if (!minDate || row.date < minDate) minDate = row.date
          if (!maxDate || row.date > maxDate) maxDate = row.date
        }
      }

      if (reportMatched) matchedIds.push(report.id)
    }

    return {
      byMedia,
      totalSpend,
      matchedReportIds: matchedIds,
      dateRange: minDate && maxDate ? { from: minDate, to: maxDate } : null,
    }
  }, [])

  /**
   * SpendSyncResult를 Campaign.mediaBudgets에 적용하여 새 Campaign 반환
   */
  const applySyncResult = useCallback((
    campaign: Campaign,
    result: SpendSyncResult,
  ): Campaign => {
    const updatedMediaBudgets = campaign.mediaBudgets.map(mb => {
      const bucket = result.byMedia[mb.media]
      if (!bucket) return mb
      return {
        ...mb,
        dmp:    { ...mb.dmp,    spend: Math.round(bucket.dmpSpend) },
        nonDmp: { ...mb.nonDmp, spend: Math.round(bucket.nonDmpSpend) },
      }
    })
    return { ...campaign, mediaBudgets: updatedMediaBudgets }
  }, [])

  return { calcSpendFromReports, applySyncResult }
}

// ── 유틸: 두 문자열이 일치하는지 퍼지 체크 (export for testing) ──
export { hintMatchesCampaign }
