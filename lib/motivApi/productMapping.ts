// Media Product 통합 분류 (CT+ / CT / CTV)
// Motiv API 의 campaign_type 과 내부 CT+ 의 mapping 을 담당합니다.

import type { MotivCampaignType } from './types'

export type MediaProductType = 'CT_PLUS' | 'CT' | 'CTV'

// UI 필터 값: 3개 제품 + 통합
export type MediaProductFilter = MediaProductType | 'ALL'

export const MEDIA_PRODUCT_LABEL: Record<MediaProductType, string> = {
  CT_PLUS: 'CT+',
  CT:      'CT',
  CTV:     'CTV',
}

export const MEDIA_PRODUCT_FILTERS: { value: MediaProductFilter; label: string }[] = [
  { value: 'ALL',     label: '전체' },
  { value: 'CT_PLUS', label: 'CT+'   },
  { value: 'CT',      label: 'CT'    },
  { value: 'CTV',     label: 'CTV'   },
]

// Motiv campaign_type → 내부 product 매핑
// 규칙 (사용자 승인):
//   TV                 → CTV
//   DISPLAY, VIDEO     → CT
//   PARTNERS           → CT (잠정 — 추후 분리 가능)
export function motivTypeToProduct(campaignType: string): MediaProductType | null {
  if (campaignType === 'TV') return 'CTV'
  if (campaignType === 'DISPLAY' || campaignType === 'VIDEO' || campaignType === 'PARTNERS') return 'CT'
  return null
}

// 내부 product → Motiv campaign_type 배열 (필터링용)
export function productToMotivTypes(p: MediaProductType): MotivCampaignType[] {
  if (p === 'CTV')     return ['TV']
  if (p === 'CT')      return ['DISPLAY', 'VIDEO', 'PARTNERS']
  return []
}

// CT+ 는 Motiv API 에 존재하지 않음 (내부 MongoDB 전용)
export function isInternalProduct(p: MediaProductType): boolean {
  return p === 'CT_PLUS'
}
export function isMotivProduct(p: MediaProductType): boolean {
  return p === 'CT' || p === 'CTV'
}

// Motiv 캠페인 ID → 내부 assignment 매핑 타입
export interface MotivAssignment {
  motivCampaignId: number
  agencyId?: string         // 내부 Agency.id 참조
  advertiserId?: string     // 내부 Advertiser.id 참조
  operatorId?: string       // 내부 Operator.id 참조
  customAgencyFeeRate?: number  // 기본값 override (%)
  memo?: string
  updatedAt?: string
}

// ─── 제외 캠페인 (정산·미노출 알림 모두 무시) ─────────────────────────────
// 테스트용 / 내부용 캠페인으로 실제 정산 대상 아님.
// 추가/삭제 필요 시 이 배열만 수정.
export const EXCLUDED_MOTIV_CAMPAIGN_NAMES: readonly string[] = [
  'LG전자 LG채널 테스트 캠페인',
  'publica광고 테스트(삼성+뉴아이디)_250411',
  '엑셀비드 VOD 테스트 캠페인_230509 (CTV광고사업본부)',
  '엑셀비드_테스트',
  '영상 게재면 캠페인',
] as const

// 정규화된 비교 (앞뒤 공백 제거)
const EXCLUDED_SET = new Set(
  EXCLUDED_MOTIV_CAMPAIGN_NAMES.map(n => n.trim())
)

/**
 * Motiv 캠페인이 정산·알림 대상에서 제외돼야 하는지 판정.
 * 이름(title) 기준 정확 일치 (trim 후 비교).
 */
export function isExcludedCampaign(titleOrNull: string | null | undefined): boolean {
  if (!titleOrNull) return false
  return EXCLUDED_SET.has(titleOrNull.trim())
}
