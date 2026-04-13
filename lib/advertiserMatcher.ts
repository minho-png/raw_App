/**
 * advertiserMatcher.ts
 * CSV 계정명(accountName)에서 광고주 힌트를 추출하고
 * 등록된 Advertiser 목록과 매칭하는 유틸리티
 *
 * 매체별 추출 규칙:
 *   google-ads  → 제외 (계정명 = 대행사명, 광고주 식별 불가)
 *   kakao-moment → "{agency}.MAD.{advertiser}" 형식 → .MAD. 뒤 추출
 *   meta-ads    → 계정명 자체가 광고주명
 *   naver-gfa   → 숫자 ID → 매칭 불가
 */

import type { MediaType } from './reportTypes'
import type { Advertiser } from './campaignTypes'

// ── 계정명 → 광고주 힌트 추출 ────────────────────────────────────

/**
 * 매체별 규칙으로 계정명에서 광고주 힌트(후보명)를 추출한다.
 * Google은 반드시 null을 반환한다.
 */
export function extractAdvertiserHint(
  accountName: string,
  mediaType: MediaType,
): string | null {
  const name = accountName.trim()
  if (!name) return null

  switch (mediaType) {
    case 'google':
      // 대행사 계정명이므로 광고주 식별 불가 → 제외
      return null

    case 'kakao': {
      // 형식: "{대행사}.MAD.{광고주}" (예: 모티브.MAD.바슈롬코리아)
      const madIdx = name.toUpperCase().indexOf('.MAD.')
      if (madIdx !== -1) {
        const hint = name.slice(madIdx + 5).trim()  // ".MAD." 길이 = 5
        return hint || null
      }
      // .MAD. 없으면 계정명 그대로 사용
      return name
    }

    case 'meta':
      // 계정명이 곧 광고주명 (예: 바슈롬, 바이엘(Bayer))
      // 괄호 안 영문명 제거 후 반환 (선택): "바이엘(Bayer)" → "바이엘"
      return name.replace(/\s*\(.*?\)\s*$/, '').trim() || name

    case 'naver':
      // 숫자 ID인 경우 매칭 불가
      if (/^\d+$/.test(name)) return null
      return name

    default:
      return null
  }
}

// ── 힌트 → Advertiser 매칭 ────────────────────────────────────────

/**
 * 광고주 힌트 문자열을 등록된 Advertiser 목록에서 찾는다.
 * 우선순위: 완전 일치 > 포함(힌트⊆등록명 or 등록명⊆힌트) > 첫 2글자 일치
 */
export function matchAdvertiserByHint(
  hint: string,
  advertisers: Advertiser[],
): Advertiser | null {
  if (!hint.trim() || advertisers.length === 0) return null

  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '')
  const h = norm(hint)

  // 1. 완전 일치
  const exact = advertisers.find(a => norm(a.name) === h)
  if (exact) return exact

  // 2. 포함 관계
  const contains = advertisers.find(a => {
    const n = norm(a.name)
    return h.includes(n) || n.includes(h)
  })
  if (contains) return contains

  // 3. 앞 2글자 이상 일치
  if (h.length >= 2) {
    const prefix = advertisers.find(a => {
      const n = norm(a.name)
      return n.startsWith(h.slice(0, 2)) || h.startsWith(n.slice(0, 2))
    })
    if (prefix) return prefix
  }

  return null
}

/**
 * 여러 RawRow의 accountName + mediaType 조합에서
 * 유니크한 (hint → Advertiser | null) 맵을 한번에 계산한다.
 * (호출 비용 절감용 캐싱 헬퍼)
 */
export function buildAdvertiserHintMap(
  rows: Array<{ accountName: string; mediaType: MediaType }>,
  advertisers: Advertiser[],
): Map<string, Advertiser | null> {
  const cache = new Map<string, Advertiser | null>()
  for (const { accountName, mediaType } of rows) {
    const cacheKey = `${mediaType}:${accountName}`
    if (cache.has(cacheKey)) continue
    const hint = extractAdvertiserHint(accountName, mediaType)
    const matched = hint ? matchAdvertiserByHint(hint, advertisers) : null
    cache.set(cacheKey, matched)
  }
  return cache
}
