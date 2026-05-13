// 라벨 + 값 (+ 보조 텍스트) 을 보여주는 단일 KPI 카드 atom.
// 이전엔 app/campaign/ct-plus/overview/page.tsx 의 인라인 KpiCard 와
//   app/campaign/ct-plus/components/ct-plus/CampaignDetailPanel.tsx 의 DetailKPICard 가
// 거의 동일 구조로 중복 정의되어 있었음. variant 옵션으로 두 시각 스타일 통합.
//
// 분석 페이지의 "today vs yesterday 비교 카드" 는 시그니처가 완전히 달라(threshold,
// yesterdayMissing 등) components/analysis/KpiCard.tsx 에 분리 유지.

type Color   = 'default' | 'blue' | 'green' | 'orange' | 'red'
type Variant = 'tinted' | 'bordered'  // tinted = 컬러 배경, bordered = 회색 박스 + 텍스트 색만

interface Props {
  label: string
  value: string | number
  sub?: string
  color?: Color
  variant?: Variant
  className?: string
}

const TINTED: Record<Color, string> = {
  default: 'bg-gray-50 text-gray-700',
  blue:    'bg-blue-50 text-blue-700',
  green:   'bg-green-50 text-green-700',
  orange:  'bg-orange-50 text-orange-700',
  red:     'bg-red-50 text-red-600',
}

const BORDERED_TEXT: Record<Color, string> = {
  default: 'text-gray-900',
  blue:    'text-blue-600',
  green:   'text-green-600',
  orange:  'text-orange-600',
  red:     'text-red-600',
}

export function MetricCard({
  label, value, sub, color = 'default', variant = 'tinted', className,
}: Props) {
  if (variant === 'tinted') {
    // overview 페이지 스타일 — 큰 폰트 + 컬러 배경
    const effectiveColor: Color = color === 'default' ? 'blue' : color
    return (
      <div className={className ?? `rounded-xl p-4 ${TINTED[effectiveColor]}`}>
        <p className="text-xs font-medium opacity-70 mb-1">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
        {sub && <p className="text-xs mt-1 opacity-60">{sub}</p>}
      </div>
    )
  }
  // bordered: CampaignDetailPanel 스타일 — 작은 폰트 + 회색 박스 + 텍스트 색만
  return (
    <div className={className ?? 'rounded-lg border border-gray-200 bg-gray-50 px-4 py-3'}>
      <p className="text-[11px] text-gray-500 font-medium">{label}</p>
      <p className={`text-sm font-semibold mt-1 ${BORDERED_TEXT[color]}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}
