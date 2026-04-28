import type { MotivAgencyListResponse, MotivAgencyQuery } from './types'

const BASE_URL = 'https://desk-ct.motiv-i.com/api'

function getApiToken(): string {
  const token = process.env.MOTIV_API_TOKEN
  if (!token) throw new Error('MOTIV_API_TOKEN 환경변수가 설정되지 않았습니다.')
  return token
}

function buildQueryString(query: MotivAgencyQuery): string {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue
    params.set(k, String(v))
  }
  const s = params.toString()
  return s ? `?${s}` : ''
}

/**
 * Motiv /api/v1/agencies (agencies.index) — 확정 스키마.
 * Bearer 토큰 + Laravel paginator 응답.
 */
export async function fetchMotivAgencies(
  query: MotivAgencyQuery = {},
): Promise<MotivAgencyListResponse> {
  const token = getApiToken()
  const url = `${BASE_URL}/v1/agencies${buildQueryString(query)}`
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    cache: 'no-store',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Motiv API ${res.status}: ${text.slice(0, 300)}`)
  }
  return (await res.json()) as MotivAgencyListResponse
}
