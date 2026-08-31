import { NextRequest, NextResponse } from 'next/server'
import { checkCronAuth } from '@/lib/auth/cronAuth'
import { fetchMessages, imapConfigFromEnv } from '@/lib/email/imapReader'
import { sendPublicaAlert, publicaSenderFromEnv, publicaRecipientFromEnv } from '@/lib/email/publicaSender'
import { analyzeMessages, attachLlmInsight, detectOptionsFromEnv } from '@/lib/publica/reportAnalyzer'
import { formatAlertEmail } from '@/lib/publica/alertFormatter'

/**
 * Publica 데일리 리포트 분석 에이전트 — Vercel Cron 전용 엔드포인트.
 *
 * 흐름: 봇 메일함 IMAP 조회 → CSV 첨부 파싱 → 규칙 탐지 → (선택) LLM 요약 → 결과 메일 발송.
 *
 * 필수 env: CRON_SECRET, PUBLICA_IMAP_USER, PUBLICA_IMAP_PASSWORD,
 *           PUBLICA_ALERT_RECIPIENT
 * 발신은 봇 계정(PUBLICA_IMAP_*)으로 나간다 — 공용 GMAIL_USER 는 쓰지 않는다.
 *
 * `?dryRun=1` 을 붙이면 조회·파싱·탐지까지만 하고 **메일을 보내지 않는다.**
 * 설정 직후 배선(전달 필터 / IMAP 접속 / 첨부 인식)을 확인하는 용도.
 *
 * 자세한 설정은 docs/PUBLICA_DAILY_REPORT_AGENT.md 참고.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// IMAP 조회 + 3개 CSV 파싱 + LLM 호출까지 여유를 둔다 (Vercel 기본 10s 로는 부족).
export const maxDuration = 60

/** 리포트 미수신도 이상 신호로 간주할지 (기본 true — 무소식이 곧 장애일 수 있음). */
const ALERT_ON_MISSING = process.env.PUBLICA_ALERT_ON_MISSING !== 'false'
/** 이상이 없어도 매일 발송할지 (기본 false — 이상 있을 때만 알림). */
const ALWAYS_SEND = process.env.PUBLICA_ALWAYS_SEND === 'true'

function lookbackHours(): number {
  const n = Number(process.env.PUBLICA_LOOKBACK_HOURS)
  return Number.isFinite(n) && n > 0 ? n : 26 // 하루 1회 발송 + 지연 여유
}

export async function GET(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) {
    console.warn('[cron/publica-daily-report] 401:', auth.reason, auth.hint)
    return NextResponse.json(
      { ok: false, error: 'unauthorized', reason: auth.reason, hint: auth.hint },
      { status: 401 },
    )
  }

  // dry-run: 조회·파싱·탐지만 하고 발송하지 않는다 (설정 검증용).
  const dryRun = req.nextUrl.searchParams.get('dryRun') === '1'

  // 메일 설정은 IMAP 조회보다 먼저 검증한다 — 다 읽고 나서 보낼 곳이 없으면 헛수고.
  // publicaSenderFromEnv 는 공용 GMAIL_USER 로 폴백하지 않고, 전용 계정이
  // 없으면 여기서 막는다 (잘못된 계정으로 나가는 것보다 안 나가는 편이 낫다).
  let to = ''
  let senderAddress = ''
  let mailConfigError = ''
  try {
    to = publicaRecipientFromEnv()
    senderAddress = publicaSenderFromEnv().user
  } catch (e) {
    mailConfigError = e instanceof Error ? e.message : String(e)
    // dry-run 은 메일을 보내지 않으므로 발송 설정이 아직 없어도 IMAP 배선을
    // 먼저 확인할 수 있게 계속 진행한다. 실제 실행은 여기서 중단.
    if (!dryRun) {
      console.error('[cron/publica-daily-report] mail config:', mailConfigError)
      return NextResponse.json({ ok: false, error: 'mail_config', hint: mailConfigError }, { status: 500 })
    }
  }

  const now = new Date()
  try {
    const since = new Date(now.getTime() - lookbackHours() * 60 * 60 * 1000)
    const messages = await fetchMessages(imapConfigFromEnv(), {
      since,
      from: process.env.PUBLICA_SENDER_FILTER?.trim() || 'publica',
      limit: Number(process.env.PUBLICA_MAX_MESSAGES) || 20,
    })

    // ── 리포트 미수신 — 침묵도 장애 신호로 처리 ────────────────
    if (messages.length === 0) {
      if (!ALERT_ON_MISSING) {
        return NextResponse.json({ ok: true, sent: false, reason: 'no_messages', ranAt: now.toISOString() })
      }
      const subject = `[Publica] 리포트 미수신 — 최근 ${lookbackHours()}시간`
      const text = `최근 ${lookbackHours()}시간 동안 Publica 리포트 메일이 수신되지 않았습니다.\n`
        + `조회 기준: ${since.toISOString()} 이후, 발신자 필터 "${process.env.PUBLICA_SENDER_FILTER?.trim() || 'publica'}"\n\n`
        + `확인 사항: Publica 발송 중단 여부 / 개인 메일함의 자동 전달 규칙 / 봇 메일함 수신 상태`
      if (dryRun) {
        return NextResponse.json({
          ok: true, dryRun: true, sent: false, reason: 'no_messages',
          wouldSend: true, subject, from: senderAddress, recipient: to,
          mailConfigError: mailConfigError || undefined, ranAt: now.toISOString(),
        })
      }
      const { id, from } = await sendPublicaAlert({ to, subject, text, html: `<p>${text.replace(/\n/g, '<br/>')}</p>` })
      return NextResponse.json({
        ok: true, sent: true, reason: 'no_messages', messageId: id, from, recipient: to, ranAt: now.toISOString(),
      })
    }

    // ── 분석 ──────────────────────────────────────────────────
    const base = analyzeMessages(messages, detectOptionsFromEnv())
    const analysis = await attachLlmInsight(base)

    const hasFindings = analysis.counts.critical > 0 || analysis.counts.warning > 0
    const shouldSend = hasFindings || ALWAYS_SEND || analysis.warnings.length > 0

    if (!shouldSend && !dryRun) {
      return NextResponse.json({
        ok: true,
        sent: false,
        reason: 'no_anomalies',
        from: senderAddress,
        messages: messages.length,
        reports: analysis.reports.length,
        ranAt: now.toISOString(),
      })
    }

    const { subject, text, html } = formatAlertEmail(analysis, now)

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        sent: false,
        wouldSend: shouldSend,
        subject,
        from: senderAddress,
        recipient: to,
        mailConfigError: mailConfigError || undefined,
        messages: messages.map(m => ({
          from: m.from,
          subject: m.subject,
          receivedAt: m.receivedAt.toISOString(),
          attachments: m.attachments.map(a => a.filename),
        })),
        reports: analysis.reports.map(r => ({ kind: r.kind, filename: r.filename, rows: r.rows.length })),
        counts: analysis.counts,
        anomalies: analysis.anomalies,
        truncated: analysis.truncated,
        warnings: analysis.warnings,
        preview: text,
        ranAt: now.toISOString(),
      })
    }

    const { id, from } = await sendPublicaAlert({ to, subject, text, html })

    return NextResponse.json({
      ok: true,
      sent: true,
      messageId: id,
      from,
      recipient: to,
      messages: messages.length,
      reports: analysis.reports.map(r => r.kind),
      counts: analysis.counts,
      truncated: analysis.truncated,
      warnings: analysis.warnings,
      ranAt: now.toISOString(),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[cron/publica-daily-report] error:', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
