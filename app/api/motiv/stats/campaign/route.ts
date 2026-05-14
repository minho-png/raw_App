import { NextRequest, NextResponse } from 'next/server'
import { fetchStatsCampaign, type StatsQuery } from '@/lib/motivApi/statsService'

// GET /api/motiv/stats/campaign?{scope...}&start_date&end_date
// MOTIV §10 권한 규칙: Platform 외 유저는 scope 4종 중 1개 필수.
// daily route 와 동일한 검증·파싱 패턴.
//
// 본 route 는 캠페인별 일자 범위 집계 row 를 그대로 반환 — 분석 페이지 카드/표 일치 확보용.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SCOPE_KEYS = ['campaign_id', 'adaccount_id', 'agency_id', 'publisher_id'] as const

function parseQuery(sp: URLSearchParams): StatsQuery {
  const q: StatsQuery = {}
  const str = (k: keyof StatsQuery) => {
    const v = sp.get(k)
    if (v) (q as Record<string, string | number>)[k] = v
  }
  const num = (k: keyof StatsQuery) => {
    const v = sp.get(k)
    if (v == null) return
    const n = Number(v)
    if (Number.isFinite(n)) (q as Record<string, string | number>)[k] = n
  }
  str('campaign_id'); str('adaccount_id'); str('adgroup_id'); str('ad_id')
  str('agency_id'); str('publisher_id'); str('country')
  str('start_date'); str('end_date'); str('sort')
  num('exchange_rate'); num('page')
  const perPage = Number(sp.get('per_page'))
  if (Number.isFinite(perPage)) q.per_page = Math.min(100, Math.max(1, Math.floor(perPage)))
  if (sp.get('include') === 'totals') q.include = 'totals'
  return q
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
    const query = parseQuery(sp)
    const data = await fetchStatsCampaign(query)
    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = /Motiv API 401/.test(message) ? 401
      : /시간 초과/.test(message) ? 504
      : 500
    return NextResponse.json({ error: message }, { status })
  }
}
