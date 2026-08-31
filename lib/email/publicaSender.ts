/**
 * Publica 에이전트 전용 발신 — Repository/Infra 계층.
 *
 * 이 모듈의 존재 이유는 하나다: **Publica 알림이 공용 GMAIL_USER 계정으로
 * 나가지 않도록 구조적으로 막는 것.**
 *
 * 기존 zero-spend 알림은 GMAIL_USER 로 발송하지만, Publica 에이전트는
 * 전용 봇 계정만 쓴다. 그래서 여기서는 GMAIL_USER 로 **폴백하지 않으며**,
 * 전용 계정이 없으면 발송 대신 명확한 에러를 낸다 (조용히 공용 계정으로
 * 새어나가는 것보다 안 나가는 편이 낫다).
 *
 * env vars:
 *   PUBLICA_SMTP_USER      — 발신 봇 계정. 생략 시 PUBLICA_IMAP_USER 사용
 *   PUBLICA_SMTP_PASSWORD  — 앱 비밀번호. 생략 시 PUBLICA_IMAP_PASSWORD 사용
 *   PUBLICA_ALERT_RECIPIENT— 수신 주소 (필수, 폴백 없음)
 *
 * 봇 계정 하나로 수신(IMAP)과 발신(SMTP)을 겸하는 것이 기본 구성이라
 * 보통은 PUBLICA_IMAP_* 만 넣으면 된다. 발신을 다른 계정으로 분리하고
 * 싶을 때만 PUBLICA_SMTP_* 를 따로 지정한다.
 */

import { sendGmail, type MailAccount } from './gmailSender'

/** 공용 계정과 같은 주소를 발신자로 쓰는 것을 허용할지 (기본 불허). */
function sharedSenderAllowed(): boolean {
  return process.env.PUBLICA_ALLOW_SHARED_SENDER === 'true'
}

/**
 * Publica 전용 발신 계정을 해석한다.
 * 미설정이거나 공용 계정과 동일하면 throw — 잘못된 계정으로 나가지 않게.
 */
export function publicaSenderFromEnv(): MailAccount {
  const user = (process.env.PUBLICA_SMTP_USER || process.env.PUBLICA_IMAP_USER || '').trim()
  const pass = process.env.PUBLICA_SMTP_PASSWORD || process.env.PUBLICA_IMAP_PASSWORD || ''

  if (!user || !pass) {
    throw new Error(
      'Publica 전용 발신 계정 미설정: PUBLICA_SMTP_USER/PUBLICA_SMTP_PASSWORD '
      + '(또는 PUBLICA_IMAP_USER/PUBLICA_IMAP_PASSWORD) 를 등록하세요. '
      + '공용 GMAIL_USER 계정으로는 발송하지 않습니다.',
    )
  }

  const shared = (process.env.GMAIL_USER || '').trim()
  if (shared && user.toLowerCase() === shared.toLowerCase() && !sharedSenderAllowed()) {
    throw new Error(
      `Publica 발신자(${user})가 공용 GMAIL_USER 와 동일합니다. `
      + 'Publica 알림은 전용 봇 계정으로만 발송하도록 되어 있습니다. '
      + '전용 계정을 지정하거나, 의도한 구성이라면 PUBLICA_ALLOW_SHARED_SENDER=true 로 허용하세요.',
    )
  }

  return { user, pass }
}

/** 알림 수신 주소. 폴백 없음 — 엉뚱한 사람에게 가지 않도록 명시 설정을 요구한다. */
export function publicaRecipientFromEnv(): string {
  const to = (process.env.PUBLICA_ALERT_RECIPIENT || '').trim()
  if (!to) {
    throw new Error('PUBLICA_ALERT_RECIPIENT 미설정: Publica 분석 결과를 받을 주소를 등록하세요.')
  }
  return to
}

/** Publica 알림 발송 — 전용 계정으로만 나간다. */
export async function sendPublicaAlert(args: {
  to: string
  subject: string
  text: string
  html?: string
}): Promise<{ id: string; from: string }> {
  return sendGmail({ ...args, account: publicaSenderFromEnv() })
}
