// 매체별 브랜드 컬러 단일 source of truth.
// 다른 파일에서는 mColor / mediaTint / contrastOn 만 import 해서 사용.
//
// 주의: 키는 코드베이스 표준 표기인 "카카오모먼트" (모먼트, 멘트 아님).
// 과거 'status/[id]/page.tsx' 와 'CampaignDetailPanel.tsx' 가 '카카오모멘트' 로
// 오타 매핑돼 카카오 색이 fallback gray 로 떨어지고 있었음 — 본 파일이 표준.

export const MEDIA_COLORS: Record<string, string> = {
  "네이버 GFA":   "#03C75A",
  "카카오모먼트": "#FEE500",
  "Google":       "#4285F4",
  "META":         "#1877F2",
  // CT/CTV 매체 — 공식 디자인 시스템 미공개로 임시 색 (운영팀 확인 후 보정).
  "CrossTarget":  "#FF6B35",
}

const FALLBACK = "#94a3b8" // slate-400

export function mColor(media: string): string {
  return MEDIA_COLORS[media] ?? FALLBACK
}

// 옅은 배경 tint — #RRGGBB → #RRGGBB + alpha hex
export function mediaTint(media: string, alphaHex = "20"): string {
  return `${mColor(media)}${alphaHex}`
}

// YIQ 명도 기반 글자색 결정 (밝은 배경 = 어두운 글자, 어두운 배경 = 흰 글자).
// 카카오 노란색 같은 밝은 색에 흰 글자가 안 보이는 문제를 자동 해결.
export function contrastOn(hex: string): string {
  const h = hex.replace("#", "")
  if (h.length < 6) return "#1f2937"
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const yiq = (r * 299 + g * 587 + b * 114) / 1000
  return yiq >= 160 ? "#1f2937" /* gray-800 */ : "#ffffff"
}
