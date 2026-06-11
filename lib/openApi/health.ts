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
  | 'not_found'       // 404 — 엔드포인트 미배포/경로 오류
  | 'timeout'         // code TIMEOUT (status 504) — 30초 초과
  | 'network'         // code NETWORK — 서버 연결 실패
  | 'server_error'    // 5xx (≠503) — 업스트림 일시 장애
  | 'error'           // 그 외 분류 불가

/**
 * `/me` proxy 의 (HTTP status, error code) → 헬스 상태.
 *
 * "정확한 원인" 노출을 위해 'error' 한 통을 세분화 (10인 진단 ④⑤ 반영).
 * client.ts 가 이미 code(TIMEOUT/NETWORK/HTTP_4xx)와 status 를 구분해 보내므로
 * 본 함수가 분기만 보강하면 추가 데이터 배관 불필요.
 *
 * 주의: timeout/network 는 둘 다 status 504 라 **code 로만** 구별 가능 →
 *       반드시 (httpStatus, code) 둘 다 입력.
 *
 * 우선순위: 인증/설정(503/401/403) → 원인코드(TIMEOUT/NETWORK) → status(404/5xx) → 잔여.
 */
export function mapHealthStatus(httpStatus: number, code: string | undefined): OpenApiHealthStatus {
  if (code === 'TOKEN_MISSING' || httpStatus === 503) return 'token_missing'
  if (httpStatus === 401) return 'unauthorized'
  if (httpStatus === 403) return 'forbidden'
  if (code === 'TIMEOUT') return 'timeout'
  if (code === 'NETWORK') return 'network'
  if (httpStatus === 404) return 'not_found'
  if (httpStatus >= 500) return 'server_error'
  return 'error'
}
