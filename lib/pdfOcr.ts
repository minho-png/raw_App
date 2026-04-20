/**
 * 사업자등록증 PDF OCR — 순수 Node.js (외부 패키지 없음)
 * Node.js 내장 zlib으로 PDF 스트림 해제 후 정규식 파싱
 */
import { inflateSync } from 'zlib'

export interface OcrExtractedFields {
  corporateName?: string
  businessNumber?: string
  representative?: string
  address?: string
  businessType?: string
  businessItem?: string
}

/** UTF-16BE hex 문자열을 Unicode 문자열로 디코딩 */
function hexToString(hex: string): string {
  const h = hex.replace(/\s/g, '')
  const start = h.slice(0, 4).toLowerCase() === 'feff' ? 4 : 0
  let result = ''
  for (let i = start; i + 3 < h.length; i += 4) {
    const cp = parseInt(h.slice(i, i + 4), 16)
    if (!isNaN(cp) && cp > 0) result += String.fromCodePoint(cp)
  }
  return result
}

/** PDF 스트림 버퍼에서 텍스트 추출 */
function streamToText(buf: Buffer): string {
  const s = buf.toString('binary')
  const parts: string[] = []
  let pos = 0

  while (pos < s.length) {
    const btIdx = s.indexOf('BT', pos)
    if (btIdx === -1) break
    const etIdx = s.indexOf('ET', btIdx + 2)
    if (etIdx === -1) break

    const block = s.slice(btIdx + 2, etIdx)

    // <hex> Tj
    const hexTjRe = /<([0-9a-fA-F\s]+)>\s*Tj/g
    let m: RegExpExecArray | null
    while ((m = hexTjRe.exec(block)) !== null) {
      const decoded = hexToString(m[1])
      if (decoded) parts.push(decoded)
    }

    // [...<hex>...] TJ
    const tjArrRe = /\[([^\]]*)\]\s*TJ/g
    while ((m = tjArrRe.exec(block)) !== null) {
      const inner = m[1]
      const hexRe = /<([0-9a-fA-F\s]+)>/g
      let hm: RegExpExecArray | null
      while ((hm = hexRe.exec(inner)) !== null) {
        const decoded = hexToString(hm[1])
        if (decoded) parts.push(decoded)
      }
    }

    // (literal text) Tj — 괄호 문자 클래스로 처리 (역슬래시 이스케이프 회피)
    const litTjRe = /[(]([^)]*)[)]\s*Tj/g
    while ((m = litTjRe.exec(block)) !== null) {
      if (m[1].trim()) parts.push(m[1])
    }

    parts.push(' ')
    pos = etIdx + 2
  }

  return parts.join('')
}

/** PDF 버퍼에서 전체 텍스트 추출 */
function extractPdfText(pdfBuffer: Buffer): string {
  const raw = pdfBuffer.toString('binary')
  const texts: string[] = []
  let pos = 0

  while (pos < raw.length) {
    const si = raw.indexOf('\nstream', pos)
    if (si === -1) break
    const dataStart = raw[si + 7] === '\r' ? si + 9 : si + 8
    const ei = raw.indexOf('endstream', dataStart)
    if (ei === -1) { pos = si + 1; continue }

    const streamData = Buffer.from(raw.slice(dataStart, ei), 'binary')
    let content: Buffer
    try { content = inflateSync(streamData) } catch (_e) { content = streamData }

    const extracted = streamToText(content)
    if (extracted.trim()) texts.push(extracted)
    pos = ei + 9
  }

  return texts.join('\n')
}

/** 한글 자간 공백 제거 및 연속 공백 정규화 */
function normalize(text: string): string {
  text = text.replace(/(?<=[가-힣])\s+(?=[가-힣])/g, '')
  text = text.replace(/[ \t]+/g, ' ')
  return text
}

/** 라벨 다음에 오는 값 추출 */
function findAfterLabel(
  text: string,
  labels: string[],
  stopLabels: string[] = [],
  maxLen = 60
): string | undefined {
  for (const label of labels) {
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const stopPart = stopLabels.length
      ? '(?=' + stopLabels.map(esc).join('|') + '|$)'
      : ''
    const pattern = new RegExp(esc(label) + '[\\s\uff1a:]*([\\s\\S]{1,' + maxLen + '})' + stopPart)
    const m = text.match(pattern)
    if (m) {
      const val = m[1].trim().replace(/\s+/g, ' ')
      if (val) return val
    }
  }
  return undefined
}

/** 사업자등록증 필드 파싱 */
function parseFields(rawText: string): OcrExtractedFields {
  const text = normalize(rawText)
  const result: OcrExtractedFields = {}

  const bn = text.match(/\b(\d{3}-\d{2}-\d{5})\b/)
  if (bn) result.businessNumber = bn[1]

  const stopCorp = ['성명', '대표', '사업장', '개업', '법인등록', '주민', '전화']
  const corp = findAfterLabel(text, ['법인명(단체명)', '법인명', '상호'], stopCorp, 50)
  if (corp) result.corporateName = corp.split(/[(]/)[0].trim()

  const stopRep = ['개업', '사업장', '법인', '주민', '전화', '업태', '종목']
  const rep = findAfterLabel(text, ['성명', '대표자성명', '대표자'], stopRep, 20)
  if (rep) {
    const clean = rep.replace(/[^가-힣a-zA-Z\s]/g, '').trim().split(/\s+/)[0]
    if (clean) result.representative = clean
  }

  const stopAddr = ['업태', '종목', '개업', '발급', '이 증명서', '사업의 종류']
  const addr = findAfterLabel(text, ['사업장소재지', '사업장 소재지'], stopAddr, 100)
  if (addr) result.address = addr.split(/본\s*점/)[0].trim()

  const bizLine = text.match(/업\s*태\s*[\uff1a:]?\s*([\s\S]+?)(?=종\s*목|$)/)
  if (bizLine) {
    const bt = bizLine[1].split(/종\s*목/)[0].trim().replace(/\s+/g, ' ')
    if (bt) result.businessType = bt
  }

  const itemLine = text.match(/종\s*목\s*[\uff1a:]?\s*([\s\S]+?)(?=전화|팩스|발급|이 증명서|사업장|$)/)
  if (itemLine) {
    const it = itemLine[1].trim().replace(/\s+/g, ' ')
    if (it) result.businessItem = it
  }

  return result
}

/**
 * PDF Buffer에서 사업자등록증 필드를 추출합니다.
 * @param pdfBuffer - PDF 파일의 raw Buffer
 */
export async function extractBusinessRegistrationFields(
  pdfBuffer: Buffer
): Promise<OcrExtractedFields> {
  try {
    const text = extractPdfText(pdfBuffer)
    if (!text.trim()) return {}
    return parseFields(text)
  } catch (err) {
    console.error('[pdfOcr] extract error:', err)
    return {}
  }
}
