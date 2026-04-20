/**
 * 사업자등록증 PDF OCR — Python pdfplumber + 정규식 파싱
 * AI API 미사용. Python 3 + pdfplumber 필요.
 */
import { spawn } from 'child_process'
import path from 'path'

export interface OcrExtractedFields {
  corporateName?: string   // 법인명 / 상호
  businessNumber?: string  // 사업자등록번호 (000-00-00000)
  representative?: string  // 대표자명
  address?: string         // 사업장소재지
  businessType?: string    // 업태
  businessItem?: string    // 종목
}

/**
 * PDF Buffer를 Python 스크립트(scripts/pdf_extract.py)로 전달하여
 * 사업자등록증 필드를 추출합니다.
 *
 * @param pdfBuffer - PDF 파일의 raw Buffer
 * @returns 추출된 필드 (파싱 불가 필드는 undefined)
 */
export async function extractBusinessRegistrationFields(
  pdfBuffer: Buffer
): Promise<OcrExtractedFields> {
  return new Promise((resolve) => {
    const scriptPath = path.join(process.cwd(), 'scripts', 'pdf_extract.py')

    const python = spawn('python3', [scriptPath], {
      timeout: 30_000, // 30초 타임아웃
    })

    let stdout = ''
    let stderr = ''

    python.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf-8') })
    python.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf-8') })

    python.on('error', (err) => {
      console.error('[pdfOcr] spawn error:', err.message)
      resolve({})
    })

    python.on('close', (code) => {
      if (code !== 0) {
        console.error('[pdfOcr] python exited with code', code, ':', stderr.trim())
        resolve({})
        return
      }
      try {
        const parsed = JSON.parse(stdout.trim()) as Record<string, unknown>
        const result: OcrExtractedFields = {}

        if (typeof parsed.corporateName === 'string'  && parsed.corporateName.trim())
          result.corporateName  = parsed.corporateName.trim()
        if (typeof parsed.businessNumber === 'string' && parsed.businessNumber.trim())
          result.businessNumber = parsed.businessNumber.trim()
        if (typeof parsed.representative === 'string' && parsed.representative.trim())
          result.representative = parsed.representative.trim()
        if (typeof parsed.address === 'string'        && parsed.address.trim())
          result.address        = parsed.address.trim()
        if (typeof parsed.businessType === 'string'   && parsed.businessType.trim())
          result.businessType   = parsed.businessType.trim()
        if (typeof parsed.businessItem === 'string'   && parsed.businessItem.trim())
          result.businessItem   = parsed.businessItem.trim()

        resolve(result)
      } catch (e) {
        console.error('[pdfOcr] JSON parse error:', e, 'stdout:', stdout)
        resolve({})
      }
    })

    // PDF를 base64로 인코딩해서 stdin으로 전달
    python.stdin.write(pdfBuffer.toString('base64'))
    python.stdin.end()
  })
}
