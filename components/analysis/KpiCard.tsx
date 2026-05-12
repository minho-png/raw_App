"use client"

export function KpiCard({
  label, todayVal, yestVal, threshold, decimals = 2, note, benchmarkMin, yesterdayMissing,
}: {
  label: string
  todayVal: number
  yestVal: number
  threshold: number
  decimals?: number
  note?: string
  benchmarkMin?: number
  yesterdayMissing?: boolean   // 전일 스냅샷 없음 — diff 표시 차단
}) {
  const diff = yesterdayMissing ? 0 : todayVal - yestVal
  const exceeded = !yesterdayMissing && Math.abs(diff) >= threshold
  const belowBenchmark = benchmarkMin !== undefined && todayVal < benchmarkMin
  const isAlert = exceeded || belowBenchmark
  const up = diff >= 0
  return (
    <div className={`rounded-xl border bg-white px-5 py-4 ${isAlert ? 'border-red-200 ring-1 ring-red-200' : 'border-gray-200'}`}>
      <p className="text-[11px] font-medium text-gray-400 mb-1">{label}</p>
      {note && <p className="text-[10px] text-gray-500 mb-1.5">{note}</p>}
      <p className={`text-2xl font-bold ${belowBenchmark ? 'text-red-600' : 'text-gray-900'}`}>{todayVal.toFixed(decimals)}%</p>
      <div className="mt-1.5 flex items-center gap-2">
        {yesterdayMissing ? (
          <span className="text-[11px] text-gray-300">전일 데이터 미연동</span>
        ) : (
          <>
            <span className="text-[11px] text-gray-400">전일 {yestVal.toFixed(decimals)}%</span>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              exceeded ? (up ? 'text-blue-600 bg-blue-50' : 'text-red-600 bg-red-50') : 'text-gray-500 bg-gray-50'
            }`}>
              {up ? '▲' : '▼'} {Math.abs(diff).toFixed(decimals)}%{exceeded && ' ⚠'}
            </span>
          </>
        )}
      </div>
      {belowBenchmark && (
        <p className="mt-1.5 text-[10px] font-semibold text-red-500">⚠ 기준 {benchmarkMin}% 미달</p>
      )}
      {exceeded && !belowBenchmark && <p className="mt-1.5 text-[10px] text-red-500">임계값 ±{threshold}% 초과</p>}
    </div>
  )
}
