/**
 * `/api/motiv/agencies` — Open API insights 의 dimensions.agencyId/agencyName 에서 distinct.
 *
 * Open API 는 별도 대행사 목록 API 가 없음. CAMPAIGN level 응답의 agency 필드는
 * 매체별 선택적 — agency 정보가 비어있는 캠페인은 목록에서 제외됨 (정상).
 */

import { NextRequest, NextResponse } from 'next/server'
import { fetchAllCampaignInsights } from '@/lib/openApi/insightsService'
import { OpenApiError } from '@/lib/openApi/client'
import { distinctAgenciesFromCampaignRows } from '@/lib/openApi/legacyAdapter'
import type { MotivAgencyListResponse } from '@/lib/motivApi/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
    const q = sp.get('q')
    const perPage = Number(sp.get('per_page'))
    const page = Number(sp.get('page'))

    const all = await fetchAllCampaignInsights({
      dateFrom: defaultDateFrom(),
      dateTo: defaultDateTo(),
      limit: 1000,
    })

    let agencies = distinctAgenciesFromCampaignRows(all.data)
    if (q) {
      const needle = q.slice(0, 100).toLowerCase()
      agencies = agencies.filter(a => a.name.toLowerCase().includes(needle))
    }

    const total = agencies.length
    const per = Number.isFinite(perPage) && perPage > 0 ? Math.min(200, Math.floor(perPage)) : Math.max(total, 1)
    const cur = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
    const start = (cur - 1) * per
    const sliced = agencies.slice(start, start + per)

    const response: MotivAgencyListResponse = {
      data: sliced,
      links: { first: null, last: null, prev: null, next: null },
      meta: {
        current_page: cur,
        from: total === 0 ? null : start + 1,
        last_page: per > 0 ? Math.max(1, Math.ceil(total / per)) : 1,
        per_page: per,
        to: total === 0 ? null : Math.min(total, start + per),
        total,
        path: '',
      },
    }
    return NextResponse.json(response)
  } catch (err) {
    if (err instanceof OpenApiError) {
      console.error('[motiv/agencies→openApi]', { code: err.code, status: err.status })
      return NextResponse.json(
        { error: `Open API ${err.code}: ${err.message}` },
        { status: err.status },
      )
    }
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
