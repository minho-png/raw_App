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
import type { InsightsLevel, InsightsQuery, OpenApiStatus } from '@/lib/openApi/types'

const ALLOWED_LEVELS: InsightsLevel[] = ['CAMPAIGN', 'ADGROUP', 'AD', 'DAILY', 'HOURLY']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function bad(message: string, status = 400) {
  return NextResponse.json({ error: { code: 'BAD_REQUEST', message } }, { status })
}

/** dateFrom..dateTo (포함) 일수. 두 값 모두 YYYY-MM-DD 형식 검증된 후 호출. */
function daysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10))
  return Math.floor((b - a) / 86_400_000) + 1
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams

  const levelRaw = (sp.get('level') || 'CAMPAIGN') as InsightsLevel
  if (!ALLOWED_LEVELS.includes(levelRaw)) {
    return bad(`level 은 ${ALLOWED_LEVELS.join('/')} 중 하나여야 합니다.`)
  }

  const dateFrom = sp.get('dateFrom')
  const dateTo = sp.get('dateTo')
  if (!dateFrom || !DATE_RE.test(dateFrom)) return bad('dateFrom 은 YYYY-MM-DD 필수.')
  if (!dateTo || !DATE_RE.test(dateTo)) return bad('dateTo 는 YYYY-MM-DD 필수.')
  if (dateFrom > dateTo) return bad('dateFrom 이 dateTo 보다 늦을 수 없습니다.')

  // 가이드 §5 일자/필수 필터 제약
  const days = daysBetween(dateFrom, dateTo)
  if (levelRaw === 'DAILY' && days > 90) {
    return bad('DAILY level 은 최대 90일 (포함 기준).', 422)
  }
  if (levelRaw === 'HOURLY' && days > 7) {
    return bad('HOURLY level 은 최대 7일 (포함 기준).', 422)
  }

  const campaignIds = sp.get('campaignIds') ?? undefined
  if ((levelRaw === 'ADGROUP' || levelRaw === 'AD') && !campaignIds) {
    return bad(`${levelRaw} level 은 campaignIds (콤마 다중) 필수.`, 422)
  }

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
    adGroupIds: sp.get('adGroupIds') ?? undefined,
    adIds: sp.get('adIds') ?? undefined,
    ids: sp.get('ids') ?? undefined,
    status: statusRaw === 'ACTIVE' || statusRaw === 'PAUSED' ? (statusRaw as OpenApiStatus) : undefined,
    q: sp.get('q') ?? undefined,
    orderBy: sp.get('orderBy') ?? undefined,
    order: orderRaw === 'ASC' || orderRaw === 'DESC' ? orderRaw : undefined,
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : undefined,
    limit: Number.isFinite(limit) && limit > 0 ? Math.min(1000, Math.floor(limit)) : undefined,
  }

  const all = sp.get('all') === 'true'

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
    return NextResponse.json(data)
  } catch (err) {
    if (err instanceof OpenApiError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message, details: err.details } },
        { status: err.status },
      )
    }
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message } },
      { status: 500 },
    )
  }
}
