/**
 * `/api/v1/me` helper — 토큰 헬스체크.
 *
 * 응답 200 이면 토큰 유효. 401/403/503 은 client 가 OpenApiError 로 throw —
 * caller (`useOpenApiHealth`) 는 status 분기만 필요.
 *
 * 별도 페이징/필터 없음. body 는 단순 식별 정보 (id, mb_id, name, roles).
 */

import { openApiFetch } from './client'
import type { MeResponse } from './types'

const ME_PATH = '/me'

export async function fetchMe(): Promise<MeResponse> {
  return openApiFetch<MeResponse>(ME_PATH)
}
