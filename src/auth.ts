/**
 * Auth 스텁 — OAuth 인증 비활성화 모드
 * next-auth 패키지 없이 앱이 구동되도록 빈 구현체를 제공합니다.
 */

export const auth = async () => null;
export const signIn = async () => {};
export const signOut = async () => {};
export const handlers = {};
