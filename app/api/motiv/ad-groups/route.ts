/**
 * `/api/motiv/ad-groups` — 데이터 출처를 Open API 로 교체.
 *
 * Open API ADGROUP level 은 campaignIds 가 *필수*. Motiv 호출자가 campaign_id 를
 * 안 주면, CAMPAIGN level 로 활성 캠페인을 먼저 조회 후 campaignIds 모아 호출 (2-step).
 */

import { NextRequest, NextResponse } from 'next/server'
import { fetchAdGroupInsights, fetchAllCampaignInsights } from '@/lib/openApi/insightsService'
import { OpenApiError } from '@/lib/openApi/client'
import {
  adGroupInsightToMotivAdGroup,
  metricsToMotivStats,
  motivStatusToOpen,
  pagingToMotivMeta,
} from '@/lib/openApi/legacyAdapter'
import type {
  MotivAdGroupListResponse,
  MotivStatus,
} from '@/lib/motivApi/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60  // Open API insights 집계가 길어질 수 있어 함수 타임아웃 상향 (기본 10~15s)

const ALLOWED_STATUS: MotivStatus[] = ['Y', 'N']

function defaultDateTo(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
function defaultDateFrom(): string {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000)
  d.setUTCFullYear(d.getUTCFullYear() - 2)
  return d.toISOString().slice(0, 10)
}

async function resolveCampaignIds(
  dateFrom: string,
  dateTo: string,
  statusOpen: 'ACTIVE' | 'PAUSED' | undefined,
): Promise<string> {
  const all = await fetchAllCampaignInsights({
    dateFrom,
    dateTo,
    status: statusOpen,
    limit: 1000,
  })
  return all.data.map(r => r.dimensions.campaignId).filter(Boolean).join(',')
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  try {
    const status = sp.get('status')
    const q = sp.get('q')
    const campaignId = sp.get('campaign_id')
    const accountId = sp.get('adaccount_id')
    const page = Number(sp.get('page'))
    const perPage = Number(sp.get('per_page'))
    const startDate = sp.get('start_date')
    const endDate = sp.get('end_date')

    const dateFrom = startDate || defaultDateFrom()
    const dateTo = endDate || defaultDateTo()
    const statusOpen = status && (ALLOWED_STATUS as string[]).includes(status)
      ? motivStatusToOpen(status as MotivStatus)
      : undefined

    // campaignIds 필수 — 호출자가 안 보냈으면 CAMPAIGN level 로 활성 캠페인 ID 수집.
    const campaignIds = campaignId
      ? String(campaignId)
      : await resolveCampaignIds(dateFrom, dateTo, statusOpen)

    if (!campaignIds) {
      // 활성 캠페인 0건 — 빈 목록 정상 응답.
      const empty: MotivAdGroupListResponse = {
        data: [],
        links: { first: null, last: null, prev: null, next: null },
        meta: { current_page: 1, from: null, last_page: 1, per_page: perPage || 0, to: null, total: 0, path: '' },
        totals: metricsToMotivStats(undefined),
        exchange_rate: 1,
      }
      return NextResponse.json(empty)
    }

    const data = await fetchAdGroupInsights({
      dateFrom,
      dateTo,
      campaignIds,
      accountId: accountId || undefined,
      status: statusOpen,
      q: q ? q.slice(0, 100) : undefined,
      page: Number.isFinite(page) && page > 0 ? Math.floor(page) : undefined,
      limit: Number.isFinite(perPage) && perPage > 0 ? Math.min(1000, Math.floor(perPage)) : undefined,
    })

    const motivAdGroups = (data.data ?? []).map(adGroupInsightToMotivAdGroup)
    const totals = metricsToMotivStats(data.summary?.metrics)
    const meta = pagingToMotivMeta(data.paging, perPage || motivAdGroups.length)

    const response: MotivAdGroupListResponse = {
      data: motivAdGroups,
      links: { first: null, last: null, prev: null, next: null },
      meta,
      totals,
      exchange_rate: 1,
    }
    return NextResponse.json(response)
  } catch (err) {
    if (err instanceof OpenApiError) {
      console.error('[motiv/ad-groups→openApi]', { code: err.code, status: err.status })
      return NextResponse.json(
        { error: { code: err.code, message: err.message, details: err.details } },
        { status: err.status },
      )
    }
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: { code: 'INTERNAL', message } }, { status: 500 })
  }
}
