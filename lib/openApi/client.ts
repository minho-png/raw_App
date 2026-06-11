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

export interface OpenApiErrorMeta {
  /** 외부 호출 대상 (host+path, 토큰·querystring 미포함) — 진단용. */
  upstream?: string
  /** 외부 응답 status. 네트워크 단계 실패면 undefined. */
  upstreamStatus?: number
  /** 첫 시도 ~ 최종 결과까지 누적 latency (ms). */
  latencyMs?: number
  /** 실제 수행된 시도 횟수. */
  attempts?: number
}

export class OpenApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: Record<string, string[]>,
    public meta?: OpenApiErrorMeta,
  ) {
    super(message)
    this.name = 'OpenApiError'
  }
}

/** 진단 로그용 — 토큰·query 제거. host+path 만 반환. */
function diagPath(url: string): string {
  try {
    const u = new URL(url)
    return `${u.host}${u.pathname}`
  } catch {
    return url
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
  const upstream = diagPath(url)
  const startedAt = Date.now()

  let res: Response
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    })
  } catch (err) {
    const latencyMs = Date.now() - startedAt
    const msg = err instanceof Error ? err.message : String(err)
    // 진단: 외부 도메인에 도달조차 못함 (DNS/방화벽/오프라인/Vercel egress 등).
    console.error(`[OpenAPI:server] ${upstream} FAIL NETWORK ${latencyMs}ms: ${msg}`)
    throw new OpenApiError(
      'NETWORK',
      `Open API NETWORK: ${msg}`,
      504,
      undefined,
      { upstream, latencyMs, attempts: 1 },
    )
  }
  const latencyMs = Date.now() - startedAt

  if (!res.ok) {
    let body: Partial<InsightsErrorBody> | null = null
    const text = await res.text().catch(() => '')
    try {
      body = text ? (JSON.parse(text) as InsightsErrorBody) : null
    } catch {
      // 본문이 JSON 이 아니면 raw text 만 사용
    }
    const meta: OpenApiErrorMeta = { upstream, upstreamStatus: res.status, latencyMs, attempts: 1 }
    if (body?.error) {
      console.error(`[OpenAPI:server] ${upstream} FAIL ${body.error.code} HTTP ${res.status} ${latencyMs}ms`)
      throw new OpenApiError(
        body.error.code,
        body.error.message,
        res.status,
        body.error.details,
        meta,
      )
    }
    console.error(`[OpenAPI:server] ${upstream} FAIL HTTP_${res.status} ${latencyMs}ms: ${text.slice(0, 200)}`)
    throw new OpenApiError(
      `HTTP_${res.status}`,
      `Open API ${res.status}: ${text.slice(0, 300)}`,
      res.status,
      undefined,
      meta,
    )
  }

  console.info(`[OpenAPI:server] ${upstream} OK ${res.status} ${latencyMs}ms`)
  return (await res.json()) as T
}
