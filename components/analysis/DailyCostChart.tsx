"use client"

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts"
import type { DailyCostPoint } from "@/lib/motivApi/statsService"

// MOTIV /v1/stats/daily/breakdown 결과를 일자별 라인차트로 시각화.
// 표시: cost(소진) / agency_fee(대행 수수료) / data_fee(DMP 수수료) / profit(이익)
// X 축: date (YYYY-MM-DD 의 MM-DD 만)

function fmtY(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`
  if (n >= 10_000)      return `${(n / 10_000).toFixed(0)}만`
  return n.toLocaleString('ko-KR')
}

export function DailyCostChart({
  data, loading, error, height = 220,
}: {
  data: DailyCostPoint[]
  loading?: boolean
  error?: string | null
  height?: number
}) {
  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 flex items-center justify-center text-xs text-gray-400" style={{ minHeight: height }}>
        <svg className="animate-spin h-3.5 w-3.5 mr-2 text-gray-400" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
        </svg>
        MOTIV Stats 응답 대기 중…
      </div>
    )
  }
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-xs text-red-600" style={{ minHeight: height }}>
        Stats API 오류: {error}
      </div>
    )
  }
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-gray-100 bg-white px-5 py-4 text-center text-xs text-gray-400" style={{ minHeight: height }}>
        해당 기간에 데이터가 없습니다.
      </div>
    )
  }

  const chartData = data.map(d => ({
    date: (d.date || '').slice(5),  // 'YYYY-MM-DD' → 'MM-DD'
    소진:   d.cost,
    대행수수료: d.agency_fee,
    DMP수수료: d.data_fee,
    이익:   d.profit,
  }))

  return (
    <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-xs font-semibold text-gray-700">일별 비용 추세</h3>
        <span className="text-[10px] text-gray-400">MOTIV /stats/daily 기준 · {data.length}일</span>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={{ top: 5, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={fmtY} tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={44} />
          <Tooltip
            formatter={(v) => `₩${Number(v ?? 0).toLocaleString('ko-KR')}`}
            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
          />
          <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10 }} />
          <Line type="monotone" dataKey="소진"        stroke="#3b82f6" strokeWidth={2} dot={chartData.length <= 31} />
          <Line type="monotone" dataKey="대행수수료" stroke="#a855f7" strokeWidth={1.5} strokeDasharray="3 3" dot={false} />
          <Line type="monotone" dataKey="DMP수수료"  stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="3 3" dot={false} />
          <Line type="monotone" dataKey="이익"        stroke="#10b981" strokeWidth={2} dot={chartData.length <= 31} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
