import { NextRequest, NextResponse } from 'next/server'
import clientPromise from '@/lib/mongodb'
import { UserRepository } from '@/services/userRepository'

/**
 * 최초 관리자 계정 생성 엔드포인트.
 * 이미 사용자가 1명 이상 존재하면 404를 반환합니다.
 * INIT_ADMIN_KEY 환경변수로 보호됩니다.
 */
export async function POST(req: NextRequest) {
  try {
    const initKey = process.env.INIT_ADMIN_KEY
    if (!initKey) {
      return NextResponse.json({ error: 'INIT_ADMIN_KEY가 설정되지 않았습니다.' }, { status: 403 })
    }

    const { key, username, password } = await req.json() as {
      key?: string
      username?: string
      password?: string
    }

    if (key !== initKey) {
      return NextResponse.json({ error: '인증키가 올바르지 않습니다.' }, { status: 403 })
    }

    if (!username || !password) {
      return NextResponse.json({ error: 'username과 password가 필요합니다.' }, { status: 400 })
    }

    const client = await clientPromise
    const repo = new UserRepository(client)

    const count = await repo.countUsers()
    if (count > 0) {
      return NextResponse.json(
        { error: '이미 사용자가 존재합니다. 이 엔드포인트는 최초 1회만 사용 가능합니다.' },
        { status: 409 },
      )
    }

    await repo.createUser(username, password, 'admin')
    return NextResponse.json({ ok: true, username })
  } catch (e) {
    console.error('[auth/init-admin]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
