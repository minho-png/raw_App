"use client"

/**
 * Crosstarget Open API CAMPAIGN level insights — React hook.
 *
 * Phase 1 인프라 — 현재 호출하는 페이지 없음. 차후 정산성 지표 매핑 정책
 * 결정 후 페이지에서 swap 예정 (`useMotivSettlementCampaignsByProduct` →
 * `useOpenApiCampaigns`).
 *
 * Hook 단에서 Motiv fallback 은 하지 않음 (조건부 hook 호출은 React rules
 * 위반). 토큰 미설정 시 503 + error message 그대로 caller 에 전달 → page
 * 레벨에서 toggle.
 */

import { useEffect, useState } from 'react'
import type {
  InsightsCampaignDimensions,
  InsightsMetrics,
  InsightsResponse,
  InsightsRow,
  OpenApiCampaignType,
} from '@/lib/openApi/types'

interface Options {
  /** 새 API campaignType 필터. 미지정 시 전체. */
  campaignType?: OpenApiCampaignType | OpenApiCampaignType[]
  /** YYYY-MM-DD. 둘 다 필요. 미지정 시 현재 월 1일~말일 기본. */
  dateFrom?: string
  dateTo?: string
  /** 전체 페이지 자동 순회 (default true). */
  all?: boolean
  enabled?: boolean
  /** `useRefreshControl()` 와 연동 — 값 증가 시 재호출. */
  refreshKey?: number
}

interface State {
  data: InsightsRow<InsightsCampaignDimensions>[]
  summary: InsightsMetrics | null
  loading: boolean
  error: string | null
  /** API error code (TOKEN_MISSING / HTTP_401 / BAD_REQUEST 등) — UI 분기용. */
  errorCode: string | null
}

function currentMonthRange(): { dateFrom: string; dateTo: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const lastDay = new Date(y, m + 1, 0).getDate()
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    dateFrom: `${y}-${pad(m + 1)}-01`,
    dateTo: `${y}-${pad(m + 1)}-${pad(lastDay)}`,
  }
}

const EMPTY: State = { data: [], summary: null, loading: false, error: null, errorCode: null }

export function useOpenApiCampaigns(options: Options = {}): State {
  const { campaignType, dateFrom, dateTo, all = true, enabled = true, refreshKey = 0 } = options
  const [state, setState] = useState<State>({ ...EMPTY, loading: enabled })

  // primitive 로 분해 — array 참조 변동 영향 최소화
  const typeKey = Array.isArray(campaignType) ? campaignType.join(',') : campaignType ?? ''

  useEffect(() => {
    if (!enabled) {
      setState({ ...EMPTY })
      return
    }
    let cancelled = false
    ;(async () => {
      setState(s => ({ ...s, loading: true, error: null, errorCode: null }))
      try {
        const range = dateFrom && dateTo ? { dateFrom, dateTo } : currentMonthRange()
        const params = new URLSearchParams()
        params.set('level', 'CAMPAIGN')
        params.set('dateFrom', range.dateFrom)
        params.set('dateTo', range.dateTo)
        if (typeKey) params.set('campaignType', typeKey)
        if (all) params.set('all', 'true')

        const res = await fetch(`/api/open-api/insights?${params.toString()}`, {
          cache: 'no-store',
        })
        const body = await res.json().catch(() => ({}))

        if (!res.ok) {
          const code = body?.error?.code ?? `HTTP_${res.status}`
          const message = body?.error?.message ?? `Open API ${res.status}`
          if (!cancelled) {
            setState({ ...EMPTY, error: message, errorCode: code })
          }
          return
        }

        const data = body as InsightsResponse<InsightsCampaignDimensions>
        if (!cancelled) {
          setState({
            data: data.data ?? [],
            summary: data.summary?.metrics ?? null,
            loading: false,
            error: null,
            errorCode: null,
          })
        }
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : String(e)
        setState({ ...EMPTY, error: msg, errorCode: 'NETWORK' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [enabled, typeKey, dateFrom, dateTo, all, refreshKey])

  return state
}
