"use client"
import { AUTO_INTERVALS, type RefreshControl as RC } from "@/lib/hooks/useRefreshControl"

// 페이지 헤더에 들어가는 실시간 갱신 컨트롤 UI.
// useRefreshControl 결과를 그대로 전달.

interface Props {
  control: RC
  loading?: boolean
}

function fmtTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

export function RefreshControlBar({ control, loading }: Props) {
  const { refresh, autoMs, setAutoMs, lastRefresh } = control
  return (
    <div className="inline-flex items-center gap-2">
      {/* 마지막 갱신 시각 */}
      <span className="text-[10px] text-gray-400 tabular-nums">
        갱신 {fmtTime(lastRefresh)}
      </span>
      {/* 자동 새로고침 간격 선택 */}
      <div className="inline-flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white p-0.5">
        {AUTO_INTERVALS.map(({ label, ms }) => {
          const active = autoMs === ms
          return (
            <button
              key={ms}
              type="button"
              onClick={() => setAutoMs(ms)}
              className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
                active ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700'
              }`}
              title={ms === 0 ? '자동 새로고침 끔' : `${label} 마다 자동 갱신`}
            >{label}</button>
          )
        })}
      </div>
      {/* 즉시 새로고침 */}
      <button
        type="button"
        onClick={refresh}
        disabled={loading}
        title="지금 새로고침"
        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-600 hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <svg
          className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6M20 20v-6h-6M5 11a8 8 0 1114 4" />
        </svg>
        새로고침
      </button>
    </div>
  )
}
