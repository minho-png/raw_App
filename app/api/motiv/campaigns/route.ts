/**
 * `/api/motiv/campaigns` — 호출자 표면은 유지하고 데이터 출처를 Open API 로 교체.
 *
 * 사용자 결정 (2026-06-15): 모든 데이터 API 를 Open API 로 일원화.
 * 기존 Motiv 호출자(motiv-campaigns 페이지, useMotivSettlement*, zeroSpend, cron)는
 * 페이지/hook 코드 변경 없이 어댑터를 통해 동일한 응답 shape 을 받음.
 */

import { NextRequest, NextResponse } from 'next/server'
import { fetchAllCampaignInsights, fetchCampaignInsights } from '@/lib/openApi/insightsService'
import { OpenApiError } from '@/lib/openApi/client'
import {
  campaignInsightToMotivCampaign,
  metricsToMotivStats,
  motivStatusToOpen,
  pagingToMotivMeta,
} from '@/lib/openApi/legacyAdapter'
import type {
  MotivCampaignListResponse,
  MotivCampaignType,
  MotivStatus,
} from '@/lib/motivApi/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_TYPES: MotivCampaignType[] = ['DISPLAY', 'VIDEO', 'TV', 'PARTNERS']
const ALLOWED_STATUS: MotivStatus[] = ['Y', 'N']

// Open API insights 는 dateFrom/dateTo 필수. Motiv 호출자는 자주 생략 — default 매핑.
// CAMPAIGN level 은 일자 제약이 없어 wide 범위(2년) 로 lifetime 누적에 근사.
function defaultDateTo(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
function defaultDateFrom(): string {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000)
  d.setUTCFullYear(d.getUTCFullYear() - 2)
  return d.toISOString().slice(0, 10)
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  try {
    const status = sp.get('status')
    const type = sp.get('campaign_type')
    const q = sp.get('q')
    const page = Number(sp.get('page'))
    const perPage = Number(sp.get('per_page'))
    const startDate = sp.get('start_date')
    const endDate = sp.get('end_date')

    const baseQuery = {
      dateFrom: startDate || defaultDateFrom(),
      dateTo: endDate || defaultDateTo(),
      campaignType: type && (ALLOWED_TYPES as string[]).includes(type) ? type : undefined,
      status: status && (ALLOWED_STATUS as string[]).includes(status)
        ? motivStatusToOpen(status as MotivStatus)
        : undefined,
      q: q ? q.slice(0, 100) : undefined,
      page: Number.isFinite(page) && page > 0 ? Math.floor(page) : undefined,
      limit: Number.isFinite(perPage) && perPage > 0 ? Math.min(1000, Math.floor(perPage)) : undefined,
    }

    // per_page 명시 시 단일 페이지 (페이지네이션 호출자), 미명시 시 전체 순회 (cron/zeroSpend 등).
    const hasPerPage = Number.isFinite(perPage) && perPage > 0
    const { page: _omitPage, ...allQuery } = baseQuery
    void _omitPage
    const data = hasPerPage
      ? await fetchCampaignInsights(baseQuery)
      : await fetchAllCampaignInsights(allQuery)

    const motivCampaigns = (data.data ?? []).map(campaignInsightToMotivCampaign)
    const totals = metricsToMotivStats(data.summary?.metrics)
    const meta = pagingToMotivMeta(data.paging, hasPerPage ? perPage : motivCampaigns.length)

    const response: MotivCampaignListResponse = {
      data: motivCampaigns,
      links: { first: null, last: null, prev: null, next: null },
      meta,
      totals,
      exchange_rate: 1,
    }
    return NextResponse.json(response)
  } catch (err) {
    if (err instanceof OpenApiError) {
      console.error('[motiv/campaigns→openApi]', { code: err.code, status: err.status })
      return NextResponse.json(
        { error: `Open API ${err.code}: ${err.message}` },
        { status: err.status },
      )
    }
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
