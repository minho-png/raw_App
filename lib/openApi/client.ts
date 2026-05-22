/**
 * Crosstarget Open API 서버사이드 fetch wrapper.
 *
 * 토큰은 `OPEN_API_TOKEN` env 에서 로드 — 브라우저 노출 방지를 위해
 * 반드시 server context (route handler / RSC) 에서만 호출.
 * 클라이언트 컴포넌트에서는 `/api/open-api/*` proxy 를 거쳐야 함.
 */

import type { InsightsErrorBody } from './types'

const DEFAULT_BASE_URL = 'https://manage2.crosstarget.co.kr/api/v1'

function getApiToken(): string {
  const token = process.env.OPEN_API_TOKEN
  if (!token) {
    throw new OpenApiError(
      'TOKEN_MISSING',
      'OPEN_API_TOKEN 환경변수가 설정되지 않았습니다. Crosstarget 우측 상단 프로필 → API 토큰 메뉴에서 발급 후 .env.local 및 Vercel 환경변수에 추가하세요.',
      503,
    )
  }
  return token
}

function getBaseUrl(): string {
  return process.env.OPEN_API_BASE_URL || DEFAULT_BASE_URL
}

export class OpenApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: Record<string, string[]>,
  ) {
    super(message)
    this.name = 'OpenApiError'
  }
}

function buildQueryString(query: Record<string, string | number | undefined | null>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    params.set(key, String(value))
  }
  const s = params.toString()
  return s ? `?${s}` : ''
}

/**
 * Open API 호출 — Bearer token, JSON 응답, 표준 에러 정규화.
 *
 * 에러 변환 규칙:
 *   - 토큰 미설정: OpenApiError('TOKEN_MISSING', 503)
 *   - 응답 4xx/5xx: 본문이 InsightsErrorBody 형식이면 그 code/message 사용,
 *     그렇지 않으면 status 와 raw 본문 일부로 fallback.
 */
export async function openApiFetch<T>(
  path: string,
  query?: Record<string, string | number | undefined | null>,
): Promise<T> {
  const token = getApiToken()
  const base = getBaseUrl()
  const url = `${base}${path}${query ? buildQueryString(query) : ''}`

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  })

  if (!res.ok) {
    let body: Partial<InsightsErrorBody> | null = null
    const text = await res.text().catch(() => '')
    try {
      body = text ? (JSON.parse(text) as InsightsErrorBody) : null
    } catch {
      // 본문이 JSON 이 아니면 raw text 만 사용
    }
    if (body?.error) {
      throw new OpenApiError(
        body.error.code,
        body.error.message,
        res.status,
        body.error.details,
      )
    }
    throw new OpenApiError(
      `HTTP_${res.status}`,
      `Open API ${res.status}: ${text.slice(0, 300)}`,
      res.status,
    )
  }

  return (await res.json()) as T
}
