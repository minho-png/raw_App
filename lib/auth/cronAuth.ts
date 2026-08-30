/**
 * Cron 엔드포인트 공용 인증 — Bearer CRON_SECRET.
 *
 * 기존 /api/cron/zero-spend-alert 가 인라인으로 갖고 있던 판별 로직을
 * 신규 cron route 에서 재사용하기 위해 분리했다.
 * (기존 route 는 동작 중이므로 건드리지 않았다 — 필요 시 별도 작업에서 통합)
 *
 * 401 원인을 구체적으로 식별해 반환한다. 비밀값은 절대 노출하지 않고
 * 길이만 디버그용으로 표시한다.
 */

export type CronAuthResult =
  | { ok: true }
  | { ok: false; reason: string; hint: string }

export function checkCronAuth(request: Request): CronAuthResult {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return {
      ok: false,
      reason: 'server_missing_secret',
      hint: 'Vercel Dashboard → Settings → Environment Variables 에 CRON_SECRET 등록 후 Redeploy 필요',
    }
  }
  const auth = request.headers.get('authorization') ?? ''
  if (!auth) {
    return {
      ok: false,
      reason: 'no_auth_header',
      hint: 'curl -H "Authorization: Bearer <CRON_SECRET>" 형식으로 호출하세요',
    }
  }
  if (!auth.startsWith('Bearer ')) {
    return {
      ok: false,
      reason: 'not_bearer',
      hint: `Authorization 헤더 시작값이 "Bearer " 이 아님. 현재 길이 ${auth.length}자`,
    }
  }
  const token = auth.slice(7).trim()
  if (token !== secret) {
    return {
      ok: false,
      reason: 'token_mismatch',
      hint: `받은 토큰 길이 ${token.length}자, 서버 CRON_SECRET 길이 ${secret.length}자. 앞뒤 공백·개행 또는 Redeploy 여부 확인`,
    }
  }
  return { ok: true }
}
