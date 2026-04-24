import { NextRequest, NextResponse } from 'next/server'
import { collectZeroSpendCampaigns, formatZeroSpendEmail } from '@/lib/email/zeroSpendAlert'
import { sendGmail } from '@/lib/email/gmailSender'

// Cron 전용 엔드포인트 — Vercel Cron 에서 매일 호출.
// 이 라우트는 Node.js 런타임 필수 (googleapis 는 Edge 비호환).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// 수신자: 사용자 지정
const RECIPIENT = process.env.ALERT_RECIPIENT || 'minho@motiv-i.com'

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  // Vercel Cron 은 Authorization: Bearer <CRON_SECRET> 으로 호출.
  const auth = req.headers.get('authorization') ?? ''
  return auth === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const now = new Date()
    const entries = await collectZeroSpendCampaigns(now)

    // 0건일 때는 메일 안 보냄 (시끄러움 방지). 로그만 남김.
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
