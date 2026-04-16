import { NextRequest, NextResponse } from 'next/server'
import clientPromise from '@/lib/mongodb'
import { UserRepository } from '@/services/userRepository'
import { createSessionToken, COOKIE_NAME } from '@/lib/auth/session'

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json() as { username?: string; password?: string }

    if (!username || !password) {
      return NextResponse.json({ error: '아이디와 비밀번호를 입력하세요.' }, { status: 400 })
    }

    const client = await clientPromise
    const repo = new UserRepository(client)
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
      maxAge: 60 * 60 * 24 * 7,  // 7일
      path: '/',
    })
    return res
  } catch (e) {
    console.error('[auth/login]', e)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
