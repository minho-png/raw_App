import type { Campaign, Agency, Advertiser } from './campaignTypes'

export interface CampaignLookupResult {
  campaign: Campaign
  agency: Agency | null
  advertiser: Advertiser | null
  matchType: 'exact' | 'contains' | 'partial'
}

/**
 * CSV 캠페인명으로 등록된 캠페인을 역방향 조회합니다.
 * 매칭 우선순위: 완전 일치 > 포함 관계 > 첫 단어 일치
 */
export function lookupCampaignByName(
  csvCampaignName: string,
  campaigns: Campaign[],
  agencies: Agency[],
  advertisers: Advertiser[],
): CampaignLookupResult | null {
  if (!csvCampaignName.trim() || campaigns.length === 0) return null

  const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
  const csv = normalize(csvCampaignName)

  function buildResult(campaign: Campaign, matchType: CampaignLookupResult['matchType']): CampaignLookupResult {
    return {
      campaign,
      agency: agencies.find(a => a.id === campaign.agencyId) ?? null,
      advertiser: advertisers.find(a => a.id === campaign.advertiserId) ?? null,
      matchType,
    }
  }

  // 1. 완전 일치
  const exact = campaigns.find(c => normalize(c.campaignName) === csv)
  if (exact) return buildResult(exact, 'exact')

  // 2. 포함 관계 (CSV 캠페인명이 등록 캠페인명을 포함하거나, 그 반대)
  const contains = campaigns.find(c => {
    const name = normalize(c.campaignName)
    return csv.includes(name) || name.includes(csv)
  })
  if (contains) return buildResult(contains, 'contains')

  // 3. 첫 단어(들) 일치 — 최소 2글자
  const csvWords = csv.split(/[\s_\-\.]+/).filter(w => w.length >= 2)
  if (csvWords.length > 0) {
    const partial = campaigns.find(c => {
      const nameWords = normalize(c.campaignName).split(/[\s_\-\.]+/).filter(w => w.length >= 2)
      return csvWords.some(cw => nameWords.some(nw => cw === nw || cw.startsWith(nw) || nw.startsWith(cw)))
    })
    if (partial) return buildResult(partial, 'partial')
  }

  return null
}

/**
 * 파싱된 CSV 행들에서 유니크한 캠페인명을 추출하고 역방향 조회합니다.
 */
export function lookupCampaignsFromCsvRows(
  rows: Array<{ campaignName?: string }>,
  campaigns: Campaign[],
  agencies: Agency[],
  advertisers: Advertiser[],
): Map<string, CampaignLookupResult | null> {
  const uniqueNames = [...new Set(rows.map(r => r.campaignName ?? '').filter(Boolean))]
  const result = new Map<string, CampaignLookupResult | null>()
  for (const name of uniqueNames) {
    result.set(name, lookupCampaignByName(name, campaigns, agencies, advertisers))
  }
  return result
}
