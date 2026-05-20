"use client"
import { useEffect, useState } from "react"

// CT+ 상세 페이지 KPI strip 카드 표시 설정.
// 사용자가 카드 우측 'x' 클릭으로 숨김, '+ 카드 추가' 로 복원.
// localStorage 글로벌 키 (캠페인 무관) — 한 번 설정하면 모든 상세 페이지에 적용.

export const KPI_CARD_KEYS = [
  'setting',     // 세팅금액
  'spend',       // 집행금액
  'spendRate',   // 소진율
  'impressions', // 노출
  'views',       // 조회
  'clicks',      // 클릭
  'ctr',         // CTR
  'vtr',         // VTR
  'cpm',         // CPM
  'cpc',         // CPC
  'cpv',         // CPV
] as const
export type KpiCardKey = typeof KPI_CARD_KEYS[number]

const LS_KEY = 'ct-plus-kpi-cards-visible-v1'

export function useKpiCardVisibility() {
  const [visible, setVisible] = useState<KpiCardKey[]>(() => [...KPI_CARD_KEYS])
  // hydration mismatch 방지 — 첫 렌더는 default, mount 후 localStorage 로딩.
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as unknown
      if (!Array.isArray(parsed)) return
      const valid = parsed.filter((k): k is KpiCardKey =>
        typeof k === 'string' && (KPI_CARD_KEYS as readonly string[]).includes(k)
      )
      setVisible(valid)
    } catch {}
  }, [])

  function persist(next: KpiCardKey[]) {
    setVisible(next)
    if (typeof window === 'undefined') return
    try { localStorage.setItem(LS_KEY, JSON.stringify(next)) } catch {}
  }
  function remove(k: KpiCardKey) {
    persist(visible.filter(x => x !== k))
  }
  function add(k: KpiCardKey) {
    if (visible.includes(k)) return
    // 원래 순서(KPI_CARD_KEYS) 기준으로 자연스럽게 삽입
    const order: Record<KpiCardKey, number> = {} as Record<KpiCardKey, number>
    KPI_CARD_KEYS.forEach((key, i) => { order[key] = i })
    const next = [...visible, k].sort((a, b) => order[a] - order[b])
    persist(next)
  }
  function reset() { persist([...KPI_CARD_KEYS]) }

  const hidden = KPI_CARD_KEYS.filter(k => !visible.includes(k))
  return { visible, hidden, remove, add, reset }
}
