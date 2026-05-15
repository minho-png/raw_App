import { NextRequest, NextResponse } from 'next/server'
import { fetchAdGroups } from '@/lib/motivApi/adGroupService'
import type { MotivAdGroupQuery, MotivStatus } from '@/lib/motivApi/types'

// GET /api/motiv/adgroups?campaign_id=...&start_date&end_date&...
//
// 사용자 보고 — '/v1/stats/adgroup/breakdown' 은 404 (미존재).
// 대신 /v1/adgroups (list+stats) 사용. campaigns.index 와 동일 Laravel 패턴.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function parseQuery(sp: URLSearchParams): MotivAdGroupQuery {
  const q: MotivAdGroupQuery = {}
  const num = (k: keyof MotivAdGroupQuery) => {
    const v = sp.get(k)
    if (v == null) return
    const n = Number(v)
    if (Number.isFinite(n)) (q as Record<string, string | number>)[k] = n
  }
  const str = (k: keyof MotivAdGroupQuery) => {
    const v = sp.get(k)
    if (v) (q as Record<string, string | number>)[k] = v
  }
  str('q')
  const status = sp.get('status')
  if (status === 'Y' || status === 'N') q.status = status as MotivStatus
  num('campaign_id'); num('adaccount_id'); num('per_page'); num('page')
  str('sort'); str('start_date'); str('end_date')
  return q
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  try {
    const query = parseQuery(sp)
    const data = await fetchAdGroups(query)
    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = /Motiv API 401/.test(message) ? 401
      : /Motiv API 404/.test(message) ? 404
      : /시간 초과/.test(message) ? 504
      : 500
    return NextResponse.json({ error: message }, { status })
  }
}
