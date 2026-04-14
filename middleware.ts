import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth/session'

// 인증이 필요 없는 공개 경로
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/init-admin']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 공개 경로는 패스
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // 정적 파일 (_next/static, _next/image, favicon 등) 제외
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    /\.(png|jpg|jpeg|svg|ico|webp|css|js|woff2?)$/.test(pathname)
  ) {
    return NextResponse.next()
  }

  const token = request.cookies.get(COOKIE_NAME)?.value
  const payload = token ? verifySessionToken(token) : null

  if (!payload) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
