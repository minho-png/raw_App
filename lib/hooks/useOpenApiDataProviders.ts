"use client"

/**
 * Open API 정산 집계 — **DATA_PROVIDER(데이터 제공자/DMP)** 차원 hook.
 *
 * 옵션 byMedia=true 시 groupBy=['DATA_PROVIDER','MEDIA'] 로 차원 확장 → DMP × 매체
 * 매트릭스 row 반환. dmp-fee 페이지의 "매체별 보기" 토글이 사용.
 */

import { useOpenApiSettlements } from './useOpenApiSettlements'
import type { GroupByDim } from '@/lib/openApi/settlementsTypes'

interface Args {
  month: string
  /** true 면 매체(MEDIA) 차원 추가. 기본 false. */
  byMedia?: boolean
  agencyId?: string
  mediaId?: string
  enabled?: boolean
  refreshKey?: number
}

export function useOpenApiDataProviders(args: Args) {
  const groupBy: GroupByDim[] = args.byMedia
    ? ['DATA_PROVIDER', 'MEDIA']
    : ['DATA_PROVIDER']
  return useOpenApiSettlements({
    month: args.month,
    groupBy,
    agencyId: args.agencyId,
    mediaId: args.mediaId,
    enabled: args.enabled,
    refreshKey: args.refreshKey,
  })
}
