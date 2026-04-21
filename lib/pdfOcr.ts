/**
 * 사업자등록증 PDF 텍스트 추출 — 순수 Node.js
 * FlateDecode (zlib + raw deflate) 지원, 다중 인코딩 처리
 */
import { inflateSync, inflateRawSync } from 'zlib'

export interface OcrExtractedFields {
  corporateName?: string
  businessNumber?: string
  representative?: string
  address?: string
  businessType?: string
  businessItem?: string
}

/** UTF-16BE hex → Unicode */
function hexToUtf16BE(hex: string): string {
  const h = hex.replace(/\s/g, '')
  const start = h.slice(0, 4).toLowerCase() === 'feff' ? 4 : 0
  let result = ''
  for (let i = start; i + 3 < h.length; i += 4) {
    const cp = parseInt(h.slice(i, i + 4), 16)
    if (!isNaN(cp) && cp > 0) result += String.fromCodePoint(cp)
  }
  return result
}

/** latin1 hex → 문자열 */
function hexToLatin1(hex: string): string {
  const h = hex.replace(/\s/g, '')
  let result = ''
  for (let i = 0; i + 1 < h.length; i += 2) {
    result += String.fromCharCode(parseInt(h.slice(i, i + 2), 16))
  }
  return result
}

/** PDF 괄호 리터럴 이스케이프 해제 */
function unescapeLiteral(s: string): string {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
    .replace(/\\(.)/g, '$1')
}

/** Buffer 해제: zlib → raw deflate → raw deflate(헤더 skip) → 원본 */
function decompress(data: Buffer): Buffer {
  if (data.length < 2) return data
  try { return inflateSync(data) } catch { /* fallthrough */ }
  try { return inflateRawSync(data) } catch { /* fallthrough */ }
  try { return inflateRawSync(data.subarray(2)) } catch { /* fallthrough */ }
  return data
}

/** BT/ET 블록에서 텍스트 토큰 추출 */
function tokensFromBlock(block: string): string[] {
  const parts: string[] = []
  let m: RegExpExecArray | null

  // <hex> Tj 또는 <hex> TJ
  const rHex = /<([0-9a-fA-F\s]+)>\s*T[jJ]/g
  while ((m = rHex.exec(block)) !== null) {
    const decoded = hexToUtf16BE(m[1]) || hexToLatin1(m[1])
    if (decoded.trim()) parts.push(decoded)
  }

  // [<hex>...] TJ
  const rArr = /\[([^\]]*)\]\s*TJ/g
  while ((m = rArr.exec(block)) !== null) {
    const rInner = /<([0-9a-fA-F\s]+)>/g
    let hm: RegExpExecArray | null
    while ((hm = rInner.exec(m[1])) !== null) {
      const decoded = hexToUtf16BE(hm[1]) || hexToLatin1(hm[1])
      if (decoded.trim()) parts.push(decoded)
    }
  }

  // (literal) Tj/TJ
  const rLit = /[(]([^)]*)[)]\s*T[jJ]/g
  while ((m = rLit.exec(block)) !== null) {
    const val = unescapeLiteral(m[1]).trim()
    if (val) parts.push(val)
  }

  return parts
}

/** Buffer에서 BT/ET 블록을 순회하여 텍스트 추출 */
function bufferToText(buf: Buffer): string {
  const s = buf.toString('binary')
  const tokens: string[] = []
  let pos = 0
  while (pos < s.length) {
    const bi = s.indexOf('BT', pos)
    if (bi === -1) break
    const ei = s.indexOf('ET', bi + 2)
    if (ei === -1) break
    const extracted = tokensFromBlock(s.slice(bi + 2, ei))
    if (extracted.length) { tokens.push(...extracted); tokens.push(' ') }
    pos = ei + 2
  }
  return tokens.join('')
}

/** PDF 전체 스트림을 순회하여 텍스트 추출 */
function extractPdfText(pdfBuffer: Buffer): string {
  const raw = pdfBuffer.toString('binary')
  const chunks: string[] = []
  let pos = 0

  while (pos < raw.length) {
    const si = raw.indexOf('stream', pos)
    if (si === -1) break

    let dataStart = si + 6
    if (raw[dataStart] === '\r') dataStart++
    if (raw[dataStart] === '\n') dataStart++

    const ei = raw.indexOf('endstream', dataStart)
    if (ei === -1) { pos = si + 1; continue }

    const streamBuf = Buffer.from(raw.slice(dataStart, ei), 'binary')
    const content = decompress(streamBuf)
    const text = bufferToText(content)
    if (text.trim()) chunks.push(text)

    pos = ei + 9
  }

  return chunks.join('\n')
}

/** 한글 자간 공백 제거 + 연속 공백 정규화 */
function normalize(text: string): string {
  text = text.replace(/(?<=[가-힣])\s+(?=[가-힣])/g, '')
  text = text.replace(/[ \t]+/g, ' ')
  text = text.replace(/\n{3,}/g, '\n\n')
  return text
}

/** 라벨 다음에 오는 값 추출 */
function findAfter(text: string, labels: string[], stops: string[] = [], maxLen = 80): string | undefined {
  for (const lbl of labels) {
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const stopPart = stops.length ? '(?=' + stops.map(esc).join('|') + '|$)' : ''
    const re = new RegExp(esc(lbl) + '[\\s\uff1a:]*([\\s\\S]{1,' + maxLen + '})' + stopPart)
    const m = text.match(re)
    if (m) { const v = m[1].trim().replace(/\s+/g, ' '); if (v) return v }
  }
  return undefined
}

/** 사업자등록증 필드 파싱 */
function parseFields(raw: string): OcrExtractedFields {
  const text = normalize(raw)
  const r: OcrExtractedFields = {}

  // 사업자등록번호
  const bn = text.match(/\b(\d{3}-\d{2}-\d{5})\b/) ?? text.match(/\b(\d{10})\b/)
  if (bn) r.businessNumber = bn[1].replace(/(\d{3})(\d{2})(\d{5})/, '$1-$2-$3')

  // 법인명
  const corp = findAfter(text, ['법인명(단체명)', '법인명', '상호'],
    ['성명','대표','사업장','개업','법인등록','주민','전화'], 60)
  if (corp) r.corporateName = corp.split(/[(（]/)[0].trim()

  // 대표자 성명
  const rep = findAfter(text, ['성명','대표자성명','대표자'],
    ['개업','사업장','법인','주민','업태','종목'], 20)
  if (rep) { const c = rep.replace(/[^가-힣a-zA-Z]/g,'').trim(); if (c.length >= 2) r.representative = c }

  // 사업장 소재지
  const addr = findAfter(text, ['사업장소재지','사업장 소재지','소재지'],
    ['업태','종목','개업','발급','이 증명서','본점'], 120)
  if (addr) r.address = addr.split(/본\s*점/)[0].trim()

  // 업태
  const biz = text.match(/업\s*태\s*[\uff1a:\s]*([\s\S]+?)(?=종\s*목|$)/)
  if (biz) { const t = biz[1].split(/종\s*목/)[0].trim().replace(/\s+/g,' ').slice(0,50); if (t) r.businessType = t }

  // 종목
  const item = text.match(/종\s*목\s*[\uff1a:\s]*([\s\S]+?)(?=전화|팩스|발급|이 증명서|사업장|$)/)
  if (item) { const t = item[1].trim().replace(/\s+/g,' ').slice(0,80); if (t) r.businessItem = t }

  return r
}

/**
 * PDF Buffer에서 사업자등록증 필드를 추출합니다.
 */
export async function extractBusinessRegistrationFields(
  pdfBuffer: Buffer
): Promise<OcrExtractedFields> {
  try {
    const text = extractPdfText(pdfBuffer)
    if (!text.trim()) {
      console.warn('[pdfOcr] 텍스트 추출 결과 없음 (스캔 PDF이거나 지원하지 않는 형식)')
      return {}
    }
    return parseFields(text)
  } catch (err) {
    console.error('[pdfOcr] 오류:', err)
    return {}
  }
}
