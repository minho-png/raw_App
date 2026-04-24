import nodemailer from 'nodemailer'

/**
 * Gmail SMTP 송신 모듈 — 앱 비밀번호 방식.
 *
 * 필요한 env vars:
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
 */

let transporter: nodemailer.Transporter | null = null

function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD
  if (!user || !pass) {
    throw new Error('Gmail 환경변수 누락: GMAIL_USER, GMAIL_APP_PASSWORD')
  }
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass: pass.replace(/\s/g, '') }, // 공백 자동 제거
  })
  return transporter
}

interface SendArgs {
  to: string
  subject: string
  text: string        // 평문 본문
  html?: string       // 옵션: HTML 본문
}

export async function sendGmail({ to, subject, text, html }: SendArgs): Promise<{ id: string }> {
  const from = process.env.GMAIL_USER
  if (!from) throw new Error('GMAIL_USER 환경변수 누락')

  const t = getTransporter()
  const info = await t.sendMail({ from, to, subject, text, html })
  return { id: info.messageId ?? '' }
}
