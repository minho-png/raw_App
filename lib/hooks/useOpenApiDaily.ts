"use client"

/**
 * Open API 정산 집계 — **일자 단위(DATE)** hook. 일별 추이 차트용.
 *
 * 다음 라운드에서 useMotivStatsDaily 의 분석 페이지 호출자를 본 hook 으로 대체 예정.
 * 명세상 단일 월 조회 제약은 useOpenApiSettlements 가 강제(monthToRange).
 *
 * 추가 차원(예: AGENCY+DATE)이 필요하면 groupBy 인자 통과.
 */

import { useOpenApiSettlements } from './useOpenApiSettlements'
import type { GroupByDim } from '@/lib/openApi/settlementsTypes'

interface Args {
  month: string
  /** 기본 ['DATE']. 매체별 일자 차트는 ['DATE','MEDIA'] 등. */
  groupBy?: GroupByDim[]
  agencyId?: string
  mediaId?: string
  dataProviderId?: string
  enabled?: boolean
  refreshKey?: number
}

export function useOpenApiDaily(args: Args) {
  return useOpenApiSettlements({
    month: args.month,
    groupBy: args.groupBy && args.groupBy.length > 0 ? args.groupBy : ['DATE'],
    agencyId: args.agencyId,
    mediaId: args.mediaId,
    dataProviderId: args.dataProviderId,
    enabled: args.enabled,
    refreshKey: args.refreshKey,
  })
}
