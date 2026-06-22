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

/**
 * 에러 code/message → 사용자 친화 한글 메시지. 정산 페이지의 에러 박스에 쓰임.
 * (FE-5 PM QA 점검 — `TOKEN_MISSING`/`HTTP_401` 같은 기술코드 노출 회피).
 */
export function friendlyOpenApiError(code?: string, message?: string): string {
  switch (code) {
    case 'TOKEN_MISSING':
      return 'Open API 토큰이 설정되지 않았습니다. 관리자에게 문의하거나 환경변수(OPEN_API_TOKEN)를 확인해 주세요.'
    case 'TOKEN_INVALID':
      return 'Open API 토큰 형식이 올바르지 않습니다. 재발급 후 다시 등록해 주세요.'
    case 'TIMEOUT':
      return '응답이 60초를 초과했습니다. 잠시 후 다시 시도해 주세요.'
    case 'NETWORK':
      return '네트워크 연결을 확인해 주세요. (서버 도달 불가)'
    case 'HTTP_401':
      return '토큰이 만료되었거나 무효합니다. 재발급 후 환경변수를 갱신해 주세요.'
    case 'HTTP_403':
      return '이 API 에 대한 권한이 없습니다. 관리자에게 문의해 주세요.'
    case 'HTTP_404':
      return '엔드포인트 경로 오류 또는 미배포 상태입니다. 관리자에게 문의해 주세요.'
    case 'HTTP_429':
      return '요청 한도(rate limit)에 도달했습니다. 잠시 후 다시 시도해 주세요.'
    case 'HTTP_500':
    case 'HTTP_502':
    case 'HTTP_503':
    case 'HTTP_504':
      return '업스트림 서버 일시 장애입니다. 잠시 후 재시도해 주세요.'
    case 'VALIDATION_ERROR':
    case 'BAD_REQUEST':
      return `요청 파라미터가 올바르지 않습니다.${message ? ` (${message})` : ''}`
    case 'INTERNAL':
      return `서버 내부 오류가 발생했습니다.${message ? ` (${message})` : ''}`
    default:
      // 명시 case 외의 5xx 도 업스트림 장애로 분류 (HTTP_505 등 회귀 잠금).
      if (code?.startsWith('HTTP_5')) return '업스트림 서버 일시 장애입니다. 잠시 후 재시도해 주세요.'
      return message || code || '알 수 없는 오류가 발생했습니다.'
  }
}
