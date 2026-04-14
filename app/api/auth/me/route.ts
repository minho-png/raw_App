import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth/session'

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return NextResponse.json({ authenticated: false }, { status: 401 })

  const payload = verifySessionToken(token)
  if (!payload) return NextResponse.json({ authenticated: false }, { status: 401 })

  return NextResponse.json({
    authenticated: true,
    username: payload.username,
    role: payload.role,
  })
}
