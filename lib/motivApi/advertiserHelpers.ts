// MotivAdAccount / MotivAgency 응답의 표시명 fallback.
// Motiv API 가 응답 스키마를 환경별로 다르게 채울 수 있어 보수적 chain 적용.

import type { MotivAdAccount, MotivAgency, MotivCampaign } from './types'
import type { Advertiser } from '../campaignTypes'

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

// 사용자 결정 — '힐스펫 뉴트리션_CTV' 같이 내부 광고주가 등록되어 있고
// Motiv assignment 가 명시되지 않아도 자동 연결되도록 fuzzy 매칭.
//
// 매칭 규칙:
//   1) 내부 advertiser 이름에서 product 접미사(_CT/_CTV/_CT_PLUS/_IMC/_DISPLAY/_VIDEO/_TV)
//      를 제거한 stripped 토큰을 만든다.
//   2) Motiv 캠페인 title + adAccount.advertiser_name + adAccount.name 합친 haystack 에서
//      stripped 토큰이 substring 으로 발견되면 매칭.
//   3) product 가 일치하는 advertiser(접미사 일치) 를 우선 시도, 없으면 generic pass.
//
// 사용처: settlement/dmp-fee, settlement/agency-fee 의 advertiserName 폴백.
const PRODUCT_SUFFIX_RE = /_(?:CT_PLUS|CTV|CT|IMC|DISPLAY|VIDEO|TV|PARTNERS)$/i

export function resolveAdvertiserByFuzzyMatch(
  camp: MotivCampaign,
  advertisers: Advertiser[],
  adAccount: MotivAdAccount | null | undefined,
  productSuffix: 'CT' | 'CTV' | null,
): Advertiser | null {
  const haystack = [
    camp.title ?? '',
    adAccount?.advertiser_name ?? '',
    adAccount?.advertiser?.name ?? '',
    adAccount?.name ?? '',
  ].join(' ').toLowerCase()
  if (!haystack.trim()) return null

  function stripped(name: string): string {
    return name.replace(PRODUCT_SUFFIX_RE, '').trim().toLowerCase()
  }

  // Pass 1: product 접미사 일치 우선.
  if (productSuffix) {
    const needle = '_' + productSuffix.toLowerCase()
    for (const adv of advertisers) {
      if (!adv.name) continue
      if (!adv.name.toLowerCase().endsWith(needle)) continue
      const s = stripped(adv.name)
      if (s && haystack.includes(s)) return adv
    }
  }
  // Pass 2: 접미사 무관 generic.
  for (const adv of advertisers) {
    if (!adv.name) continue
    const s = stripped(adv.name)
    if (s && haystack.includes(s)) return adv
  }
  return null
}
