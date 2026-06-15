/**
 * `/api/motiv/stats/daily` — Open API DAILY insights 로 교체.
 *
 * Open API DAILY 는 기간 최대 90일 (proxy 검증). 호출자가 90일 초과로 보내면
 * Open API 가 422 반환 → 그대로 클라이언트에 전파.
 */

import { NextRequest, NextResponse } from 'next/server'
import { fetchDailyInsights } from '@/lib/openApi/insightsService'
import { OpenApiError } from '@/lib/openApi/client'
import { dailyRowToStatsRecord, metricsToStatsRecord } from '@/lib/openApi/legacyAdapter'
import type { StatsBreakdownResponse } from '@/lib/motivApi/statsService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SCOPE_KEYS = ['campaign_id', 'adaccount_id', 'agency_id', 'publisher_id'] as const

function defaultDateTo(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
function defaultDateFrom(): string {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000)
  d.setUTCDate(d.getUTCDate() - 89)
  return d.toISOString().slice(0, 10)
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams

  const hasScope = SCOPE_KEYS.some(k => sp.get(k))
  if (!hasScope) {
    return NextResponse.json(
      {
        error: 'scope_required',
        hint: '캠페인·광고계정·대행사·매체 중 하나의 ID 가 필요합니다',
        allowed: SCOPE_KEYS,
      },
      { status: 400 },
    )
  }

  try {
    const dateFrom = sp.get('start_date') || defaultDateFrom()
    const dateTo = sp.get('end_date') || defaultDateTo()

    const data = await fetchDailyInsights({
      dateFrom,
      dateTo,
      campaignIds: sp.get('campaign_id') || undefined,
      adGroupIds: sp.get('adgroup_id') || undefined,
      adIds: sp.get('ad_id') || undefined,
      accountId: sp.get('adaccount_id') || undefined,
      agencyId: sp.get('agency_id') || undefined,
    })

    const rows = (data.data ?? []).map(dailyRowToStatsRecord)
    const response: StatsBreakdownResponse = {
      data: rows,
      links: { prev: null, next: null },
      meta: {
        current_page: 1,
        from: rows.length === 0 ? undefined : 1,
        to: rows.length,
        total: rows.length,
        last_page: 1,
        per_page: rows.length,
      },
      totals: metricsToStatsRecord(data.summary?.metrics),
      exchange_rate: 1,
    }
    return NextResponse.json(response)
  } catch (err) {
    if (err instanceof OpenApiError) {
      console.error('[motiv/stats/daily→openApi]', { code: err.code, status: err.status })
      return NextResponse.json(
        { error: `Open API ${err.code}: ${err.message}` },
        { status: err.status },
      )
    }
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
