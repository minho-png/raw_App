// MotivAdAccount / MotivAgency 응답의 표시명 fallback.
// Motiv API 가 응답 스키마를 환경별로 다르게 채울 수 있어 보수적 chain 적용.

import type { MotivAdAccount, MotivAgency } from './types'

// 광고주 표시명 — adAccount 에서 추출
//   1순위: advertiser_name (최상단 평탄화)
//   2순위: advertiser.name (nested)
//   3순위: name (adAccount 의 자체 이름 — 광고주 미연결 시 fallback)
//   4순위: '—'
export function getAdvertiserName(adAccount: MotivAdAccount | null | undefined): string {
  if (!adAccount) return '—'
  if (adAccount.advertiser_name && adAccount.advertiser_name.trim()) return adAccount.advertiser_name
  if (adAccount.advertiser?.name && adAccount.advertiser.name.trim()) return adAccount.advertiser.name
  if (adAccount.name && adAccount.name.trim()) return adAccount.name
  return '—'
}

// 대행사 표시명 — 정산용 corporate_name 우선
export function getAgencyDisplayName(agency: MotivAgency | null | undefined): string {
  if (!agency) return '—'
  // MotivAgency 타입은 name 만 정의되어 있을 수 있으므로 corporate_name 은 옵셔널 cast
  const corp = (agency as MotivAgency & { corporate_name?: string | null }).corporate_name
  if (corp && corp.trim()) return corp
  if (agency.name && agency.name.trim()) return agency.name
  return '—'
}
