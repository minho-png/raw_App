import { NextRequest, NextResponse } from 'next/server'
import { fetchStatsAdGroup, type StatsQuery } from '@/lib/motivApi/statsService'

// GET /api/motiv/stats/adgroup?{scope...}&start_date&end_date
// 사용자 요청 — '광고그룹 단에서 DMP 사별로 확인'.
// /v1/stats/adgroup/breakdown 호출. 응답 구조는 캠페인 breakdown 과 유사 추정.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SCOPE_KEYS = ['campaign_id', 'adaccount_id', 'agency_id', 'publisher_id', 'adgroup_id'] as const

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
      { error: 'scope_required', allowed: SCOPE_KEYS },
      { status: 400 },
    )
  }
  try {
    const query = parseQuery(sp)
    const data = await fetchStatsAdGroup(query)
    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = /Motiv API 401/.test(message) ? 401
      : /시간 초과/.test(message) ? 504
      : 500
    return NextResponse.json({ error: message }, { status })
  }
}
