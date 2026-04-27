/**
 * 거래처(대행사)별 세금계산서 발행 요청서 / 대금 지급 요청서 Excel 양식.
 * 사용자 제공 이미지(2026-04 기준) 레이아웃을 따라 cell 단위로 작성.
 */
import * as XLSX from 'xlsx'
import type { Agency } from '@/lib/campaignTypes'
import type { SalesRow, PurchaseRow } from './settlementExcel'
import { sumSales, sumPurchase, simplifyCampaignName } from './settlementExcel'

// ─── 공통 ─────────────────────────────────────────────────────────

type AOA = (string | number | null)[][]

function aoaToSheetWithMerges(aoa: AOA, merges: XLSX.Range[]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!merges'] = merges
  return ws
}

function fmtToday(): string {
  const d = new Date()
  const y = String(d.getFullYear()).slice(-2)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}.${m}.${day}`
}

function setColumnWidths(ws: XLSX.WorkSheet, widths: number[]): void {
  ws['!cols'] = widths.map(wch => ({ wch }))
}

// ─── 1) 세금계산서 발행 요청서 (매출) ─────────────────────────────
// 사용자 이미지 1: 헤더 + 사업자정보 표 + 디테일 행 + 결재라인

export function downloadTaxInvoiceRequestForm(
  agency: Agency,
  rows: SalesRow[],
  month: string,
): void {
  const totals = sumSales(rows)
  const today = fmtToday()
  const monthShort = month.slice(2).replace('-', '.') // 2026-04 → 26.04

  const aoa: AOA = []

  // 1행: 제목
  aoa.push(['세금계산서 발행 요청서'])
  aoa.push([])

  // 2~3행: 내역
  const advFromRows = Array.from(new Set(rows.map(r => r['거래처명 (사업자등록증 기준)']).filter(Boolean))).join(', ')
  aoa.push([`내역 : 세금계산서발행요청서_광고운영팀_${agency.name}_${rows.length}건(CT+/CT/CTV)_${monthShort}`])
  aoa.push([])

  // 안내문
  aoa.push(['* 필요시 행추가하여 내용 기입'])
  aoa.push(['* 거래처명 오름차순 정렬 및 증빙 순서 일치 必'])
  aoa.push(['* 제목 : 세금계산서발행요청서_팀명_거래처명_N건'])
  aoa.push([])

  // 사업자정보 박스
  aoa.push(['', '사업자등록번호', agency.businessNumber ?? '', '', '', '', '', ''])
  aoa.push(['', '거래처명',       agency.name ?? '',           '', '', '', '', ''])
  aoa.push(['', '대표자성명',     agency.representative ?? '', '', '', '', '', ''])
  aoa.push(['', '주소',           agency.address ?? '',        '', '', '', '', ''])
  aoa.push(['', '업태',           agency.businessType ?? '',   '', '', '', '', ''])
  aoa.push(['', '종목',           agency.businessItem ?? '',   '', '', '', '', ''])
  aoa.push(['', '건(합계)',       `${rows.length}건`,           '', '', '', '', ''])
  aoa.push([])

  // 디테일 헤더
  const detailHeader = [
    '해당월', '담당자', '세금계산서 작성일자', '거래처명 (사업자등록증 기준)',
    '캠페인명', '공급가액', '세액', '합계금액',
    '수취이메일', '수수료 (VAT포함)', '수금일 기준', '수금 기한',
    'CT 해당금액 (vat 제외)', 'IMC 해당금액 (vat 제외)', 'TV 해당금액 (vat 제외)',
    '비고',
  ]
  aoa.push(detailHeader)

  // 디테일 행 (캠페인명 단순화)
  for (const r of rows) {
    aoa.push([
      r.해당월 || monthShort,
      r.담당자,
      r['세금계산서 작성일자'] || today,
      r['거래처명 (사업자등록증 기준)'] || agency.name,
      simplifyCampaignName(r.캠페인명),
      r.공급가액,
      r.세액,
      r.합계금액,
      r.수취이메일 || agency.email || '',
      r['수수료 (VAT포함)'],
      r['수금일 기준'],
      r['수금 기한'],
      r['CT 해당금액 (vat 제외)'],
      r['IMC 해당금액 (vat 제외)'],
      r['TV 해당금액 (vat 제외)'],
      r.비고,
    ])
  }

  // 합계
  aoa.push([
    '', '', '', '합계',
    '', totals.net, totals.vat, totals.total,
    '', totals.fee, '', '',
    rows.reduce((s, r) => s + Number(r['CT 해당금액 (vat 제외)'] ?? 0), 0),
    rows.reduce((s, r) => s + Number(r['IMC 해당금액 (vat 제외)'] ?? 0), 0),
    rows.reduce((s, r) => s + Number(r['TV 해당금액 (vat 제외)'] ?? 0), 0),
    '',
  ])
  aoa.push([])

  // 메모
  aoa.push(['※ 입금되어 ' + (agency.paymentBasis ?? '') + ' 으로 집행될 캠페인입니다.'])
  aoa.push([])

  // 결재라인
  aoa.push(['[결재라인]'])
  aoa.push(['기안자 → 소속파트장/팀장[승인] → 소속본부장[승인] → 재무팀 매니저[필수합의(순차)] → 재무팀 팀장[필수합의(순차)] → 경영기획본부장[참조]'])
  aoa.push(['※결재라인, 금액 등 내용의 수정이 필요할 경우 부득이하게 반려 될 수도 있으며, 작성중 문의사항이 있으시면 언제든지 인사기획팀으로 연락 부탁드립니다.'])

  // Merges (간소화: 제목, 내역만 병합)
  const merges: XLSX.Range[] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 15 } }, // title
    { s: { r: 2, c: 0 }, e: { r: 2, c: 15 } }, // 내역
  ]

  const ws = aoaToSheetWithMerges(aoa, merges)
  setColumnWidths(ws, [10, 10, 14, 22, 30, 14, 12, 14, 22, 14, 14, 12, 14, 14, 14, 14])

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '세금계산서 발행 요청서')

  // 또한 생 데이터도 별도 시트로
  const rawWs = XLSX.utils.json_to_sheet(rows.map(r => ({
    해당월: r.해당월, 담당자: r.담당자,
    '세금계산서 작성일자': r['세금계산서 작성일자'],
    '거래처명': r['거래처명 (사업자등록증 기준)'],
    캠페인명: r.캠페인명,
    공급가액: r.공급가액, 세액: r.세액, 합계금액: r.합계금액,
    '수금일 기준': r['수금일 기준'], '수금 기한': r['수금 기한'],
    '수수료(VAT포함)': r['수수료 (VAT포함)'], 수취이메일: r.수취이메일,
    '수수료 세금계산서 발행여부': r['수수료 세금계산서 발행여부'],
    'CT 해당금액(VAT제외)': r['CT 해당금액 (vat 제외)'],
    'IMC 해당금액(VAT제외)': r['IMC 해당금액 (vat 제외)'],
    'TV 해당금액(VAT제외)': r['TV 해당금액 (vat 제외)'],
    비고: r.비고, 참고: r.참고, 업데이트: r.업데이트,
    '수금 여부': r['수금 여부'], '실 수금일': r['실 수금일'],
  })))
  XLSX.utils.book_append_sheet(wb, rawWs, '원본 데이터')

  XLSX.writeFile(wb, `세금계산서발행요청서_${agency.name}_${month}.xlsx`)
}

// ─── 2) 대금 지급 요청서 (매입) ──────────────────────────────────
// 사용자 이미지 2: 헤더 + 자금집행일/지출금액 박스 + 거래처/은행 박스 + 디테일

export function downloadPaymentRequestForm(
  agency: Agency,
  rows: PurchaseRow[],
  month: string,
): void {
  const totals = sumPurchase(rows)
  const today = fmtToday()
  const monthShort = month.slice(2).replace('-', '.')

  // 자금집행일 = 송금기한 중 첫 행 사용 (없으면 빈칸)
  const fundingDate = rows[0]?.송금기한 ?? ''

  const aoa: AOA = []

  // 제목
  aoa.push(['대금 지급 요청서'])
  aoa.push([])

  // 내역
  aoa.push([`내역 : 광고운영팀_${agency.name}_${rows.length}건_${monthShort}(CT+/CT/CTV)`])
  aoa.push([])

  // 안내문
  aoa.push(['* 필요시 행추가하여 내용 기입'])
  aoa.push(['* 거래처명 오름차순 정렬 및 증빙 순서 일치 必'])
  aoa.push(['* 제목 : 대금지급요청서_부서명_거래처명_내용'])
  aoa.push([])

  // 자금집행일/지출금액
  aoa.push(['자금집행일', fundingDate, '', '', '', '', '', ''])
  aoa.push(['지출금액',   `(₩) ${totals.total.toLocaleString()}`, '', '', '', '', '', ''])
  aoa.push([])

  // 거래처 박스 (이미지 2 패턴)
  aoa.push([
    '거래처명', '세금계산서 일자', '내역', '합계', '은행', '계좌번호', '예금주',
  ])
  aoa.push([
    agency.name,
    today,
    `${rows.length}건 대행 수수료`,
    `(₩) ${totals.total.toLocaleString()}`,
    agency.bankName ?? '',
    agency.bankAccountNumber ?? '',
    agency.bankAccountHolder ?? agency.name,
  ])
  aoa.push([])

  // 디테일 헤더
  const detailHeader = [
    '년월', '담당자', '구분', '일자', '거래처명 (사업자등록증 기준)',
    '캠페인명', '공급가액', '세액', '합계금액',
    'IMC', 'TV', 'CT', '송금일 기준', '송금기한',
  ]
  aoa.push(detailHeader)

  for (const r of rows) {
    aoa.push([
      r.년월 || monthShort,
      r.담당자,
      r.구분,
      r.일자 || today,
      r['거래처명 (세금계산서 기준)'] || agency.name,
      simplifyCampaignName(r.캠페인명),
      r.공급가액,
      r.세액,
      r.합계금액,
      r.IMC, r.TV, r.CT,
      r['송금일 기준'],
      r.송금기한,
    ])
  }

  // 합계
  aoa.push([
    '', '', '', '', '합계',
    '', totals.net, totals.vat, totals.total,
    rows.reduce((s, r) => s + Number(r.IMC ?? 0), 0),
    rows.reduce((s, r) => s + Number(r.TV ?? 0), 0),
    rows.reduce((s, r) => s + Number(r.CT ?? 0), 0),
    '', '',
  ])
  aoa.push([])

  aoa.push(['수수료 상계 처리가 아닌 양사 별도 입금으로 진행하는 건입니다.'])
  aoa.push([])

  // 결재라인
  aoa.push(['[결재라인]'])
  aoa.push(['10만원이하 : 기안자 → 소속팀장/실장[승인] → 소속본부장[승인] → 재무팀 매니저[승인] → 재무팀 팀장[승인]'])
  aoa.push(['10만원초과~50만원이하 : 기안자 → 소속팀장/실장[승인] → 소속본부장[승인] → 재무팀 매니저[승인] → 재무팀 팀장[승인] → 경영기획본부장[승인]'])
  aoa.push(['50만원초과 : 기안자 → 소속팀장/실장[승인] → 소속본부장[승인] → 재무팀 매니저[승인] → 재무팀 팀장[승인] → 경영기획본부장[승인] → 대표이사[승인]'])
  aoa.push(['※결재라인, 금액 등 내용의 수정이 필요할 경우 부득이하게 반려 될 수도 있으며, 작성중 문의사항이 있으시면 언제든지 인사기획팀으로 연락 부탁드립니다.'])

  const merges: XLSX.Range[] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 13 } }, // title
    { s: { r: 2, c: 0 }, e: { r: 2, c: 13 } }, // 내역
  ]

  const ws = aoaToSheetWithMerges(aoa, merges)
  setColumnWidths(ws, [10, 10, 14, 12, 26, 28, 14, 12, 14, 12, 12, 12, 14, 14])

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '대금 지급 요청서')

  // 원본 데이터 시트
  const rawWs = XLSX.utils.json_to_sheet(rows.map(r => ({
    년월: r.년월, 담당자: r.담당자, 구분: r.구분, 일자: r.일자,
    '거래처명': r['거래처명 (세금계산서 기준)'],
    캠페인명: r.캠페인명,
    공급가액: r.공급가액, 세액: r.세액, 합계금액: r.합계금액,
    IMC: r.IMC, TV: r.TV, CT: r.CT,
    '송금일 기준': r['송금일 기준'], 송금기한: r.송금기한,
  })))
  XLSX.utils.book_append_sheet(wb, rawWs, '원본 데이터')

  XLSX.writeFile(wb, `대금지급요청서_${agency.name}_${month}.xlsx`)
}
