"use client"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts"

interface SpendChartProps {
  dailyData: { date: string; spend: number }[]
  mediaData: { media: string; spend: number }[]
}

function formatSpend(value: number) {
  return `${(value / 10000).toLocaleString()}만`
}

export default function SpendChart({ dailyData, mediaData }: SpendChartProps) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* 일별 소진 추이 */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-gray-700">
          일별 소진 추이
        </h2>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={dailyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12, fill: "#9ca3af" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={formatSpend}
              tick={{ fontSize: 11, fill: "#9ca3af" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              formatter={(value: number) => [
                `${value.toLocaleString()}원`,
                "소진금액",
              ]}
            />
            <Line
              type="monotone"
              dataKey="spend"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ r: 4, fill: "#3b82f6" }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 매체별 소진금액 */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-gray-700">
          매체별 소진금액
        </h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={mediaData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
            <XAxis
              type="number"
              tickFormatter={formatSpend}
              tick={{ fontSize: 11, fill: "#9ca3af" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="media"
              tick={{ fontSize: 12, fill: "#6b7280" }}
              axisLine={false}
              tickLine={false}
              width={60}
            />
            <Tooltip
              formatter={(value: number) => [
                `${value.toLocaleString()}원`,
                "소진금액",
              ]}
            />
            <Bar dataKey="spend" fill="#6366f1" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
