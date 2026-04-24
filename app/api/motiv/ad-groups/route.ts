import { NextRequest, NextResponse } from 'next/server'
import { fetchAdGroups } from '@/lib/motivApi/adGroupService'
import type { MotivAdGroupQuery, MotivStatus } from '@/lib/motivApi/types'

const ALLOWED_STATUS: MotivStatus[] = ['Y', 'N']

function parseQuery(searchParams: URLSearchParams): MotivAdGroupQuery {
  const query: MotivAdGroupQuery = {}
  const q = searchParams.get('q')
  if (q) query.q = q.slice(0, 100)

  const status = searchParams.get('status')
  if (status && (ALLOWED_STATUS as string[]).includes(status)) {
    query.status = status as MotivStatus
  }

  const campaignId = Number(searchParams.get('campaign_id'))
  if (Number.isFinite(campaignId) && campaignId > 0) query.campaign_id = Math.floor(campaignId)

  const adaccountId = Number(searchParams.get('adaccount_id'))
  if (Number.isFinite(adaccountId) && adaccountId > 0) query.adaccount_id = Math.floor(adaccountId)

  const page = Number(searchParams.get('page'))
  if (Number.isFinite(page) && page > 0) query.page = Math.floor(page)

  const perPage = Number(searchParams.get('per_page'))
  if (Number.isFinite(perPage) && perPage > 0) {
    query.per_page = Math.min(200, Math.max(1, Math.floor(perPage)))
  }

  const sort = searchParams.get('sort')
  if (sort) query.sort = sort

  const start = searchParams.get('start_date')
  if (start) query.start_date = start
  const end = searchParams.get('end_date')
  if (end) query.end_date = end

  return query
}

export async function GET(req: NextRequest) {
  try {
    const query = parseQuery(req.nextUrl.searchParams)
    const data = await fetchAdGroups(query)
    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = /^Motiv API 401/.test(message) ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
