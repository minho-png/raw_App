import { NextRequest, NextResponse } from 'next/server'
import { fetchStatsDaily, type StatsQuery } from '@/lib/motivApi/statsService'

// GET /api/motiv/stats/daily?{scope...}&start_date&end_date
// MOTIV §10 권한 규칙: Platform 유저는 scope 생략 가능. 그 외엔
//   campaign_id / adaccount_id / agency_id / publisher_id 중 하나 필수.
// 본 route 는 보수적으로 scope 1개 이상 필수 — 비-Platform 호출 시 401 폭주 방지.
//
// query keys (모두 옵셔널이지만 scope 4개 중 1개는 필수):
//   campaign_id, adaccount_id, adgroup_id, ad_id, agency_id, publisher_id, country
//   start_date, end_date, exchange_rate, include, page, per_page, sort

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

  // scope 사전 검증
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
    const data = await fetchStatsDaily(query)
    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = /Motiv API 401/.test(message) ? 401
      : /시간 초과/.test(message) ? 504
      : 500
    return NextResponse.json({ error: message }, { status })
  }
}
