"use client"

/**
 * Open API 정산 집계 — **광고그룹 단위(=DATA_PROVIDER 차원)** 데이터 hook.
 *
 * 명세 `/settlements` 가 광고그룹 단일 dimension 을 직접 주지 않으므로, 본 hook 은
 * DATA_PROVIDER(데이터제공자/DMP) 차원 행을 반환한다 — dmp-fee 정산이 직접 소비.
 *
 * useOpenApiSettlements 의 얇은 래퍼(groupBy=DATA_PROVIDER 고정).
 * 다음 라운드에서 정산 dmp-fee 페이지가 이 hook 으로 통일 예정.
 */

import { useOpenApiSettlements } from './useOpenApiSettlements'

interface Args {
  month: string
  agencyId?: string
  mediaId?: string
  enabled?: boolean
  refreshKey?: number
}

export function useOpenApiDataProviders(args: Args) {
  return useOpenApiSettlements({
    month: args.month,
    groupBy: ['DATA_PROVIDER'],
    agencyId: args.agencyId,
    mediaId: args.mediaId,
    enabled: args.enabled,
    refreshKey: args.refreshKey,
  })
}
