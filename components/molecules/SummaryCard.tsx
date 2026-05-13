// 라벨 + 값 만 보여주는 단순 요약 카드.
// CT/CTV 분석 페이지에서 동일 구현이 중복 정의되어 있던 것을 단일 source 로 통합.
//
// 사용 예:
//   <SummaryCard label="총 노출" value="1,234,567" />

interface Props {
  label: string
  value: string
  className?: string
}

export function SummaryCard({ label, value, className }: Props) {
  return (
    <div className={className ?? "rounded-xl border border-gray-200 bg-white px-5 py-4"}>
      <p className="text-[11px] font-medium text-gray-400 mb-1">{label}</p>
      <p className="text-xl font-bold text-gray-900">{value}</p>
    </div>
  )
}
