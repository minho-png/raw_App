/**
 * `/api/motiv/stats/campaign` — Open API CAMPAIGN insights 로 교체.
 *
 * 기존 Motiv §10 의 dictionary<string,string> 응답 shape 을 보존 (statsService.toNum
 * 가 그대로 동작). rowsToDailyPoints 가 보는 key (cost/revenue/profit/agency_fee/
 * data_fee) 는 어댑터가 0 으로 채움 (Open API 미제공 필드).
 */

import { NextRequest, NextResponse } from 'next/server'
import { fetchAllCampaignInsights, fetchCampaignInsights } from '@/lib/openApi/insightsService'
import { OpenApiError } from '@/lib/openApi/client'
import {
  campaignRowToStatsRecord,
  metricsToStatsRecord,
} from '@/lib/openApi/legacyAdapter'
import type { StatsBreakdownResponse } from '@/lib/motivApi/statsService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SCOPE_KEYS = ['campaign_id', 'adaccount_id', 'agency_id', 'publisher_id'] as const

function defaultDateTo(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
function defaultDateFrom(): string {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000)
  d.setUTCMonth(d.getUTCMonth() - 3)
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
    const campaignIds = sp.get('campaign_id') || undefined
    const accountId = sp.get('adaccount_id') || undefined
    const agencyId = sp.get('agency_id') || undefined
    const page = Number(sp.get('page'))
    const perPage = Number(sp.get('per_page'))

    const baseQuery = {
      dateFrom,
      dateTo,
      campaignIds,
      accountId,
      agencyId,
      page: Number.isFinite(page) && page > 0 ? Math.floor(page) : undefined,
      limit: Number.isFinite(perPage) && perPage > 0 ? Math.min(1000, Math.floor(perPage)) : undefined,
    }

    const hasPerPage = Number.isFinite(perPage) && perPage > 0
    const { page: _omitPage, ...allQuery } = baseQuery
    void _omitPage
    const data = hasPerPage
      ? await fetchCampaignInsights(baseQuery)
      : await fetchAllCampaignInsights(allQuery)

    const rows = (data.data ?? []).map(campaignRowToStatsRecord)
    const response: StatsBreakdownResponse = {
      data: rows,
      links: { prev: null, next: null },
      meta: {
        current_page: data.paging.page,
        from: rows.length === 0 ? undefined : (data.paging.page - 1) * (data.paging.limit || rows.length) + 1,
        to: rows.length === 0 ? undefined : (data.paging.page - 1) * (data.paging.limit || rows.length) + rows.length,
        total: data.paging.totalCount,
        last_page: data.paging.totalPages,
        per_page: data.paging.limit,
      },
      totals: metricsToStatsRecord(data.summary?.metrics),
      exchange_rate: 1,
    }
    return NextResponse.json(response)
  } catch (err) {
    if (err instanceof OpenApiError) {
      console.error('[motiv/stats/campaign→openApi]', { code: err.code, status: err.status })
      return NextResponse.json(
        { error: { code: err.code, message: err.message, details: err.details } },
        { status: err.status },
      )
    }
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: { code: 'INTERNAL', message } }, { status: 500 })
  }
}
