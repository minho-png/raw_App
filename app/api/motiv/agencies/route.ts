import { NextRequest, NextResponse } from 'next/server'
import { fetchMotivAgencies } from '@/lib/motivApi/agencyService'
import type { MotivAgencyQuery, MotivStatus } from '@/lib/motivApi/types'

const ALLOWED_STATUS: MotivStatus[] = ['Y', 'N']

function parseQuery(searchParams: URLSearchParams): MotivAgencyQuery {
  const query: MotivAgencyQuery = {}
  const q = searchParams.get('q')
  if (q) query.q = q.slice(0, 100)
  const status = searchParams.get('status')
  if (status && (ALLOWED_STATUS as string[]).includes(status)) {
    query.status = status as MotivStatus
  }
  const perPage = Number(searchParams.get('per_page'))
  if (Number.isFinite(perPage) && perPage > 0) {
    query.per_page = Math.min(200, Math.max(1, Math.floor(perPage)))
  }
  const sort = searchParams.get('sort')
  if (sort) query.sort = sort
  return query
}

export async function GET(req: NextRequest) {
  try {
    const data = await fetchMotivAgencies(parseQuery(req.nextUrl.searchParams))
    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = /^Motiv API 401/.test(message) ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
