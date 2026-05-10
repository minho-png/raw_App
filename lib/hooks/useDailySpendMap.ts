"use client"
import { useMemo } from "react"
import type { RawRow } from "@/lib/rawDataParser"
import type { Campaign } from "@/lib/campaignTypes"

export interface DailySpendEntry {
  today: number
  yesterday: number
  delta: number
  deltaRate: number   // %
  todayDate: string | null
  yesterdayDate: string | null
}

const ZERO_ENTRY: DailySpendEntry = {
  today: 0, yesterday: 0, delta: 0, deltaRate: 0,
  todayDate: null, yesterdayDate: null,
}

/**
 * 캠페인별 "당일/전일 소진액 + 증감률" 맵.
 *
 * 데이터 출처:
 *   - rawRows: useRawData() (CSV 업로드)
 *   - join key: RawRow.matchedCampaignId (정확 매칭) → campaign.id
 *
 * 날짜 결정:
 *   - rawRows 의 모든 date 중 최신 = today
 *   - 그 직전 날짜 = yesterday  (영업일 단위. 주말 데이터 미입력이면 비교 day 1일 더 옛날)
 *
 * deltaRate 계산:
 *   - yesterday > 0 → (today - yesterday) / yesterday × 100
 *   - yesterday = 0, today > 0 → +100% (신규 집행)
 *   - 둘 다 0 → 0%
 */
export function useDailySpendMap(
  rawRows: RawRow[],
  campaigns: Campaign[],
): Map<string, DailySpendEntry> {
  return useMemo(() => {
    if (rawRows.length === 0 || campaigns.length === 0) {
      return new Map()
    }

    // 1. 전체 날짜 정렬 (오름차순)
    const dates = [...new Set(rawRows.map(r => r.date).filter(Boolean))].sort()
    const todayDate = dates[dates.length - 1] ?? null
    const yesterdayDate = dates[dates.length - 2] ?? null

    if (!todayDate) return new Map()

    // 2. campaign.id → { today, yesterday } 누적
    const acc = new Map<string, { today: number; yesterday: number }>()
    for (const c of campaigns) {
      acc.set(c.id, { today: 0, yesterday: 0 })
    }

    for (const row of rawRows) {
      if (!row.matchedCampaignId) continue
      const bucket = acc.get(row.matchedCampaignId)
      if (!bucket) continue  // raw 가 가리키는 캠페인이 현재 목록에 없음
      const spend = row.netAmount ?? row.netCost ?? 0
      if (row.date === todayDate)         bucket.today     += spend
      else if (row.date === yesterdayDate) bucket.yesterday += spend
    }

    // 3. delta 계산
    const out = new Map<string, DailySpendEntry>()
    for (const [campaignId, { today, yesterday }] of acc) {
      const delta = today - yesterday
      const deltaRate = yesterday > 0
        ? (delta / yesterday) * 100
        : today > 0 ? 100 : 0
      out.set(campaignId, {
        today, yesterday, delta, deltaRate,
        todayDate, yesterdayDate,
      })
    }
    return out
  }, [rawRows, campaigns])
}

export { ZERO_ENTRY as DAILY_SPEND_ZERO }
