/**
 * IMAP 수신 모듈 — Repository 계층 (데이터 접근만, 비즈니스 로직 없음).
 *
 * 필요한 env vars:
 *   PUBLICA_IMAP_HOST      — 기본 imap.gmail.com
 *   PUBLICA_IMAP_PORT      — 기본 993
 *   PUBLICA_IMAP_USER      — 봇 메일함 주소
 *   PUBLICA_IMAP_PASSWORD  — 봇 계정 앱 비밀번호 (공백 자동 제거)
 *
 * 설계 원칙:
 *   - 메일함을 **읽기 전용**으로 연다. 플래그·삭제 등 변경을 하지 않으므로
 *     사람이 보는 받은편지함 상태에 영향이 없다 (재실행도 안전).
 *   - 개인 메일함이 아니라 **리포트 전용 봇 메일함**을 대상으로 한다.
 *     (개인 계정에서 Publica 발신자만 이 주소로 자동 전달 → 개인 메일 미노출)
 */

import { ImapFlow } from 'imapflow'
import type { PublicaMessage, PublicaAttachment } from '@/lib/publica/types'

export interface ImapConfig {
  host: string
  port: number
  user: string
  password: string
  /** 조회 대상 메일함. 기본 INBOX. */
  mailbox: string
}

export interface FetchCriteria {
  /** 이 시각 이후 수신된 메일만 조회. */
  since: Date
  /** 발신자 부분 일치 (IMAP SEARCH FROM). */
  from?: string
  /** 한 번에 처리할 최대 메일 수 — 폭주 방어. */
  limit: number
}

/** env 에서 IMAP 설정을 읽는다. 필수값 누락 시 throw. */
export function imapConfigFromEnv(): ImapConfig {
  const user = process.env.PUBLICA_IMAP_USER?.trim()
  const password = process.env.PUBLICA_IMAP_PASSWORD
  if (!user || !password) {
    throw new Error('IMAP 환경변수 누락: PUBLICA_IMAP_USER, PUBLICA_IMAP_PASSWORD')
  }
  return {
    host: process.env.PUBLICA_IMAP_HOST?.trim() || 'imap.gmail.com',
    port: Number(process.env.PUBLICA_IMAP_PORT) || 993,
    user,
    password: password.replace(/\s/g, ''), // Gmail 앱 비밀번호는 4자씩 띄어 표기됨
    mailbox: process.env.PUBLICA_IMAP_MAILBOX?.trim() || 'INBOX',
  }
}

/** bodyStructure 노드 (imapflow 의 MessageStructureObject 중 필요한 부분만). */
interface StructureNode {
  part?: string
  disposition?: string
  dispositionParameters?: Record<string, string>
  parameters?: Record<string, string>
  childNodes?: StructureNode[]
}

/** 첨부 후보(part 번호 + 파일명)를 재귀 수집. */
function collectAttachmentParts(node: StructureNode | undefined): { part: string; filename: string }[] {
  if (!node) return []
  const out: { part: string; filename: string }[] = []

  const filename = node.dispositionParameters?.filename ?? node.parameters?.name
  const isAttachment = node.disposition?.toLowerCase() === 'attachment' || Boolean(filename)
  if (node.part && isAttachment && filename) {
    out.push({ part: node.part, filename })
  }
  for (const child of node.childNodes ?? []) {
    out.push(...collectAttachmentParts(child))
  }
  return out
}

/**
 * 조건에 맞는 메일과 첨부를 가져온다.
 *
 * 실패 시 throw — 호출부(cron route)가 500 으로 보고한다.
 * 연결은 성공/실패와 무관하게 반드시 정리된다.
 */
export async function fetchMessages(
  config: ImapConfig,
  criteria: FetchCriteria,
): Promise<PublicaMessage[]> {
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: true,
    auth: { user: config.user, pass: config.password },
    logger: false, // imapflow 기본 로거는 stdout 에 JSON 을 쏟아낸다.
  })

  const messages: PublicaMessage[] = []
  await client.connect()
  try {
    // readOnly — 메일 플래그를 건드리지 않아 사람이 보는 상태에 영향 없음.
    const lock = await client.getMailboxLock(config.mailbox, { readOnly: true })
    try {
      const uids = await client.search(
        { since: criteria.since, ...(criteria.from ? { from: criteria.from } : {}) },
        { uid: true },
      )
      if (!uids || uids.length === 0) return []

      // 최신 메일 우선으로 상한 적용.
      const targets = [...uids].sort((a, b) => b - a).slice(0, criteria.limit)

      for await (const msg of client.fetch(
        targets,
        { envelope: true, bodyStructure: true },
        { uid: true },
      )) {
        const parts = collectAttachmentParts(msg.bodyStructure as StructureNode | undefined)
        const attachments: PublicaAttachment[] = []

        if (parts.length > 0) {
          // downloadMany 는 transfer-encoding 을 해제한 Buffer 를 돌려준다.
          const downloaded = await client.downloadMany(
            String(msg.uid),
            parts.map(p => p.part),
            { uid: true },
          )
          for (const { part, filename } of parts) {
            const content = downloaded?.[part]?.content
            if (content) attachments.push({ filename, content })
          }
        }

        const fromAddress = msg.envelope?.from?.[0]?.address ?? ''
        messages.push({
          uid: msg.uid,
          subject: msg.envelope?.subject ?? '',
          from: fromAddress,
          receivedAt: msg.envelope?.date ?? new Date(),
          attachments,
        })
      }
    } finally {
      lock.release()
    }
  } finally {
    // logout 실패가 조회 결과를 덮어쓰지 않도록 흡수.
    await client.logout().catch(() => client.close())
  }

  // 수신 시각 오름차순 — 분석·표시 순서를 안정화.
  messages.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime())
  return messages
}
