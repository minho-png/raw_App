import { NextRequest, NextResponse } from 'next/server'
import clientPromise from '@/lib/mongodb'
import { UserRepository } from '@/services/userRepository'
import { createSessionToken, COOKIE_NAME } from '@/lib/auth/session'

/**
 * 사용자가 없을 때 기본 관리자를 즉시 생성합니다.
 * (최초 배포 시 auto-seed 경쟁 조건 방지)
 */
async function ensureDefaultAdmin(repo: UserRepository): Promise<void> {
  try {
    const count = await repo.countUsers()
    if (count > 0) return
    await repo.createUser('Test1234', 'Test1234', 'admin')
    console.log('[auth/login] 기본 관리자 계정 생성: Test1234')
  } catch (e) {
    // 이미 존재하면 중복 키 에러 → 무시
    const msg = String((e as Error)?.message ?? e)
    if (!msg.includes('duplicate') && !msg.includes('E11000')) {
      console.warn('[auth/login] 기본 관리자 시드 실패:', msg)
    }
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
