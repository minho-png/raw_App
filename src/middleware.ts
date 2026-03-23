/**
 * Middleware — Auth 비활성화 모드
 * OAuth 인증 제외 후 앱 구동을 위해 모든 요청을 통과시킵니다.
 */
import { NextResponse } from 'next/server';

export default function middleware() {
  return NextResponse.next();
}

export const config = {
  matcher: [],
};
