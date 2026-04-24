"use client"
import { useEffect, useState } from "react"
import type { MotivCampaign, MotivCampaignListResponse, MotivCampaignType, MotivAdGroup, MotivAdGroupListResponse } from "@/lib/motivApi/types"
import { motivTypeToProduct, isExcludedCampaign, type MediaProductType } from "@/lib/motivApi/productMapping"

// CT + CTV 전체 campaign_type (미노출 알림 대상)
const ALERT_TYPES: MotivCampaignType[] = ['DISPLAY', 'VIDEO', 'PARTNERS', 'TV']

// 알림 평가 시작 시각 — 매일 오전 9시 이후에만 의미있음
const ALERT_READY_HOUR = 9

export interface ZeroSpendAlertItem {
  campaign: MotivCampaign
  product: MediaProductType
  impressions: number          // campaign 레벨 합
  zeroAdGroups: MotivAdGroup[] // 캠페인 내 노출 0 활성 광고그룹
}

interface State {
  items: ZeroSpendAlertItem[]
  loading: boolean
  error: string | null
  /** 현재 시각이 오전 9시 이후인지 */
  ready: boolean
}

function todayInRange(start: string | null, end: string | null, now: Date): boolean {
  if (!start && !end) return false
  const cs = start ? new Date(start) : new Date(0)
  const ce = end   ? new Date(end)   : new Date(9e13)
  ce.setHours(23, 59, 59, 999)
  return now >= cs && now <= ce
}

function campaignImpressions(c: MotivCampaign): number {
  const win  = Number(c.stats?.win ?? 0)
  const vImp = Number(c.stats?.v_impression ?? 0)
  return (Number.isFinite(win) ? win : 0) + (Number.isFinite(vImp) ? vImp : 0)
}

function adGroupImpressions(g: MotivAdGroup): number {
  const win  = Number(g.stats?.win ?? 0)
  const vImp = Number(g.stats?.v_impression ?? 0)
  return (Number.isFinite(win) ? win : 0) + (Number.isFinite(vImp) ? vImp : 0)
}

/**
 * CT / CTV 활성 캠페인·광고그룹 중 "노출(impression) 0" 항목 감지.
 *
 * 레벨 2 감지:
 *   A) 캠페인 전체 노출 0  → zeroAdGroups 도 같이 표시 (있는 경우)
 *   B) 캠페인은 > 0 이지만 광고그룹 중 0 이 있음 → 해당 그룹들만 표시
 *
 * 조건 (AND):
 *   - status === 'Y' (campaign / adgroup 각각)
 *   - 오늘이 [start_date, end_date] 기간 내
 *   - win + v_impression === 0
 *   - 현재 시각이 오전 9시 이후 (이전엔 ready=false)
 *
 * 광고그룹 API 실패 시 campaign-level 로 graceful degrade.
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
        // 1) campaigns 병렬 조회
        const campResults = await Promise.all(ALERT_TYPES.map(async t => {
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

        const eligible: { campaign: MotivCampaign; product: MediaProductType }[] = []
        for (const r of campResults) {
          for (const c of r.data) {
            if (isExcludedCampaign(c.title)) continue
            if (c.status !== 'Y') continue
            if (!todayInRange(c.start_date, c.end_date, now)) continue
            const product = motivTypeToProduct(c.campaign_type)
            if (product !== 'CT' && product !== 'CTV') continue
            eligible.push({ campaign: c, product })
          }
        }

        // 2) adgroups 조회 (실패하면 campaign-level 만)
        let adGroups: MotivAdGroup[] = []
        try {
          const res = await fetch('/api/motiv/ad-groups?status=Y&per_page=200&page=1&sort=-created_at', { cache: 'no-store' })
          if (res.ok) {
            const data = (await res.json()) as MotivAdGroupListResponse
            adGroups = data.data ?? []
          }
        } catch {
          adGroups = []
        }

        const zeroByCampId = new Map<number, MotivAdGroup[]>()
        for (const g of adGroups) {
          if (g.status !== 'Y') continue
          if (!todayInRange(g.start_date, g.end_date, now)) continue
          if (adGroupImpressions(g) > 0) continue
          const arr = zeroByCampId.get(g.campaign_id) ?? []
          arr.push(g)
          zeroByCampId.set(g.campaign_id, arr)
        }

        // 3) 병합
        const items: ZeroSpendAlertItem[] = []
        for (const { campaign, product } of eligible) {
          const impressions = campaignImpressions(campaign)
          const zeroAdGroups = zeroByCampId.get(campaign.id) ?? []
          if (impressions > 0 && zeroAdGroups.length === 0) continue
          items.push({ campaign, product, impressions, zeroAdGroups })
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
