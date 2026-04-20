/**
 * 사업자등록증 PDF OCR — pdf-parse(pure JS) + 정규식 파싱
 * Python / AI API 미사용. Node.js 환경에서 바로 동작.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (
  dataBuffer: Buffer,
  options?: Record<string, unknown>
) => Promise<{ text: string; numpages: number }>

export interface OcrExtractedFields {
  corporateName?: string
  businessNumber?: string
  representative?: string
  address?: string
  businessType?: string
  businessItem?: string
}

function normalize(text: string): string {
  text = text.replace(/(?<=[가-힣])\s+(?=[가-힣])/g, '')
  text = text.replace(/[ 	]+/g, ' ')
  return text
}

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

function parseFields(rawText: string): OcrExtractedFields {
  const text = normalize(rawText)
  const result: OcrExtractedFields = {}

  const bn = text.match(/\b(\d{3}-\d{2}-\d{5})\b/)
  if (bn) result.businessNumber = bn[1]

  const stopCorp = ['성명', '대표', '사업장', '개업', '법인등록', '주민', '전화']
  const corp = findAfterLabel(text, ['법인명(단체명)', '법인명', '상호'], stopCorp, 50)
  if (corp) result.corporateName = corp.split(/[(\[（]/)[0].trim()

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

export async function extractBusinessRegistrationFields(
  pdfBuffer: Buffer
): Promise<OcrExtractedFields> {
  try {
    const data = await pdfParse(pdfBuffer, { max: 3 })
    if (!data?.text) return {}
    return parseFields(data.text)
  } catch (err) {
    console.error('[pdfOcr] pdf-parse error:', err)
    return {}
  }
}
