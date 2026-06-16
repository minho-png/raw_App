/**
 * Crosstarget Open API `/ads/insights` proxy.
 *
 * 토큰 노출 방지 + 입력 검증 + 에러 정규화. 클라이언트는 본 endpoint 호출.
 *
 * 필수 쿼리: `dateFrom`, `dateTo` (YYYY-MM-DD).
 * level 별 추가 검증 (가이드 §5 매트릭스):
 *   - DAILY: 기간 ≤ 90일
 *   - HOURLY: 기간 ≤ 7일
 *   - ADGROUP/AD: campaignIds 필수 (콤마 다중)
 *
 * Phase 1 확장 (2026-06-11): CAMPAIGN 외 level 의 501 가드 해제.
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  fetchAdGroupInsights,
  fetchAdInsights,
  fetchAllCampaignInsights,
  fetchCampaignInsights,
  fetchDailyInsights,
  fetchHourlyInsights,
} from '@/lib/openApi/insightsService'
import { OpenApiError } from '@/lib/openApi/client'
import {
  Q_MAX_LEN,
  isValidDate,
  sanitizeOrderBy,
  validateDateRange,
  validateIdList,
} from '@/lib/openApi/validation'
import type { InsightsLevel, InsightsQuery, OpenApiStatus } from '@/lib/openApi/types'

const ALLOWED_LEVELS: InsightsLevel[] = ['CAMPAIGN', 'ADGROUP', 'AD', 'DAILY', 'HOURLY']
// 가이드 §4: campaignType 허용값 (Motiv 호환 PARTNERS 포함). 잘못된 값은 업스트림에
// 흘리지 않고 프록시 단에서 422 로 차단 — 업스트림 5xx 로 둔갑하는 것 방지.
const ALLOWED_CAMPAIGN_TYPES = ['DISPLAY', 'VIDEO', 'TV', 'PARTNERS']

function bad(message: string, status = 400) {
  return NextResponse.json({ error: { code: 'BAD_REQUEST', message } }, { status })
}

function diagHeaders(opts: {
  upstream?: string
  upstreamStatus?: number
  latencyMs?: number
  attempts?: number
}): Record<string, string> {
  // 브라우저 콘솔 진단용 — 토큰·PII·query 미포함.
  const h: Record<string, string> = {}
  if (opts.upstream) h['X-OpenApi-Upstream'] = opts.upstream
  if (opts.upstreamStatus !== undefined) h['X-OpenApi-Upstream-Status'] = String(opts.upstreamStatus)
  if (opts.latencyMs !== undefined) h['X-OpenApi-Latency-Ms'] = String(opts.latencyMs)
  if (opts.attempts !== undefined) h['X-OpenApi-Attempts'] = String(opts.attempts)
  return h
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams

  const levelRaw = (sp.get('level') || 'CAMPAIGN') as InsightsLevel
  if (!ALLOWED_LEVELS.includes(levelRaw)) {
    return bad(`level 은 ${ALLOWED_LEVELS.join('/')} 중 하나여야 합니다.`)
  }

  const dateFrom = sp.get('dateFrom')
  const dateTo = sp.get('dateTo')
  if (!isValidDate(dateFrom)) return bad('dateFrom 은 YYYY-MM-DD 필수.')
  if (!isValidDate(dateTo)) return bad('dateTo 는 YYYY-MM-DD 필수.')

  // 가이드 §5 일자 제약 (순서 + DAILY≤90 / HOURLY≤7) — 순수 모듈 위임.
  const rangeChk = validateDateRange(levelRaw, dateFrom, dateTo)
  if (!rangeChk.ok) return bad(rangeChk.message, rangeChk.message.includes('늦을') ? 400 : 422)

  // id 류 콤마 다중 검증 (보안 리뷰 ⑦) — 개별 early-return 으로 타입 narrowing.
  const campaignIdsChk = validateIdList(sp.get('campaignIds'), 'campaignIds')
  if (!campaignIdsChk.ok) return bad(campaignIdsChk.message, 422)
  const adGroupIdsChk = validateIdList(sp.get('adGroupIds'), 'adGroupIds')
  if (!adGroupIdsChk.ok) return bad(adGroupIdsChk.message, 422)
  const adIdsChk = validateIdList(sp.get('adIds'), 'adIds')
  if (!adIdsChk.ok) return bad(adIdsChk.message, 422)
  const idsChk = validateIdList(sp.get('ids'), 'ids')
  if (!idsChk.ok) return bad(idsChk.message, 422)
  const campaignIds = campaignIdsChk.value

  if ((levelRaw === 'ADGROUP' || levelRaw === 'AD') && !campaignIds) {
    return bad(`${levelRaw} level 은 campaignIds (콤마 다중) 필수.`, 422)
  }

  const qRaw = sp.get('q')
  if (qRaw && qRaw.length > Q_MAX_LEN) {
    return bad(`q 는 최대 ${Q_MAX_LEN}자.`, 422)
  }

  const campaignTypeRaw = sp.get('campaignType')
  if (campaignTypeRaw && !ALLOWED_CAMPAIGN_TYPES.includes(campaignTypeRaw)) {
    return bad(`campaignType 은 ${ALLOWED_CAMPAIGN_TYPES.join('/')} 중 하나여야 합니다.`, 422)
  }

  const orderBy = sanitizeOrderBy(sp.get('orderBy'))

  const page = Number(sp.get('page'))
  const limit = Number(sp.get('limit'))
  const statusRaw = sp.get('status')
  const orderRaw = sp.get('order')
  const baseQuery: Omit<InsightsQuery, 'level'> = {
    dateFrom,
    dateTo,
    campaignType: sp.get('campaignType') ?? undefined,
    accountId: sp.get('accountId') ?? undefined,
    agencyId: sp.get('agencyId') ?? undefined,
    campaignIds,
    adGroupIds: adGroupIdsChk.value,
    adIds: adIdsChk.value,
    ids: idsChk.value,
    status: statusRaw === 'ACTIVE' || statusRaw === 'PAUSED' ? (statusRaw as OpenApiStatus) : undefined,
    q: qRaw ?? undefined,
    orderBy,
    order: orderRaw === 'ASC' || orderRaw === 'DESC' ? orderRaw : undefined,
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : undefined,
    limit: Number.isFinite(limit) && limit > 0 ? Math.min(1000, Math.floor(limit)) : undefined,
  }

  const all = sp.get('all') === 'true'
  const startedAt = Date.now()

  try {
    let data
    switch (levelRaw) {
      case 'CAMPAIGN': {
        if (all) {
          // fetchAllCampaignInsights 는 page 무시 (1부터 자동 순회) — page 키 제외.
          const { page: _omit, ...rest } = baseQuery
          void _omit
          data = await fetchAllCampaignInsights(rest)
        } else {
          data = await fetchCampaignInsights(baseQuery)
        }
        break
      }
      case 'ADGROUP': data = await fetchAdGroupInsights(baseQuery); break
      case 'AD':      data = await fetchAdInsights(baseQuery); break
      case 'DAILY':   data = await fetchDailyInsights(baseQuery); break
      case 'HOURLY':  data = await fetchHourlyInsights(baseQuery); break
    }
    const latencyMs = Date.now() - startedAt
    console.info('[open-api/insights] OK', { level: levelRaw, dateFrom, dateTo, latencyMs })
    return NextResponse.json(data, {
      headers: diagHeaders({
        upstream: 'manage2.crosstarget.co.kr/api/v1/ads/insights',
        upstreamStatus: 200,
        latencyMs,
        attempts: 1,
      }),
    })
  } catch (err) {
    if (err instanceof OpenApiError) {
      // 관측 (운영 리뷰 ⑩) — 토큰 값 미포함, 진단 컨텍스트만.
      console.error('[open-api/insights]', { code: err.code, status: err.status, level: levelRaw, dateFrom, dateTo, meta: err.meta })
      return NextResponse.json(
        { error: { code: err.code, message: err.message, details: err.details } },
        {
          status: err.status,
          headers: diagHeaders({
            ...(err.meta ?? {}),
            latencyMs: err.meta?.latencyMs ?? Date.now() - startedAt,
          }),
        },
      )
    }
    const message = err instanceof Error ? err.message : String(err)
    console.error('[open-api/insights] INTERNAL', message)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message } },
      { status: 500, headers: diagHeaders({ latencyMs: Date.now() - startedAt }) },
    )
  }
}
