import { NextRequest, NextResponse } from 'next/server'
import { collectZeroSpendCampaigns, formatZeroSpendEmail } from '@/lib/email/zeroSpendAlert'
import { sendGmail } from '@/lib/email/gmailSender'

// Cron 전용 엔드포인트 — Vercel Cron 에서 매일 호출.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RECIPIENT = process.env.ALERT_RECIPIENT || 'minho@motiv-i.com'

/**
 * 401 원인을 정확히 식별해 반환.
 *   server_missing_secret : 서버 env CRON_SECRET 미설정
 *   no_auth_header        : Authorization 헤더 없음
 *   not_bearer            : Bearer 형식 아님
 *   token_mismatch        : 값 불일치
 * 비밀값은 절대 노출하지 않음 (길이만 디버그용으로 표시).
 */
function checkAuth(req: NextRequest): { ok: true } | { ok: false; reason: string; hint?: string } {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return {
      ok: false,
      reason: 'server_missing_secret',
      hint: 'Vercel Dashboard → Settings → Environment Variables 에 CRON_SECRET 등록 후 Redeploy 필요',
    }
  }
  const auth = req.headers.get('authorization') ?? ''
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
      hint: `받은 토큰 길이 ${token.length}자, 서버 CRON_SECRET 길이 ${secret.length}자. 값이 다르면 앞뒤 공백·개행 또는 Redeploy 필요 여부 확인`,
    }
  }
  return { ok: true }
}

export async function GET(req: NextRequest) {
  const auth = checkAuth(req)
  if (!auth.ok) {
    console.warn('[cron/zero-spend-alert] 401:', auth.reason, auth.hint)
    return NextResponse.json(
      { ok: false, error: 'unauthorized', reason: auth.reason, hint: auth.hint },
      { status: 401 },
    )
  }

  try {
    const now = new Date()
    const entries = await collectZeroSpendCampaigns(now)

    if (entries.length === 0) {
      return NextResponse.json({
        ok: true,
        sent: false,
        reason: 'no zero-spend campaigns',
        count: 0,
        ranAt: now.toISOString(),
      })
    }

    const { subject, text, html } = formatZeroSpendEmail(entries, now)
    const { id } = await sendGmail({ to: RECIPIENT, subject, text, html })

    return NextResponse.json({
      ok: true,
      sent: true,
      count: entries.length,
      messageId: id,
      recipient: RECIPIENT,
      ranAt: now.toISOString(),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[cron/zero-spend-alert] error:', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

