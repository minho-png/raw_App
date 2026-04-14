'use client'

import { useMemo } from 'react'
import { useCTPlusOverview } from '@/lib/hooks/useCTPlusOverview'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
} from 'recharts'

// ── 포맷 헬퍼 ────────────────────────────────────────────────
function fmtKrw(n: number) {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`
  if (n >= 10_000)      return `${Math.round(n / 10_000)}만`
  return n.toLocaleString('ko-KR')
}

function fmtDate(d: string) {
  return d.slice(5).replace('-', '/')
}

function pct(n: number) { return `${n.toFixed(1)}%` }

// ── KPI 카드 ─────────────────────────────────────────────────
function KpiCard({ label, value, sub, color = 'blue' }: {
  label: string; value: string; sub?: string; color?: 'blue' | 'green' | 'orange' | 'red'
}) {
  const colorMap = {
    blue:   'bg-blue-50 text-blue-700',
    green:  'bg-green-50 text-green-700',
    orange: 'bg-orange-50 text-orange-700',
    red:    'bg-red-50 text-red-600',
  }
  return (
    <div className={`rounded-xl p-4 ${colorMap[color]}`}>
      <p className="text-xs font-medium opacity-70 mb-1">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs mt-1 opacity-60">{sub}</p>}
    </div>
  )
}

export default function CTPlusOverviewPage() {
  const { campaigns, selectedId, selectCampaign, overview, isLoading } = useCTPlusOverview()

  const spendColor = useMemo(() => {
    if (!overview) return 'blue'
    const r = overview.totals.spendRate
    if (r >= 95) return 'green'
    if (r >= 70) return 'blue'
    if (r >= 40) return 'orange'
    return 'red'
  }, [overview])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        데이터를 불러오는 중...
      </div>
    )
  }

  if (campaigns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-gray-400">
        <p className="text-sm">등록된 캠페인이 없습니다.</p>
        <p className="text-xs">집행 현황 메뉴에서 캠페인을 먼저 등록하세요.</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">CT+ 현황</h1>
        {/* 캠페인 선택 */}
        <select
          value={selectedId}
          onChange={e => selectCampaign(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-orange-400 focus:ring-2 focus:ring-orange-100 outline-none"
        >
          {campaigns.map(c => (
            <option key={c.id} value={c.id}>{c.campaignName}</option>
          ))}
        </select>
      </div>

      {overview ? (
        <>
          {/* 캠페인 메타 */}
          <div className="rounded-xl border border-gray-100 bg-white px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-base font-semibold text-gray-800">{overview.campaign.campaignName}</p>
              <p className="text-xs text-gray-400 mt-0.5">{overview.advertiserName} · {overview.campaign.startDate} ~ {overview.campaign.endDate}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                overview.dday.expired ? 'bg-gray-100 text-gray-500' :
                overview.dday.urgent  ? 'bg-red-100 text-red-600' :
                                        'bg-blue-50 text-blue-600'
              }`}>
                {overview.dday.label}
              </span>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                overview.campaign.status === '집행 중' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {overview.campaign.status}
              </span>
            </div>
          </div>

          {/* KPI 카드 4개 */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="총 예산" value={fmtKrw(overview.totals.totalBudget)} color="blue" />
            <KpiCard label="셋팅 비용" value={fmtKrw(overview.totals.totalSettingCost)} color="blue" />
            <KpiCard
              label="소진 금액"
              value={fmtKrw(overview.totals.totalSpend)}
              sub={`소진율 ${pct(overview.totals.spendRate)}`}
              color={spendColor}
            />
            <KpiCard
              label="매체 수"
              value={String(overview.campaign.mediaBudgets.length)}
              sub={`${overview.matchedReports.length}개 리포트 연결됨`}
              color="orange"
            />
          </div>

          {/* 소진율 바 */}
          <div className="rounded-xl border border-gray-100 bg-white px-5 py-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-700">전체 소진율</p>
              <span className="text-sm font-bold text-gray-800">{pct(overview.totals.spendRate)}</span>
            </div>
            <div className="h-3 w-full rounded-full bg-gray-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  overview.totals.spendRate >= 95 ? 'bg-green-500' :
                  overview.totals.spendRate >= 70 ? 'bg-blue-500' :
                  overview.totals.spendRate >= 40 ? 'bg-orange-400' : 'bg-red-400'
                }`}
                style={{ width: `${Math.min(overview.totals.spendRate, 100)}%` }}
              />
            </div>
          </div>

          {/* DMP / 비DMP 소진 차트 */}
          {overview.dmpBreakdown.length > 0 && (
            <div className="rounded-xl border border-gray-100 bg-white px-5 py-4">
              <p className="text-sm font-semibold text-gray-700 mb-4">매체별 DMP 소진 현황</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={overview.dmpBreakdown} margin={{ top: 0, right: 10, bottom: 0, left: 10 }}>
                  <XAxis dataKey="media" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={v => fmtKrw(v as number)} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v) => (typeof v === 'number' ? v.toLocaleString('ko-KR') + '원' : String(v))} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="dmpSpend"    name="DMP 활용"   fill="#f97316" radius={[3,3,0,0]} />
                  <Bar dataKey="nonDmpSpend" name="DMP 미활용" fill="#94a3b8" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* 일별 소진 추이 */}
          {overview.dailyTrend.length > 0 && (
            <div className="rounded-xl border border-gray-100 bg-white px-5 py-4">
              <p className="text-sm font-semibold text-gray-700 mb-4">일별 소진 추이</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={overview.dailyTrend} margin={{ top: 0, right: 10, bottom: 0, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={v => fmtKrw(v as number)} tick={{ fontSize: 10 }} />
                  <Tooltip
                    labelFormatter={l => String(l)}
                    formatter={(v) => [typeof v === 'number' ? v.toLocaleString('ko-KR') + '원' : String(v), '소진']}
                  />
                  <Line type="monotone" dataKey="spend" stroke="#f97316" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* 연결된 리포트 목록 */}
          <div className="rounded-xl border border-gray-100 bg-white px-5 py-4">
            <p className="text-sm font-semibold text-gray-700 mb-3">
              연결된 리포트 <span className="ml-1 text-xs text-gray-400">({overview.matchedReports.length}건)</span>
            </p>
            {overview.matchedReports.length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center">
                연결된 리포트가 없습니다. 데이터 입력 후 저장하면 자동으로 연결됩니다.
              </p>
            ) : (
              <div className="space-y-1.5">
                {overview.matchedReports.map(r => (
                  <div key={r.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                    <div>
                      <p className="text-xs font-medium text-gray-700">{r.label}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {r.mediaTypes.join(', ')} · 저장일 {r.savedAt.slice(0, 10)}
                      </p>
                    </div>
                    <span className="text-[11px] text-gray-400">{r.totalRows ?? '—'} 행</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 매체별 예산 테이블 */}
          <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-700">매체별 예산 현황</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    {['매체', '구분', '예산', '셋팅비용', '소진', '소진율'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left font-medium text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {overview.campaign.mediaBudgets.flatMap(mb => [
                    { media: mb.media, type: 'DMP 활용',   tb: mb.dmp },
                    { media: '',        type: 'DMP 미활용', tb: mb.nonDmp },
                  ]).map((row, i) => {
                    const sc = Math.round(row.tb.budget * (1 - (row.tb.agencyFeeRate + 10) / 100))
                    const sr = sc > 0 ? Math.round((row.tb.spend / sc) * 1000) / 10 : 0
                    return (
                      <tr key={i} className="hover:bg-gray-50/50">
                        <td className="px-4 py-2.5 font-medium text-gray-700">{row.media}</td>
                        <td className="px-4 py-2.5 text-gray-500">{row.type}</td>
                        <td className="px-4 py-2.5 text-gray-700">{row.tb.budget.toLocaleString('ko-KR')}</td>
                        <td className="px-4 py-2.5 text-gray-700">{sc.toLocaleString('ko-KR')}</td>
                        <td className="px-4 py-2.5 text-gray-700">{row.tb.spend.toLocaleString('ko-KR')}</td>
                        <td className={`px-4 py-2.5 font-semibold ${
                          sr >= 95 ? 'text-green-600' :
                          sr >= 70 ? 'text-blue-600' :
                          sr >= 40 ? 'text-orange-500' : 'text-red-500'
                        }`}>{pct(sr)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
          캠페인을 선택하세요.
        </div>
      )}
    </div>
  )
}
