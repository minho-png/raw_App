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
  /** 실제 수행된 시도 횟수 (재시도 포함). */
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

// ── 견고성 가드 (전문가 리뷰 ④⑩ 반영) ──────────────────────────
// motivApi/statsService.ts 의 30초 AbortController 패턴과 일관. 업스트림
// (manage2.crosstarget.co.kr) 지연 시 Vercel function 이 플랫폼 한도까지
// 무기한 대기하던 문제 방어. 5xx/네트워크 한정 지수 backoff 재시도.
const DEFAULT_TIMEOUT_MS = 30_000
const MAX_RETRIES = 2  // 최초 1회 + 재시도 2회 = 총 3회

function isRetriableStatus(status: number): boolean {
  // 408 Request Timeout, 429 Too Many Requests, 5xx — 일시 장애로 간주.
  return status === 408 || status === 429 || status >= 500
}

/**
 * 단일 GET 시도 — timeout signal 부착. 호출자(openApiFetch)가 재시도 래핑.
 */
async function fetchOnce(url: string, token: string, accept: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: accept },
      cache: 'no-store',
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

/** 4xx/5xx 응답을 OpenApiError 로 정규화 (JSON/CSV 라우트 공용). */
async function toOpenApiError(res: Response, meta: OpenApiErrorMeta): Promise<OpenApiError> {
  let body: Partial<InsightsErrorBody> | null = null
  const text = await res.text().catch(() => '')
  try {
    body = text ? (JSON.parse(text) as InsightsErrorBody) : null
  } catch {
    // 본문이 JSON 이 아니면 raw text 만 사용
  }
  if (body?.error) {
    return new OpenApiError(body.error.code, body.error.message, res.status, body.error.details, meta)
  }
  return new OpenApiError(
    `HTTP_${res.status}`,
    `Open API ${res.status}: ${text.slice(0, 300)}`,
    res.status,
    undefined,
    meta,
  )
}

/**
 * 공통 GET — timeout + 재시도 + 에러 정규화 + 진단 로그. JSON/CSV 응답은 caller 가 parse.
 *
 * 재시도: isRetriableStatus 또는 네트워크/abort 예외에 한해 지수 backoff
 * (250ms · 500ms). 4xx(401/403/422 등)는 즉시 throw — 재시도 무의미.
 *
 * 진단 로그:
 *   - 성공: `[OpenAPI:server] {host/path} OK {status} {ms} attempt={n}`
 *   - 재시도: `[OpenAPI:server] {host/path} retry {reason} attempt={n}`
 *   - 실패: `[OpenAPI:server] {host/path} FAIL {code} {ms} attempt={n}`
 *   토큰·querystring 미포함.
 */
async function openApiRequest(
  path: string,
  query: Record<string, string | number | undefined | null> | undefined,
  accept: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<{ res: Response; meta: OpenApiErrorMeta }> {
  const token = getApiToken()
  const base = getBaseUrl()
  const url = `${base}${path}${query ? buildQueryString(query) : ''}`
  const upstream = diagPath(url)
  const startedAt = Date.now()

  let lastErr: unknown
  let lastUpstreamStatus: number | undefined
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const tryStart = Date.now()
    try {
      const res = await fetchOnce(url, token, accept, timeoutMs)
      const tryLatency = Date.now() - tryStart
      lastUpstreamStatus = res.status
      if (res.ok) {
        console.info(`[OpenAPI:server] ${upstream} OK ${res.status} ${tryLatency}ms attempt=${attempt + 1}`)
        return { res, meta: { upstream, upstreamStatus: res.status, latencyMs: Date.now() - startedAt, attempts: attempt + 1 } }
      }
      if (attempt < MAX_RETRIES && isRetriableStatus(res.status)) {
        console.warn(`[OpenAPI:server] ${upstream} retry HTTP_${res.status} ${tryLatency}ms attempt=${attempt + 1}`)
        await new Promise(r => setTimeout(r, 250 * 2 ** attempt))
        continue
      }
      const meta: OpenApiErrorMeta = { upstream, upstreamStatus: res.status, latencyMs: Date.now() - startedAt, attempts: attempt + 1 }
      const err = await toOpenApiError(res, meta)
      console.error(`[OpenAPI:server] ${upstream} FAIL ${err.code} HTTP ${res.status} ${tryLatency}ms attempt=${attempt + 1}`)
      throw err
    } catch (err) {
      // OpenApiError(4xx)는 즉시 전파. 네트워크/abort 만 재시도.
      if (err instanceof OpenApiError) throw err
      lastErr = err
      const tryLatency = Date.now() - tryStart
      const msg = err instanceof Error ? err.message : String(err)
      const reason = err instanceof Error && err.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK'
      if (attempt < MAX_RETRIES) {
        console.warn(`[OpenAPI:server] ${upstream} retry ${reason} ${tryLatency}ms attempt=${attempt + 1}: ${msg}`)
        await new Promise(r => setTimeout(r, 250 * 2 ** attempt))
        continue
      }
      console.error(`[OpenAPI:server] ${upstream} FAIL ${reason} ${tryLatency}ms attempt=${attempt + 1}: ${msg}`)
      throw new OpenApiError(
        reason,
        `Open API ${reason}: ${msg}`,
        504,
        undefined,
        { upstream, upstreamStatus: lastUpstreamStatus, latencyMs: Date.now() - startedAt, attempts: attempt + 1 },
      )
    }
  }
  // 도달 불가 (루프가 항상 return/throw) — 타입 만족용.
  throw lastErr instanceof Error ? lastErr : new OpenApiError('NETWORK', 'Open API 요청 실패', 504)
}

/**
 * Open API 호출 — Bearer token, JSON 응답, 표준 에러 정규화.
 *
 * 에러 변환 규칙:
 *   - 토큰 미설정: OpenApiError('TOKEN_MISSING', 503)
 *   - 타임아웃/네트워크: OpenApiError('TIMEOUT'|'NETWORK', 504)
 *   - 응답 4xx/5xx: 본문이 InsightsErrorBody 형식이면 그 code/message 사용,
 *     그렇지 않으면 status 와 raw 본문 일부로 fallback.
 */
export async function openApiFetch<T>(
  path: string,
  query?: Record<string, string | number | undefined | null>,
): Promise<T> {
  const { res } = await openApiRequest(path, query, 'application/json')
  return (await res.json()) as T
}

/**
 * Open API 호출 — text 응답 (CSV 등). UTF-8 BOM 보존을 위해 res.text() 그대로 반환.
 *
 * Phase 2 의 `/settlements?output=csv` 가 사용. JSON 경로와 동일한 timeout/재시도/
 * 에러 정규화를 공유 (openApiRequest).
 */
export async function openApiFetchText(
  path: string,
  query?: Record<string, string | number | undefined | null>,
  accept = 'text/csv',
): Promise<string> {
  const { res } = await openApiRequest(path, query, accept)
  return await res.text()
}
