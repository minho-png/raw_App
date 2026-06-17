"use client"

/**
 * Open API 정산 집계 hook — **월 단위만** 조회 (사용자 결정 2026-06-16: 기간 초과
 * 정보를 불러오면 과부하). `month`(YYYY-MM) 를 받아 그 달 [1일~말일] 만 호출한다.
 *
 * 응답: SettlementRow[] (dimension 노드 배열 + metrics). 페이지가 groupBy 에 맞춰
 * 차원/금액을 소비한다.
 *
 * client(/api/open-api/settlements) → upstream. 30초 abort + 진단 로그
 * (useMotivStatsCampaign 패턴 일관).
 */

import { useEffect, useRef, useState } from 'react'
import { monthToRange } from '@/lib/dateRange'
import type { GroupByDim, SettlementRow, SettlementsPaging } from '@/lib/openApi/settlementsTypes'

interface Args {
  /** 대상 월 'YYYY-MM'. 이 달만 조회 (월 경계 강제). */
  month: string
  groupBy: GroupByDim[]
  agencyId?: string
  mediaId?: string
  dataProviderId?: string
  /** false 면 mediaCost 에서 내부거래 매체비 제외. 기본 true. */
  includeInternalTrade?: boolean
  orderBy?: string
  order?: 'ASC' | 'DESC'
  limit?: number
  enabled?: boolean
  refreshKey?: number
}

interface State {
  rows: SettlementRow[]
  paging: SettlementsPaging | null
  loading: boolean
  error: string | null
}

const EMPTY: State = { rows: [], paging: null, loading: false, error: null }

export function useOpenApiSettlements(args: Args): State {
  const {
    month, groupBy, agencyId, mediaId, dataProviderId,
    includeInternalTrade, orderBy, order, limit,
    enabled = true, refreshKey = 0,
  } = args

  const [state, setState] = useState<State>({ ...EMPTY, loading: enabled })
  const groupKey = groupBy.join(',')

  // 최신 인자 참조 (effect deps 최소화)
  const argsRef = useRef(args)
  argsRef.current = args

  useEffect(() => {
    if (!enabled) {
      setState({ ...EMPTY })
      return
    }
    const range = monthToRange(month)
    if (!range) {
      setState({ ...EMPTY, error: `잘못된 월 형식: ${month} (YYYY-MM)` })
      return
    }

    let cancelled = false
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), 30_000)

    ;(async () => {
      setState(s => ({ ...s, loading: true, error: null }))
      const t0 = Date.now()
      const params = new URLSearchParams()
      params.set('dateFrom', range.start)
      params.set('dateTo', range.end)
      params.set('groupBy', groupKey)
      if (agencyId) params.set('agencyId', agencyId)
      if (mediaId) params.set('mediaId', mediaId)
      if (dataProviderId) params.set('dataProviderId', dataProviderId)
      if (includeInternalTrade !== undefined) params.set('includeInternalTrade', String(includeInternalTrade))
      if (orderBy) params.set('orderBy', orderBy)
      if (order) params.set('order', order)
      if (limit) params.set('limit', String(limit))

      try {
        const res = await fetch(`/api/open-api/settlements?${params.toString()}`, { cache: 'no-store', signal: ac.signal })
        const ms = Date.now() - t0
        const diag = {
          upstreamStatus: res.headers.get('X-OpenApi-Upstream-Status'),
          latencyMs: res.headers.get('X-OpenApi-Latency-Ms'),
          attempts: res.headers.get('X-OpenApi-Attempts'),
        }
        if (!res.ok) {
          const body = await res.json().catch(() => null) as { error?: { code?: string; message?: string; details?: Record<string, string[]> } } | null
          const code = body?.error?.code ?? `HTTP_${res.status}`
          const message = body?.error?.message ?? ''
          console.group(`%c[OpenAPI:settlements] ✗ ${res.status} ${code}`, 'color:#b91c1c;font-weight:600')
          console.error('message:', message || '(본문 없음)')
          console.info('month:', month, 'groupBy:', groupKey, 'elapsed:', `${ms}ms`)
          console.info('diag:', diag)
          if (body?.error?.details) console.info('details:', body.error.details)
          console.groupEnd()
          if (!cancelled) setState({ rows: [], paging: null, loading: false, error: `${code}${message ? `: ${message}` : ''}` })
          return
        }
        const json = await res.json() as { data?: SettlementRow[]; paging?: SettlementsPaging }
        if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
          console.debug(`[OpenAPI:settlements] ✓ ${month} ${groupKey} (${json.data?.length ?? 0}행, ${ms}ms)`, { diag })
        }
        if (!cancelled) setState({ rows: json.data ?? [], paging: json.paging ?? null, loading: false, error: null })
      } catch (e) {
        if (cancelled) return
        if (e instanceof Error && e.name === 'AbortError') {
          console.error(`[OpenAPI:settlements] ✗ TIMEOUT (30s, ${month})`)
          setState({ rows: [], paging: null, loading: false, error: 'TIMEOUT — 30초 안에 응답 없음' })
          return
        }
        const message = e instanceof Error ? e.message : String(e)
        console.error(`[OpenAPI:settlements] ✗ NETWORK (${month}): ${message}`)
        setState({ rows: [], paging: null, loading: false, error: message })
      } finally {
        clearTimeout(timer)
      }
    })()

    return () => { cancelled = true; clearTimeout(timer); ac.abort() }
    // month/groupBy/필터/refresh 변경 시 재조회. 월 경계 강제이므로 dateRange 직접 노출 안 함.
  }, [enabled, month, groupKey, agencyId, mediaId, dataProviderId, includeInternalTrade, orderBy, order, limit, refreshKey])

  return state
}
