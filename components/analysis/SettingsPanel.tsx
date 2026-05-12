"use client"
import type { AnalysisSettings } from "./types"
import { DEFAULT_ANALYSIS_SETTINGS } from "./types"

type Variant = 'CT' | 'CTV'

export function SettingsPanel({
  settings, onChange, variant = 'CT',
}: {
  settings: AnalysisSettings
  onChange: (s: AnalysisSettings) => void
  variant?: Variant
}) {
  const field = (label: string, key: keyof AnalysisSettings, unit = '%p') => (
    <label className="flex items-center justify-between gap-3">
      <span className="text-[11px] text-gray-600 whitespace-nowrap">{label}</span>
      <div className="flex items-center gap-1">
        <input
          type="number"
          step="0.1"
          min="0"
          value={settings[key]}
          onChange={e => onChange({ ...settings, [key]: parseFloat(e.target.value) || 0 })}
          className="w-16 rounded-md border border-gray-200 px-2 py-1 text-xs text-right focus:border-blue-400 focus:outline-none"
        />
        <span className="text-[11px] text-gray-400">{unit}</span>
      </div>
    </label>
  )
  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/50 px-5 py-4">
      <p className="mb-4 text-xs font-semibold text-blue-800">기준 수치 설정</p>
      <div className={`grid gap-x-10 gap-y-3 ${variant === 'CTV' ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>
        <div className="space-y-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">전일비교 임계값</p>
          {field('CTR 차이',    'ctrDiff',        '%p')}
          {field('소진률 차이', 'spendRateDiff',  '%p')}
          {field('수익률 차이', 'profitRateDiff', '%p')}
        </div>
        {variant === 'CT' && (
          <>
            <div className="space-y-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">디스플레이 기준</p>
              {field('수익률 최소',  'displayProfitMin', '%')}
            </div>
            <div className="space-y-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">동영상 기준</p>
              {field('수익률 최소', 'videoProfitMin', '%')}
              {field('VTR 최소',   'videoVtrMin',    '%')}
            </div>
          </>
        )}
        {variant === 'CTV' && (
          <div className="space-y-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">CTV 기준</p>
            {field('VTR 최소', 'ctvVtrMin', '%')}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => onChange(DEFAULT_ANALYSIS_SETTINGS)}
        className="mt-4 text-[11px] text-blue-500 hover:text-blue-700 underline"
      >
        기본값으로 초기화
      </button>
    </div>
  )
}
