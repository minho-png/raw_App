"use client"

import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell
} from "recharts"
import type { MediaData, ReportSection } from "@/lib/reportTypes"
import { MEDIA_CONFIG } from "@/lib/reportTypes"

interface Props {
  mediaList: MediaData[]
  sections: ReportSection[]
}

function fmt(n: number) {
  return n.toLocaleString('ko-KR')
}

export default function ReportViewer({ mediaList, sections }: Props) {
  if (mediaList.length === 0) return null

  // 전체 합산
  const total = mediaList.reduce(
    (acc, m) => ({
      impressions: acc.impressions + m.summary.impressions,
      clicks: acc.clicks + m.summary.clicks,
      cost: acc.cost + m.summary.cost,
    }),
    { impressions: 0, clicks: 0, cost: 0 }
  )
  const totalCtr = total.impressions > 0 ? (total.clicks / total.impressions) * 100 : 0
  const totalCpc = total.clicks > 0 ? total.cost / total.clicks : 0

  // 매체별 비중 데이터
  const mediaCompData = mediaList.map((m) => ({
    name: MEDIA_CONFIG[m.media].label,
    노출비중: total.impressions > 0 ? Math.round((m.summary.impressions / total.impressions) * 100) : 0,
    클릭비중: total.clicks > 0 ? Math.round((m.summary.clicks / total.clicks) * 100) : 0,
    color: MEDIA_CONFIG[m.media].color,
  }))

  // 주차별 데이터 병합
  const weekSet = new Set<string>()
  mediaList.forEach((m) => m.weekly.forEach((w) => weekSet.add(w.week)))
  const weeks = Array.from(weekSet).sort()
  const weeklyData = weeks.map((week) => {
    const row: Record<string, number | string> = { week }
    mediaList.forEach((m) => {
      const found = m.weekly.find((w) => w.week === week)
      row[`${MEDIA_CONFIG[m.media].label}_CTR`] = found?.ctr ?? 0
      row[`${MEDIA_CONFIG[m.media].label}_CPC`] = found?.cpc ?? 0
    })
    return row
  })

  return (
    <div className="space-y-6">

      {/* 요약 KPI */}
      {sections.includes('summary_kpi') && (
        <section>
          <h2 className="mb-3 text-base font-bold text-gray-900">전체 요약 KPI</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              { label: '총 노출수', value: fmt(total.impressions), unit: '회' },
              { label: '총 클릭수', value: fmt(total.clicks), unit: '회' },
              { label: '평균 CTR', value: totalCtr.toFixed(2), unit: '%' },
              { label: '총 소진금액', value: fmt(total.cost), unit: '원' },
              { label: '평균 CPC', value: fmt(Math.round(totalCpc)), unit: '원' },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                <p className="text-xs text-gray-400">{item.label}</p>
                <p className="mt-1 text-xl font-bold text-gray-900">
                  {item.value}
                  <span className="ml-1 text-xs font-normal text-gray-400">{item.unit}</span>
                </p>
              </div>
            ))}
          </div>

          {/* 매체별 KPI 카드 */}
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            {mediaList.map((m) => {
              const cfg = MEDIA_CONFIG[m.media]
              return (
                <div
                  key={m.media}
                  className="rounded-xl border p-4"
                  style={{ backgroundColor: cfg.bgColor, borderColor: cfg.borderColor }}
                >
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cfg.color }} />
                    <span className="text-xs font-semibold text-gray-700">{cfg.label}</span>
                  </div>
                  <div className="space-y-1 text-xs text-gray-600">
                    <div className="flex justify-between">
                      <span>노출</span><span className="font-medium">{fmt(m.summary.impressions)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>클릭</span><span className="font-medium">{fmt(m.summary.clicks)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>CTR</span><span className="font-medium">{m.summary.ctr.toFixed(2)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>소진</span><span className="font-medium">{fmt(m.summary.cost)}원</span>
                    </div>
                    <div className="flex justify-between">
                      <span>CPC</span><span className="font-medium">{fmt(m.summary.cpc)}원</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* 매체별 비중 */}
      {sections.includes('media_comparison') && mediaCompData.length > 0 && (
        <section>
          <h2 className="mb-3 text-base font-bold text-gray-900">매체별 비중 비교</h2>
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <p className="mb-2 text-xs text-gray-400">노출 비중 (%)</p>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={mediaCompData} dataKey="노출비중" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${name} ${value}%`}>
                      {mediaCompData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => `${v}%`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div>
                <p className="mb-2 text-xs text-gray-400">클릭 비중 (%)</p>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={mediaCompData} dataKey="클릭비중" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${name} ${value}%`}>
                      {mediaCompData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => `${v}%`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 주차별 추이 */}
      {sections.includes('weekly_trend') && weeklyData.length > 0 && (
        <section>
          <h2 className="mb-3 text-base font-bold text-gray-900">주차별 성과 추이</h2>
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="mb-2 text-xs text-gray-400">CTR (%) 주간 추이</p>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                <Tooltip formatter={(v) => `${v}%`} />
                <Legend />
                {mediaList.map((m) => (
                  <Line
                    key={m.media}
                    type="monotone"
                    dataKey={`${MEDIA_CONFIG[m.media].label}_CTR`}
                    stroke={MEDIA_CONFIG[m.media].color}
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* 연령/성별 */}
      {sections.includes('demographic') && (
        <section>
          <h2 className="mb-3 text-base font-bold text-gray-900">성별/연령별 성과</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {mediaList.filter((m) => m.demographic.length > 0).map((m) => {
              const cfg = MEDIA_CONFIG[m.media]
              return (
                <div key={m.media} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                  <p className="mb-3 text-sm font-semibold" style={{ color: cfg.color }}>{cfg.label} — 연령/성별 CTR</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={m.demographic}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="age" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                      <Tooltip formatter={(v) => `${v}%`} />
                      <Legend />
                      <Bar dataKey="male_ctr" name="남성 CTR" fill="#3B82F6" radius={[3,3,0,0]} />
                      <Bar dataKey="female_ctr" name="여성 CTR" fill="#F43F5E" radius={[3,3,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* 소재별 */}
      {sections.includes('creative') && (
        <section>
          <h2 className="mb-3 text-base font-bold text-gray-900">소재별 성과</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {mediaList.filter((m) => m.creatives.length > 0).map((m) => {
              const cfg = MEDIA_CONFIG[m.media]
              return (
                <div key={m.media} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                  <p className="mb-3 text-sm font-semibold" style={{ color: cfg.color }}>{cfg.label} — 소재별 CTR</p>
                  <ResponsiveContainer width="100%" height={Math.max(180, m.creatives.length * 28)}>
                    <BarChart data={m.creatives} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} />
                      <Tooltip formatter={(v) => `${v}%`} />
                      <Bar dataKey="ctr" name="CTR" fill={cfg.color} radius={[0,3,3,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* 인사이트 */}
      {sections.includes('insights') && (
        <section>
          <h2 className="mb-3 text-base font-bold text-gray-900">종합 인사이트</h2>
          <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div>
                <h3 className="mb-3 text-sm font-bold text-gray-700">캠페인 인사이트</h3>
                <ul className="space-y-2">
                  {mediaList.map((m) => {
                    const cfg = MEDIA_CONFIG[m.media]
                    const best = mediaList.reduce((a, b) => a.summary.ctr > b.summary.ctr ? a : b)
                    return (
                      <li key={m.media} className="flex items-start gap-2 text-sm text-gray-600">
                        <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full flex items-center justify-center" style={{ backgroundColor: cfg.bgColor }}>
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cfg.color }} />
                        </span>
                        <span>
                          <strong style={{ color: cfg.color }}>{cfg.label}</strong>
                          {' '}CTR {m.summary.ctr.toFixed(2)}%
                          {m.media === best.media ? ' — 가장 높은 CTR 효율' : ''}
                          , CPC {fmt(m.summary.cpc)}원
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
              <div>
                <h3 className="mb-3 text-sm font-bold text-gray-700">다음 단계 제안</h3>
                <ul className="space-y-2 text-sm text-gray-600">
                  {(() => {
                    const best = mediaList.reduce((a, b) => a.summary.ctr > b.summary.ctr ? a : b)
                    const worst = mediaList.reduce((a, b) => a.summary.ctr < b.summary.ctr ? a : b)
                    return [
                      `${MEDIA_CONFIG[best.media].label} 예산 비중 확대 검토 (CTR 최고 효율)`,
                      mediaList.length > 1 ? `${MEDIA_CONFIG[worst.media].label} 소재/타겟팅 최적화 필요 (CTR 개선 여지)` : null,
                      '소재 피로도 방지를 위한 주기적 소재 교체 권장',
                      '성과 상위 연령/성별 타겟 예산 집중 배분',
                    ].filter(Boolean)
                  })().map((text, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <svg className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                      <span>{text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
