"use client"
import { useEffect, useState } from "react"
import type { MotivCampaign, MotivCampaignListResponse, MotivCampaignType } from "@/lib/motivApi/types"
import { motivTypeToProduct, isExcludedCampaign, type MediaProductType } from "@/lib/motivApi/productMapping"

// CT + CTV 전체 campaign_type (미노출 알림 대상)
const ALERT_TYPES: MotivCampaignType[] = ['DISPLAY', 'VIDEO', 'PARTNERS', 'TV']

// 알림 평가 시작 시각 — 매일 오전 9시 이후에만 의미있음
const ALERT_READY_HOUR = 9

export interface ZeroSpendAlertItem {
  campaign: MotivCampaign
  product: MediaProductType
  impressions: number  // win + v_impression 합산 (진단용)
}

/** 캠페인의 "노출 합계" — RTB win + 비디오 impression. */
function totalImpressions(c: MotivCampaign): number {
  const win  = Number(c.stats?.win ?? 0)
  const vImp = Number(c.stats?.v_impression ?? 0)
  return (Number.isFinite(win) ? win : 0) + (Number.isFinite(vImp) ? vImp : 0)
}

interface State {
  items: ZeroSpendAlertItem[]
  loading: boolean
  error: string | null
  /** 현재 시각이 오전 9시 이후인지 */
  ready: boolean
}

function todayInRange(c: MotivCampaign, now: Date): boolean {
  const s = c.start_date ? new Date(c.start_date) : null
  const e = c.end_date   ? new Date(c.end_date)   : null
  if (!s && !e) return false
  const cs = s ?? new Date(0)
  const ce = e ?? new Date(9e13)
  ce.setHours(23, 59, 59, 999)
  return now >= cs && now <= ce
}

/**
 * CT / CTV 캠페인 중 "노출(impression) 0" 캠페인을 감지 — 실제 미노출 여부 판단.
 *
 * 조건 (AND):
 *   1) status === 'Y' (활성)
 *   2) 오늘이 [start_date, end_date] 기간 내
 *   3) win + v_impression === 0 (비용 무관. 무료 캠페인도 노출 없으면 문제)
 *   4) 현재 시각이 오전 9시 이후 (이전엔 ready=false 로 표시만 비활성화)
 *
 * 이전 daily_spent 기반 검사에서 전환한 이유:
 *   - 무료 캠페인(is_free) 은 spent=0 이라 오탐
 *   - 과금 구조와 노출 발생은 별개 — 노출 여부는 impression 카운터가 직접적 신호
 *
 * 데이터 소스: /api/motiv/campaigns?status=Y&campaign_type={각}
 */
export function useZeroSpendMotivCampaigns(enabled = true) {
  const [state, setState] = useState<State>({ items: [], loading: true, error: null, ready: false })

  useEffect(() => {
    if (!enabled) {
      setState({ items: [], loading: false, error: null, ready: false })
      return
    }
    let cancelled = false
    const now = new Date()
    const ready = now.getHours() >= ALERT_READY_HOUR

    ;(async () => {
      setState(s => ({ ...s, loading: true, error: null, ready }))
      try {
        const results = await Promise.all(ALERT_TYPES.map(async t => {
          const params = new URLSearchParams()
          params.set('campaign_type', t)
          params.set('status', 'Y')
          params.set('per_page', '200')
          params.set('page', '1')
          params.set('sort', '-created_at')
          const res = await fetch(`/api/motiv/campaigns?${params.toString()}`, { cache: 'no-store' })
          if (!res.ok) throw new Error(`Motiv ${t} ${res.status}`)
          return (await res.json()) as MotivCampaignListResponse
        }))

        const items: ZeroSpendAlertItem[] = []
        for (const r of results) {
          for (const c of r.data) {
            if (isExcludedCampaign(c.title)) continue
            if (c.status !== 'Y') continue
            if (!todayInRange(c, now)) continue
            const impressions = totalImpressions(c)
            if (impressions > 0) continue
            const product = motivTypeToProduct(c.campaign_type)
            if (!product) continue
            items.push({ campaign: c, product, impressions })
          }
        }

        if (!cancelled) setState({ items, loading: false, error: null, ready })
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : String(e)
        setState({ items: [], loading: false, error: msg, ready })
      }
    })()
    return () => { cancelled = true }
  }, [enabled])

  return state
}
