import type { MotivAdAccountListResponse, MotivAdAccountQuery } from './types'

const BASE_URL = 'https://desk-ct.motiv-i.com/api'

function getApiToken(): string {
  const token = process.env.MOTIV_API_TOKEN
  if (!token) throw new Error('MOTIV_API_TOKEN 환경변수가 설정되지 않았습니다.')
  return token
}

function buildQueryString(query: MotivAdAccountQuery): string {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue
    params.set(k, String(v))
  }
  const s = params.toString()
  return s ? `?${s}` : ''
}

/**
 * Motiv /api/v1/adaccounts (adaccounts.index 가정) 호출.
 * campaigns.index / adgroups.index 와 동일 Laravel 패턴 가정.
 *
 * 엔드포인트가 존재하지 않으면 (404 등) 호출부에서 graceful 하게 fallback.
 */
export async function fetchAdAccounts(
  query: MotivAdAccountQuery = {},
): Promise<MotivAdAccountListResponse> {
  const token = getApiToken()
  const url = `${BASE_URL}/v1/adaccounts${buildQueryString(query)}`
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    cache: 'no-store',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Motiv API ${res.status}: ${text.slice(0, 300)}`)
  }
  return (await res.json()) as MotivAdAccountListResponse
}
