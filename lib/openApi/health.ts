/**
 * Open API 헬스 상태 매핑 — 순수 함수 (React 의존 없음).
 *
 * useOpenApiHealth hook 에서 분리해 단위 테스트 가능하게 함 (QA 리뷰 ⑥).
 */

export type OpenApiHealthStatus =
  | 'idle'
  | 'loading'
  | 'ok'
  | 'token_missing'   // 503 — env 미설정
  | 'unauthorized'    // 401 — 토큰 무효/만료
  | 'forbidden'       // 403 — 권한 부족
  | 'error'           // 그 외 (네트워크 / 5xx)

/**
 * `/me` proxy 의 (HTTP status, error code) → 헬스 상태.
 *
 *  - TOKEN_MISSING code 또는 503 → token_missing (env 미설정)
 *  - 401 → unauthorized, 403 → forbidden
 *  - 그 외 → error
 */
export function mapHealthStatus(httpStatus: number, code: string | undefined): OpenApiHealthStatus {
  if (code === 'TOKEN_MISSING' || httpStatus === 503) return 'token_missing'
  if (httpStatus === 401) return 'unauthorized'
  if (httpStatus === 403) return 'forbidden'
  return 'error'
}
