// 도메인 색상 팔레트 단일 source.
// 변경 추적 일원화 + 페이지 간 시각적 일관성 보장.
//
// 사용처:
//   AGENCY_PALETTE  — settlement/media-cost, settlement/agency-fee (대행사별 색)
//   DMP_COLORS      — components/atoms/Badge.tsx, components/ct-plus/DailyDataTable.tsx (DMP 배지)
//
// 주의: Tailwind v4 의 정적 추출을 위해 클래스명은 문자열 보간 금지 — 명시적 작성.

// ── 대행사 색상 ────────────────────────────────────────
//
// 8 hue × 5 변형. 사용처별로 필요한 변형만 골라 쓰면 됨.
//   bg     : 'bg-X-50'    — 카드 배경 (옅음)
//   border : 'border-X-200' — 경계선
//   text   : 'text-X-700'  — 텍스트 색
//   badge  : 'bg-X-100 text-X-700 border-X-200' — 배지 (border 포함)
//   card   : 'border-X-300 bg-X-50' — agency-fee 의 카드 박스 (진한 border)

export interface AgencyColorTheme {
  hue:    'blue' | 'violet' | 'teal' | 'orange' | 'rose' | 'cyan' | 'amber' | 'red'
  bg:     string
  border: string
  text:   string
  badge:  string
  card:   string
}

export const AGENCY_PALETTE: ReadonlyArray<AgencyColorTheme> = [
  { hue: 'blue',   bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   badge: 'bg-blue-100 text-blue-700 border-blue-200',     card: 'border-blue-300 bg-blue-50'     },
  { hue: 'violet', bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', badge: 'bg-violet-100 text-violet-700 border-violet-200', card: 'border-violet-300 bg-violet-50' },
  { hue: 'teal',   bg: 'bg-teal-50',   border: 'border-teal-200',   text: 'text-teal-700',   badge: 'bg-teal-100 text-teal-700 border-teal-200',     card: 'border-teal-300 bg-teal-50'     },
  { hue: 'orange', bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', badge: 'bg-orange-100 text-orange-700 border-orange-200', card: 'border-orange-300 bg-orange-50' },
  { hue: 'rose',   bg: 'bg-rose-50',   border: 'border-rose-200',   text: 'text-rose-700',   badge: 'bg-rose-100 text-rose-700 border-rose-200',     card: 'border-rose-300 bg-rose-50'     },
  { hue: 'cyan',   bg: 'bg-cyan-50',   border: 'border-cyan-200',   text: 'text-cyan-700',   badge: 'bg-cyan-100 text-cyan-700 border-cyan-200',     card: 'border-cyan-300 bg-cyan-50'     },
  { hue: 'amber',  bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-700',  badge: 'bg-amber-100 text-amber-700 border-amber-200',  card: 'border-amber-300 bg-amber-50'   },
  { hue: 'red',    bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-700',    badge: 'bg-red-100 text-red-700 border-red-200',         card: 'border-red-300 bg-red-50'       },
]

// 안정적 배정 — 같은 id 면 항상 같은 색.
//   pickAgencyColor(agencyId, ['agA','agB',...]) → AgencyColorTheme
// 호출부에서 agencyIds 배열 순서대로 색이 부여되므로, 정렬된 unique id 목록을 넘기는 것이 이상적.
export function pickAgencyColor(id: string, orderedIds: ReadonlyArray<string>): AgencyColorTheme {
  const idx = orderedIds.indexOf(id)
  if (idx < 0) return AGENCY_PALETTE[0]
  return AGENCY_PALETTE[idx % AGENCY_PALETTE.length]
}

// ── DMP 배지 색상 ──────────────────────────────────────
//
// 이전에 components/atoms/Badge.tsx 와 components/ct-plus/DailyDataTable.tsx 에서
// 키 + 값이 다른 두 팔레트가 공존했음. 본 파일로 통합 후 양쪽 모두 import.
//
// 키: DMP 식별자 (SKP, KB, LOTTE, DIRECT, TG360 등)
//
// 값 형식 결정:
//   - Badge.tsx 는 기존에 'bg-X-100 text-X-500' 형식 (배지 본체)
//   - DailyDataTable.tsx 는 'bg-X-100 text-X-700 border-X-200' (border 포함)
//   - 통합: border 포함 형식으로 통일 — border-width 는 사용처 클래스에서 결정
// DailyDataTable.tsx 의 팔레트를 베이스로 표준화 (border 포함 형식).
// 이전엔 components/atoms/Badge.tsx 와 DailyDataTable 에서 KB/TG360/BC/SH/WIFI/DIRECT 등의
// 색이 서로 달랐음 → 데이터 분석 화면 vs 정산 화면의 시각 일관성이 깨졌었음. 본 파일로 일원화.
export const DMP_COLORS: Record<string, string> = {
  SKP:             'bg-blue-100   text-blue-700    border-blue-200',
  KB:              'bg-yellow-100 text-yellow-800  border-yellow-200',
  LOTTE:           'bg-red-100    text-red-700     border-red-200',
  TG360:           'bg-orange-100 text-orange-700  border-orange-200',
  BC:              'bg-gray-100   text-gray-600    border-gray-200',
  SH:              'bg-slate-100  text-slate-600   border-slate-200',
  WIFI:            'bg-teal-100   text-teal-700    border-teal-200',
  HyperLocal:      'bg-purple-100 text-purple-700  border-purple-200',
  MEDIA_TARGETING: 'bg-green-100  text-green-700   border-green-200',
  DIRECT:          'bg-gray-50    text-gray-400    border-gray-100',
}

// fallback (미정의 키)
export const DMP_COLOR_FALLBACK = 'bg-gray-100 text-gray-600 border-gray-200'

// 표시 라벨 — 키와 다른 텍스트 사용 시
export const DMP_LABELS: Record<string, string> = {
  MEDIA_TARGETING: '매체 타게팅',
}
