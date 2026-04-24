import type { MotivAdGroupListResponse, MotivAdGroupQuery } from './types'

const BASE_URL = 'https://desk-ct.motiv-i.com/api'

function getApiToken(): string {
  const token = process.env.MOTIV_API_TOKEN
  if (!token) {
    throw new Error('MOTIV_API_TOKEN 환경변수가 설정되지 않았습니다.')
  }
  return token
}

function buildQueryString(query: MotivAdGroupQuery): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    params.set(key, String(value))
  }
  const s = params.toString()
  return s ? `?${s}` : ''
}

/**
 * Motiv /api/v1/adgroups (adgroups.index) 호출.
 * campaigns.index 와 동일한 Laravel 패턴 가정.
 */
export async function fetchAdGroups(
  query: MotivAdGroupQuery = {},
): Promise<MotivAdGroupListResponse> {
  const token = getApiToken()
  const url = `${BASE_URL}/v1/adgroups${buildQueryString(query)}`

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Motiv API ${res.status}: ${text.slice(0, 300)}`)
  }

  return (await res.json()) as MotivAdGroupListResponse
}
