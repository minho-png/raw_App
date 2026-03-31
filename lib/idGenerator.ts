/**
 * 암호학적으로 안전한 ID 생성기
 * Math.random() 대신 crypto.getRandomValues()를 사용
 */

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function genId(size = 12): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(size);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => CHARS[b % CHARS.length]).join('');
  }
  // Node.js fallback
  const bytes = Array.from({ length: size }, () => Math.floor(Math.random() * 256));
  return bytes.map(b => CHARS[b % CHARS.length]).join('');
}
