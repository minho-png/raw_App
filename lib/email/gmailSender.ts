import nodemailer from 'nodemailer'

/**
 * Gmail SMTP 송신 모듈 — 앱 비밀번호 방식.
 *
 * 기본 계정 env vars:
 *   GMAIL_USER          — 송신자 Gmail 주소 (예: your-bot@gmail.com)
 *   GMAIL_APP_PASSWORD  — Google 계정 앱 비밀번호 16자 (공백 제거)
 *
 * 세팅 절차 (최소 2단계):
 *   1) 송신자 Gmail 계정에서 **2단계 인증 활성화**
 *      (myaccount.google.com → 보안 → 2단계 인증)
 *   2) **앱 비밀번호 생성**
 *      (myaccount.google.com → 보안 → 앱 비밀번호 → 앱: 메일, 기기: 기타(Vercel))
 *      → 16자 비밀번호 복사 → GMAIL_APP_PASSWORD 에 공백 제거하고 입력
 *
 * 장점: OAuth client 생성·Playground·refresh token 불필요. Gmail API 쿼터도 SMTP 와 동일.
 * 제한: 앱 비밀번호는 개인 Google 계정 + 2FA 활성 계정에서만 발급 가능
 *      (Workspace 는 관리자가 Less secure apps 또는 앱 비밀번호 허용 필요).
 *
 * ── 계정 분리 (2026-08 추가) ────────────────────────────────
 * sendGmail 에 `account` 를 넘기면 그 계정으로 발송한다. 기능별로 발신 계정을
 * 나눠야 할 때 사용 (예: Publica 에이전트는 전용 봇 계정으로만 발송).
 * 생략하면 기존과 동일하게 GMAIL_USER 를 쓴다 — 기존 호출부 동작 불변.
 */

/** 발신 계정 자격증명. */
export interface MailAccount {
  user: string
  /** 앱 비밀번호. 공백은 자동 제거된다. */
  pass: string
}

// 계정별 transporter 재사용 — 매 호출 커넥션 생성 방지.
const transporters = new Map<string, nodemailer.Transporter>()

function getTransporter(account: MailAccount): nodemailer.Transporter {
  const cached = transporters.get(account.user)
  if (cached) return cached

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: account.user, pass: account.pass.replace(/\s/g, '') }, // 공백 자동 제거
  })
  transporters.set(account.user, transporter)
  return transporter
}

/** env 의 기본 계정 (GMAIL_USER). 미설정 시 throw. */
function defaultAccount(): MailAccount {
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD
  if (!user || !pass) {
    throw new Error('Gmail 환경변수 누락: GMAIL_USER, GMAIL_APP_PASSWORD')
  }
  return { user, pass }
}

interface SendArgs {
  to: string
  subject: string
  text: string        // 평문 본문
  html?: string       // 옵션: HTML 본문
  /** 발신 계정 지정. 생략 시 GMAIL_USER 사용. */
  account?: MailAccount
}

export async function sendGmail({ to, subject, text, html, account }: SendArgs): Promise<{ id: string; from: string }> {
  const sender = account ?? defaultAccount()
  const t = getTransporter(sender)
  const info = await t.sendMail({ from: sender.user, to, subject, text, html })
  return { id: info.messageId ?? '', from: sender.user }
}
