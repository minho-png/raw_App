/**
 * Crosstarget Open API 정산 집계 proxy — 월별 조회.
 *
 * 명세: docs/OPEN_API_INSIGHTS_SPEC.md. 토큰 노출 방지 + 입력 검증 + 에러 정규화.
 * 조회는 **월 단위로만** (사용자 결정 2026-06-16) — 기간 초과 정보를 불러오면 과부하.
 * 프록시 단에서 기간 366일 상한(명세 한도) + groupBy 화이트리스트 + 단일 ID 필터 검증.
 */

import { NextRequest, NextResponse } from 'next/server'
import { fetchSettlements } from '@/lib/openApi/settlementsService'
import { OpenApiError } from '@/lib/openApi/client'
import {
  isValidDate,
  validateSettlementDateRange,
  validateGroupBy,
  sanitizeSingleId,
  sanitizeSettlementOrderBy,
} from '@/lib/openApi/validation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60  // 정산 집계가 길어질 수 있어 함수 타임아웃 상향

function bad(message: string, status = 400) {
  return NextResponse.json({ error: { code: 'BAD_REQUEST', message } }, { status })
}

function diagHeaders(opts: {
  upstream?: string
  upstreamStatus?: number
  latencyMs?: number
  attempts?: number
}): Record<string, string> {
  const h: Record<string, string> = {}
  if (opts.upstream) h['X-OpenApi-Upstream'] = opts.upstream
  if (opts.upstreamStatus !== undefined) h['X-OpenApi-Upstream-Status'] = String(opts.upstreamStatus)
  if (opts.latencyMs !== undefined) h['X-OpenApi-Latency-Ms'] = String(opts.latencyMs)
  if (opts.attempts !== undefined) h['X-OpenApi-Attempts'] = String(opts.attempts)
  return h
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams

  const dateFrom = sp.get('dateFrom')
  const dateTo = sp.get('dateTo')
  if (!isValidDate(dateFrom)) return bad('dateFrom 은 YYYY-MM-DD 필수.')
  if (!isValidDate(dateTo)) return bad('dateTo 는 YYYY-MM-DD 필수.')

  // 기간 제약 (명세 366일) — 초과 시 422. 앱은 월 단위만 보내므로 정상 통과.
  const rangeChk = validateSettlementDateRange(dateFrom, dateTo)
  if (!rangeChk.ok) return bad(rangeChk.message, rangeChk.message.includes('늦을') ? 400 : 422)

  const groupChk = validateGroupBy(sp.get('groupBy'))
  if (!groupChk.ok) return bad(groupChk.message, 422)

  const orderRaw = sp.get('order')
  const internalRaw = sp.get('includeInternalTrade')
  const page = Number(sp.get('page'))
  const limit = Number(sp.get('limit'))

  const startedAt = Date.now()
  try {
    const data = await fetchSettlements({
      dateFrom,
      dateTo,
      groupBy: groupChk.value,
      agencyId: sanitizeSingleId(sp.get('agencyId')),
      mediaId: sanitizeSingleId(sp.get('mediaId')),
      dataProviderId: sanitizeSingleId(sp.get('dataProviderId')),
      includeInternalTrade: internalRaw === null ? undefined : internalRaw !== 'false',
      orderBy: sanitizeSettlementOrderBy(sp.get('orderBy')),
      order: orderRaw === 'ASC' || orderRaw === 'DESC' ? orderRaw : undefined,
      page: Number.isFinite(page) && page > 0 ? Math.floor(page) : undefined,
      limit: Number.isFinite(limit) && limit > 0 ? Math.min(1000, Math.floor(limit)) : undefined,
    })
    const latencyMs = Date.now() - startedAt
    console.info('[open-api/settlements] OK', { groupBy: groupChk.value, dateFrom, dateTo, rows: data.data.length, latencyMs })
    return NextResponse.json(data, {
      headers: diagHeaders({
        upstream: 'manage2.crosstarget.co.kr/api/v1/settlements',
        upstreamStatus: 200,
        latencyMs,
        attempts: 1,
      }),
    })
  } catch (err) {
    if (err instanceof OpenApiError) {
      console.error('[open-api/settlements]', { code: err.code, status: err.status, groupBy: groupChk.value, dateFrom, dateTo, meta: err.meta })
      return NextResponse.json(
        { error: { code: err.code, message: err.message, details: err.details } },
        {
          status: err.status,
          headers: diagHeaders({
            ...(err.meta ?? {}),
            latencyMs: err.meta?.latencyMs ?? Date.now() - startedAt,
          }),
        },
      )
    }
    const message = err instanceof Error ? err.message : String(err)
    console.error('[open-api/settlements] INTERNAL', message)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message } },
      { status: 500, headers: diagHeaders({ latencyMs: Date.now() - startedAt }) },
    )
  }
}
