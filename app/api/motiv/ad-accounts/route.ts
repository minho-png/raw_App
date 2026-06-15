/**
 * `/api/motiv/ad-accounts` — Open API 는 별도 광고계정 목록 명세를 주지 않음.
 *
 * CAMPAIGN level insights 의 dimensions.accountId/accountName 에서 distinct 추출.
 * 합당한 대안 — 정산 페이지의 필터 옵션 채우기에 필요한 광고계정 목록을 동일하게 제공.
 */

import { NextRequest, NextResponse } from 'next/server'
import { fetchAllCampaignInsights } from '@/lib/openApi/insightsService'
import { OpenApiError } from '@/lib/openApi/client'
import { distinctAdAccountsFromCampaignRows } from '@/lib/openApi/legacyAdapter'
import type { MotivAdAccountListResponse, MotivStatus } from '@/lib/motivApi/types'
import { motivStatusToOpen } from '@/lib/openApi/legacyAdapter'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_STATUS: MotivStatus[] = ['Y', 'N']

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
    const status = sp.get('status')
    const q = sp.get('q')
    const perPage = Number(sp.get('per_page'))

    const all = await fetchAllCampaignInsights({
      dateFrom: defaultDateFrom(),
      dateTo: defaultDateTo(),
      status: status && (ALLOWED_STATUS as string[]).includes(status)
        ? motivStatusToOpen(status as MotivStatus)
        : undefined,
      limit: 1000,
    })

    let accounts = distinctAdAccountsFromCampaignRows(all.data)
    if (q) {
      const needle = q.slice(0, 100).toLowerCase()
      accounts = accounts.filter(a => (a.name ?? '').toLowerCase().includes(needle))
    }

    const total = accounts.length
    const per = Number.isFinite(perPage) && perPage > 0 ? Math.min(200, Math.floor(perPage)) : total
    const response: MotivAdAccountListResponse = {
      data: per === total ? accounts : accounts.slice(0, per),
      links: { first: null, last: null, prev: null, next: null },
      meta: {
        current_page: 1,
        from: total === 0 ? null : 1,
        last_page: per > 0 ? Math.max(1, Math.ceil(total / per)) : 1,
        per_page: per,
        to: total === 0 ? null : Math.min(total, per),
        total,
        path: '',
      },
    }
    return NextResponse.json(response)
  } catch (err) {
    if (err instanceof OpenApiError) {
      console.error('[motiv/ad-accounts→openApi]', { code: err.code, status: err.status })
      return NextResponse.json(
        { error: `Open API ${err.code}: ${err.message}` },
        { status: err.status },
      )
    }
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
