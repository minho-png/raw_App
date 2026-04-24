import { google } from 'googleapis'

/**
 * Gmail API 송신 모듈 — OAuth 2.0 refresh token 방식.
 *
 * 필요한 env vars:
 *   GMAIL_CLIENT_ID      — Google Cloud OAuth 2.0 Client ID (Desktop 또는 Web type)
 *   GMAIL_CLIENT_SECRET  — 위 클라이언트 시크릿
 *   GMAIL_REFRESH_TOKEN  — OAuth Playground 등으로 최초 1회 발급한 refresh token
 *   GMAIL_SENDER_EMAIL   — 송신자 주소 (OAuth 에 연결된 Gmail 계정)
 *
 * 최초 세팅 절차:
 *   1) Google Cloud Console → OAuth 동의 화면 + OAuth 2.0 Client 생성
 *      · Gmail API 활성화 (APIs & Services → Library → Gmail API)
 *      · 범위(scope): https://www.googleapis.com/auth/gmail.send
 *   2) OAuth Playground (https://developers.google.com/oauthplayground) 에서
 *      Settings → Use your own OAuth credentials 체크, 위 Client ID/Secret 입력
 *   3) Scope 란에 위 scope 직접 입력 → Authorize APIs → 계정 선택/동의
 *   4) Exchange authorization code → refresh_token 복사 → GMAIL_REFRESH_TOKEN 에 설정
 */

function getOAuthClient() {
  const clientId     = process.env.GMAIL_CLIENT_ID
  const clientSecret = process.env.GMAIL_CLIENT_SECRET
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Gmail OAuth 환경변수 누락: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN')
  }
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret)
  oauth2.setCredentials({ refresh_token: refreshToken })
  return oauth2
}

interface SendArgs {
  to: string
  subject: string
  text: string       // 평문 본문
  html?: string      // 옵션: HTML 본문
}

/**
 * Gmail API users.messages.send — RFC 2822 raw 메시지 base64url 전송.
 */
export async function sendGmail({ to, subject, text, html }: SendArgs): Promise<{ id: string }> {
  const sender = process.env.GMAIL_SENDER_EMAIL
  if (!sender) throw new Error('GMAIL_SENDER_EMAIL 환경변수 누락')

  const auth = getOAuthClient()
  const gmail = google.gmail({ version: 'v1', auth })

  // RFC 2822 메시지 구성 (한글 subject 지원: UTF-8 base64)
  const subjectEncoded = `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`
  const boundary = `bnd_${Date.now().toString(36)}`

  const parts: string[] = []
  parts.push(`From: ${sender}`)
  parts.push(`To: ${to}`)
  parts.push(`Subject: ${subjectEncoded}`)
  parts.push(`MIME-Version: 1.0`)
  if (html) {
    parts.push(`Content-Type: multipart/alternative; boundary="${boundary}"`)
    parts.push('')
    parts.push(`--${boundary}`)
    parts.push(`Content-Type: text/plain; charset="UTF-8"`)
    parts.push(`Content-Transfer-Encoding: base64`)
    parts.push('')
    parts.push(Buffer.from(text, 'utf8').toString('base64'))
    parts.push(`--${boundary}`)
    parts.push(`Content-Type: text/html; charset="UTF-8"`)
    parts.push(`Content-Transfer-Encoding: base64`)
    parts.push('')
    parts.push(Buffer.from(html, 'utf8').toString('base64'))
    parts.push(`--${boundary}--`)
  } else {
    parts.push(`Content-Type: text/plain; charset="UTF-8"`)
    parts.push(`Content-Transfer-Encoding: base64`)
    parts.push('')
    parts.push(Buffer.from(text, 'utf8').toString('base64'))
  }

  const raw = Buffer.from(parts.join('\r\n'), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  })
  return { id: res.data.id ?? '' }
}
