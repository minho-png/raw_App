/**
 * 암호학적으로 안전한 ID 생성기
 * Math.random() 대신 crypto.getRandomValues()를 사용하여 공유 링크 ID 등 보안이 필요한 값에 사용
 */

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function genId(size = 12): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(size);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => CHARS[b % CHARS.length]).join('');
  }
  // Node.js fallback (crypto module)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nodeCrypto = require('crypto') as typeof import('crypto');
  return Array.from(nodeCrypto.randomBytes(size), b => CHARS[b % CHARS.length]).join('');
}
