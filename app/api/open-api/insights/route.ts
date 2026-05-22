/**
 * Crosstarget Open API `/ads/insights` proxy.
 *
 * 토큰 노출 방지 + 입력 검증 + 에러 정규화. 클라이언트는 본 endpoint 를 호출.
 *
 * 필수 쿼리: `dateFrom`, `dateTo` (YYYY-MM-DD).
 * 옵션:      `level`(기본 CAMPAIGN), `campaignType`, `accountId`, `agencyId`,
 *            `page`, `limit`, `all=true` (전체 페이지 자동 순회).
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  fetchCampaignInsights,
  fetchAllCampaignInsights,
} from '@/lib/openApi/insightsService'
import { OpenApiError } from '@/lib/openApi/client'
import type { InsightsLevel } from '@/lib/openApi/types'

const ALLOWED_LEVELS: InsightsLevel[] = ['CAMPAIGN', 'ADGROUP', 'AD', 'DAILY', 'HOURLY']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function bad(message: string, status = 400) {
  return NextResponse.json({ error: { code: 'BAD_REQUEST', message } }, { status })
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams

  const levelRaw = (sp.get('level') || 'CAMPAIGN') as InsightsLevel
  if (!ALLOWED_LEVELS.includes(levelRaw)) {
    return bad(`level 은 ${ALLOWED_LEVELS.join('/')} 중 하나여야 합니다.`)
  }
  if (levelRaw !== 'CAMPAIGN') {
    // Phase 1: CAMPAIGN level 만 지원. 다른 level 은 dimensions 타입 분기 필요 — 추후 확장.
    return bad('현재 CAMPAIGN level 만 지원합니다. ADGROUP/AD/DAILY/HOURLY 는 추후 추가 예정.', 501)
  }

  const dateFrom = sp.get('dateFrom')
  const dateTo = sp.get('dateTo')
  if (!dateFrom || !DATE_RE.test(dateFrom)) return bad('dateFrom 은 YYYY-MM-DD 필수.')
  if (!dateTo || !DATE_RE.test(dateTo)) return bad('dateTo 는 YYYY-MM-DD 필수.')
  if (dateFrom > dateTo) return bad('dateFrom 이 dateTo 보다 늦을 수 없습니다.')

  const page = Number(sp.get('page'))
  const limit = Number(sp.get('limit'))
  const query = {
    dateFrom,
    dateTo,
    campaignType: sp.get('campaignType') ?? undefined,
    accountId: sp.get('accountId') ?? undefined,
    agencyId: sp.get('agencyId') ?? undefined,
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : undefined,
    limit: Number.isFinite(limit) && limit > 0 ? Math.min(500, Math.floor(limit)) : undefined,
  }

  const all = sp.get('all') === 'true'

  try {
    const data = all
      ? await fetchAllCampaignInsights(query)
      : await fetchCampaignInsights(query)
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
