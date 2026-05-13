"use client"
import { type KpiThresholds, DEFAULT_KPI_THRESHOLDS } from "@/lib/kpiThresholds"

interface Props {
  thresholds: KpiThresholds
  onChange: (next: KpiThresholds) => void
  onReset?: () => void
}

// KPI 임계값 설정 인라인 패널. 토글 가능한 헤더 영역에 펼침.
export function KpiThresholdSettings({ thresholds, onChange, onReset }: Props) {
  const field = (label: string, key: keyof KpiThresholds, unit: string, note?: string) => (
    <label className="flex items-center justify-between gap-3">
      <span className="text-[11px] text-gray-600 whitespace-nowrap">
        {label}
        {note && <span className="ml-1 text-[10px] text-gray-400">({note})</span>}
      </span>
      <div className="flex items-center gap-1">
        <input
          type="number"
          step="0.01"
          min="0"
          value={thresholds[key]}
          onChange={e => onChange({ ...thresholds, [key]: parseFloat(e.target.value) || 0 })}
          className="w-20 rounded-md border border-gray-200 px-2 py-1 text-xs text-right focus:border-blue-400 focus:outline-none"
        />
        <span className="text-[11px] text-gray-400 w-6">{unit}</span>
      </div>
    </label>
  )
  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/40 px-5 py-4">
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-xs font-semibold text-blue-800">KPI 경고 임계값</p>
        <button
          type="button"
          onClick={() => onReset?.() ?? onChange(DEFAULT_KPI_THRESHOLDS)}
          className="text-[11px] text-blue-500 hover:text-blue-700 underline"
        >기본값으로 초기화</button>
      </div>
      <div className="grid grid-cols-1 gap-x-10 gap-y-3 sm:grid-cols-2">
        <div className="space-y-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">예산 (소진률 vs 진행률 %p)</p>
          {field('소진 지연',  'budgetLagWarn',  '%p', '진행률 - 소진률')}
          {field('소진 초과',  'budgetOverWarn', '%p', '소진률 - 진행률')}
        </div>
        <div className="space-y-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">비율 KPI (목표 미달 %p)</p>
          {field('CTR 미달', 'ctrDeficitWarn', '%p')}
          {field('VTR 미달', 'vtrDeficitWarn', '%p')}
        </div>
        <div className="space-y-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">비용 KPI (목표 초과 %)</p>
          {field('CPC 초과', 'cpcExceedWarn', '%')}
          {field('CPM 초과', 'cpmExceedWarn', '%')}
        </div>
      </div>
    </div>
  )
}
