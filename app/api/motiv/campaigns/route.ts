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
import { defaultDeriveConfig, settlementFromMetrics } from '@/lib/openApi/settlementDerive'
import type {
  MotivCampaignListResponse,
  MotivCampaignType,
  MotivStatus,
} from '@/lib/motivApi/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60  // Open API insights 집계가 길어질 수 있어 함수 타임아웃 상향 (기본 10~15s)

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

    // Open API Phase 1 미지원 campaign_type short-circuit.
    // 가이드 §4: Open API 의 campaignType enum 은 DISPLAY/VIDEO/TV 3종 (PARTNERS 제외).
    // useMotivSettlementCampaigns 는 CT product 일 때 [DISPLAY,VIDEO,PARTNERS] 를
    // Promise.all 로 호출하는데, PARTNERS 가 업스트림 422 (VALIDATION_ERROR) 를 받으면
    // hook 전체가 깨져 CT 페이지가 비어버린다. PARTNERS 만 빈 응답으로 short-circuit
    // 하여 다른 3 type 의 정상 응답을 보존한다 (PARTNERS 캠페인은 누락 — Phase 2 까지
    // 한계, 사용자 합의 "Open API 정보로 논리적 동일 결과").
    if (type === 'PARTNERS') {
      console.warn('[motiv/campaigns→openApi] PARTNERS 는 Open API Phase 1 미지원 — 빈 응답 반환 (가이드 §4)')
      const empty: MotivCampaignListResponse = {
        data: [],
        links: { first: null, last: null, prev: null, next: null },
        meta: { current_page: 1, from: null, last_page: 1, per_page: perPage || 0, to: null, total: 0, path: '' },
        totals: metricsToMotivStats(undefined),
        exchange_rate: 1,
      }
      return NextResponse.json(empty, {
        headers: { 'X-OpenApi-Skipped': 'PARTNERS-unsupported' },
      })
    }

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

    // 정산성 파생 (사용자 결정 2026-06-16) — 기본 대행요율(env) 있으면 agency_fee 파생.
    const cfg = defaultDeriveConfig()
    const motivCampaigns = (data.data ?? []).map(r =>
      campaignInsightToMotivCampaign(r, settlementFromMetrics(r.metrics, cfg)),
    )
    const totals = metricsToMotivStats(data.summary?.metrics, settlementFromMetrics(data.summary?.metrics, cfg))
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
      console.error('[motiv/campaigns→openApi]', { code: err.code, status: err.status, message: err.message })
      // 구조화 에러 — 클라이언트(useMotivSettlementCampaigns) 가 실제 code/message 를
      // 콘솔에 그대로 표시할 수 있게 한다 (문자열로 뭉개면 code 가 HTTP_xxx 로 손실).
      return NextResponse.json(
        { error: { code: err.code, message: err.message, details: err.details } },
        { status: err.status },
      )
    }
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: { code: 'INTERNAL', message } }, { status: 500 })
  }
}
