import { NextRequest, NextResponse } from 'next/server'
import clientPromise from '@/lib/mongodb'
import { UserRepository } from '@/services/userRepository'
import { createSessionToken, COOKIE_NAME } from '@/lib/auth/session'

/** 기본 관리자 계정 (사용자 요청 2026-09-14 — 로그인 초기화). */
const DEFAULT_ADMIN_ID = 'test1234'
const DEFAULT_ADMIN_PW = 'test1234'

/**
 * 기본 관리자(test1234/test1234)를 항상 사용 가능하게 보장합니다.
 * - 계정이 없으면 생성, 비밀번호가 다르면 재설정 (self-healing).
 * - test1234 계정만 대상 — 다른 사용자 계정은 건드리지 않습니다.
 * - 정상 로그인 경로에서는 verify 성공 시 즉시 return 하여 쓰기 없음.
 */
async function ensureDefaultAdmin(repo: UserRepository): Promise<void> {
  try {
    const ok = await repo.verifyCredentials(DEFAULT_ADMIN_ID, DEFAULT_ADMIN_PW)
    if (ok) return
    await repo.upsertUser(DEFAULT_ADMIN_ID, DEFAULT_ADMIN_PW, 'admin')
    console.log(`[auth/login] 기본 관리자 계정 초기화: ${DEFAULT_ADMIN_ID}`)
  } catch (e) {
    const msg = String((e as Error)?.message ?? e)
    console.warn('[auth/login] 기본 관리자 초기화 실패:', msg)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { username?: string; password?: string }
    const { username, password } = body

    if (!username || !password) {
      return NextResponse.json({ error: '아이디와 비밀번호를 입력하세요.' }, { status: 400 })
    }

    const client = await clientPromise
    const repo = new UserRepository(client)

    // 사용자가 없으면 먼저 기본 관리자 생성
    await ensureDefaultAdmin(repo)

    const user = await repo.verifyCredentials(username, password)

    if (!user) {
      return NextResponse.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 })
    }

    const userId = (user._id as { toString(): string })?.toString() ?? username
    const token = await createSessionToken({
      userId,
      username: user.username,
      role: user.role,
      issuedAt: Math.floor(Date.now() / 1000),
    })

    const res = NextResponse.json({ ok: true, username: user.username, role: user.role })
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    })
    return res
  } catch (e) {
    const msg = String((e as Error)?.message ?? e)
    console.error('[auth/login] 500:', msg)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.', detail: msg },
      { status: 500 },
    )
  }
}
