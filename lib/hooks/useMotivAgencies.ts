"use client"
import { useEffect, useState } from "react"
import type { MotivAgency, MotivAgencyListResponse } from "@/lib/motivApi/types"

interface State {
  data: MotivAgency[]
  byId: Map<number, MotivAgency>
  byNormalizedName: Map<string, MotivAgency>
  loading: boolean
  error: string | null
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
 * Motiv /api/v1/agencies (agencies.index) 전체 페치.
 * 활성(status=Y) 만 가져옴 — 비활성 대행사는 매칭 대상 아님.
 *
 * 결과:
 *   data: 원본 배열
 *   byId: id → MotivAgency (Motiv adaccount 의 agency_id 역참조용)
 *   byNormalizedName: 정규화이름 → MotivAgency (내부 Agency.name 매칭용)
 */
export function useMotivAgencies(enabled = true) {
  const [state, setState] = useState<State>({
    data: [], byId: new Map(), byNormalizedName: new Map(), loading: true, error: null,
  })

  useEffect(() => {
    if (!enabled) {
      setState({ data: [], byId: new Map(), byNormalizedName: new Map(), loading: false, error: null })
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/motiv/agencies?per_page=200&status=Y', { cache: 'no-store' })
        if (!res.ok) throw new Error(`${res.status}`)
        const j = (await res.json()) as MotivAgencyListResponse
        const data = j.data ?? []
        const byId = new Map<number, MotivAgency>(data.map(a => [a.id, a]))
        const byNormalizedName = new Map<string, MotivAgency>()
        for (const a of data) {
          const key = normalizeAgencyName(a.name)
          if (key) byNormalizedName.set(key, a)
        }
        if (!cancelled) setState({ data, byId, byNormalizedName, loading: false, error: null })
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : String(e)
        setState({ data: [], byId: new Map(), byNormalizedName: new Map(), loading: false, error: msg })
      }
    })()
    return () => { cancelled = true }
  }, [enabled])

  return state
}
