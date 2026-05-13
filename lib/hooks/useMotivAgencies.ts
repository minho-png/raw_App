"use client"
import { useEffect, useState } from "react"
import type { MotivAgency } from "@/lib/motivApi/types"
import { fetchAllPages } from "@/lib/motivApi/paginatedFetch"

interface State {
  data: MotivAgency[]
  byId: Map<number, MotivAgency>
  byNormalizedName: Map<string, MotivAgency>
  loading: boolean
  error: string | null
  /** 일부 페이지 fetch 실패 또는 maxPages 초과 시 true */
  partial: boolean
}

/**
 * 회사명 정규화 — Motiv 측 / 내부 측 이름이 정확히 같지 않아도 매칭되도록.
 * 제거: 공백, ㈜·㈔·(주)·(주식회사), 끝의 'Inc.'/'주식회사', 비영숫자.
 */
export function normalizeAgencyName(name: string): string {
  if (!name) return ''
  return name
    .replace(/㈜|㈔|\(주\)|\(주식회사\)|주식회사|inc\.?|inc/gi, '')
    .replace(/\s+/g, '')
    .toLowerCase()
}

/**
 * Motiv /api/v1/agencies (agencies.index) 전체 페치 — 페이지네이션 모든 페이지 순회.
 * 활성(status=Y) 만 가져옴 — 비활성 대행사는 매칭 대상 아님.
 *
 * 결과:
 *   data: 원본 배열 (모든 페이지 병합)
 *   byId: id → MotivAgency (Motiv adaccount 의 agency_id 역참조용)
 *   byNormalizedName: 정규화이름 → MotivAgency (내부 Agency.name 매칭용)
 *   partial: 일부 페이지 실패 또는 한도 초과 시 true
 */
export function useMotivAgencies(enabled = true) {
  const [state, setState] = useState<State>({
    data: [], byId: new Map(), byNormalizedName: new Map(),
    loading: true, error: null, partial: false,
  })

  useEffect(() => {
    if (!enabled) {
      setState({
        data: [], byId: new Map(), byNormalizedName: new Map(),
        loading: false, error: null, partial: false,
      })
      return
    }
    let cancelled = false
    ;(async () => {
      const result = await fetchAllPages<MotivAgency>({
        endpoint: '/api/motiv/agencies',
        perPage: 200,
        extraParams: { status: 'Y' },
      })
      if (cancelled) return
      const data = result.data
      const byId = new Map<number, MotivAgency>(data.map(a => [a.id, a]))
      const byNormalizedName = new Map<string, MotivAgency>()
      for (const a of data) {
        const key = normalizeAgencyName(a.name)
        if (key) byNormalizedName.set(key, a)
      }
      const error = data.length === 0 && result.errors.length > 0 ? result.errors[0] : null
      setState({ data, byId, byNormalizedName, loading: false, error, partial: result.partial })
    })()
    return () => { cancelled = true }
  }, [enabled])

  return state
}
