"use client"
import type { MotivCampaign } from "@/lib/motivApi/types"

/**
 * MOTIV API stats 진단 카드 — 사용자 제공 필드 기준으로 재구성.
 *
 * 표시 필드 (사용자 명시 — number/required):
 *   payprice / cost / revenue / agency_fee / data_fee / profit / profit_rate
 *
 * 두 출처를 나란히 표시:
 *   1) /v1/campaigns           — c.stats (lifetime 누적 가능성)
 *   2) /v1/stats/campaign/breakdown — 호출부에서 rawStatsByMotivId 로 주입
 *
 * 사용 흐름:
 *   - 분석 페이지 헤더에 'API raw 진단' 토글
 *   - 토글 ON 시 상위 N개 캠페인을 행으로 비교 → 매핑이 옳은지 식별 후 매핑 조정
 */
export interface RawStatsCampaign {
  motivId: number
  title: string
  payprice?: number
  cost?: number
  revenue?: number
  agency_fee?: number
  data_fee?: number
  profit?: number
  profit_rate?: number
}

export function StatsRawDiagnostic({
  campaigns,
  rawStatsByMotivId,
  mappedSpendByMotivId,
  rangeStart, rangeEnd,
}: {
  campaigns: MotivCampaign[]
  rawStatsByMotivId?: Map<number, RawStatsCampaign>
  mappedSpendByMotivId: Map<number, number>
  rangeStart: string
  rangeEnd: string
}) {
  // 매출 의심 정렬 — c.stats.revenue 큰 순. 상위 10건.
  const rows = [...campaigns]
    .sort((a, b) => Number(b.stats?.revenue ?? 0) - Number(a.stats?.revenue ?? 0))
    .slice(0, 10)

  const fmt = (v: number | null | undefined) => {
    if (v == null) return '—'
    const n = Number(v)
    if (!Number.isFinite(n)) return '—'
    return Math.round(n).toLocaleString('ko-KR')
  }
  const fmtRate = (v: number | null | undefined) => {
    if (v == null) return '—'
    const n = Number(v)
    if (!Number.isFinite(n)) return '—'
    return `${n.toFixed(2)}%`
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50/60 via-white to-white p-4 shadow-sm space-y-3">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-bold">⚠</span>
        <h3 className="text-sm font-semibold text-gray-900">API raw 진단 — 매출/비용 후보 필드</h3>
        <span className="text-[10px] text-gray-400 ml-1">기간 {rangeStart} ~ {rangeEnd} · 상위 10건</span>
      </div>

      <p className="text-[11px] text-gray-600 leading-relaxed">
        사용자 제공 API 필드(<code className="bg-gray-100 px-1 rounded">payprice / cost / revenue / agency_fee / data_fee / profit / profit_rate</code>)를
        두 출처에서 그대로 비교.
        <br />
        <span className="text-amber-700">현재 매핑</span>: <code className="bg-gray-100 px-1 rounded">spend ← /stats/campaign/breakdown 의 revenue</code>
      </p>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-[11px] tabular-nums">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr className="text-gray-600">
              <th className="px-2 py-1.5 text-left font-semibold" rowSpan={2}>캠페인 (motivId)</th>
              <th className="px-2 py-1.5 text-center font-semibold border-l border-gray-200" colSpan={7}>
                /v1/campaigns &nbsp;<span className="text-[10px] text-gray-400">(c.stats — lifetime 가능)</span>
              </th>
              <th className="px-2 py-1.5 text-center font-semibold border-l border-gray-200" colSpan={7}>
                /v1/stats/campaign/breakdown &nbsp;<span className="text-[10px] text-gray-400">(기간 명시)</span>
              </th>
              <th className="px-2 py-1.5 text-center font-semibold border-l border-gray-200" rowSpan={2}>
                매핑값<br /><span className="text-[10px] text-amber-600">snap.today.spend</span>
              </th>
            </tr>
            <tr className="text-gray-500 text-[10px]">
              {(['payprice','cost','revenue','agency_fee','data_fee','profit','profit_rate'] as const).map((k, i) => (
                <th key={`list-${k}`} className={`px-2 py-1 text-right font-medium ${i === 0 ? 'border-l' : ''}`}>{k}</th>
              ))}
              {(['payprice','cost','revenue','agency_fee','data_fee','profit','profit_rate'] as const).map((k, i) => (
                <th key={`bd-${k}`} className={`px-2 py-1 text-right font-medium ${i === 0 ? 'border-l' : ''}`}>{k}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(c => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const s = c.stats as any
              const bd = rawStatsByMotivId?.get(c.id)
              const mapped = mappedSpendByMotivId.get(c.id)
              return (
                <tr key={c.id} className="hover:bg-amber-50/30">
                  <td className="px-2 py-1.5 text-gray-800 max-w-[180px] truncate font-medium" title={c.title ?? ''}>
                    {c.title || '(제목없음)'} <span className="text-gray-400 text-[10px]">#{c.id}</span>
                  </td>
                  {/* /v1/campaigns (lifetime 가능) */}
                  <td className="px-2 py-1 text-right text-gray-500 border-l">{fmt(s?.payprice)}</td>
                  <td className="px-2 py-1 text-right text-gray-700">{fmt(s?.cost)}</td>
                  <td className="px-2 py-1 text-right text-blue-700 font-semibold">{fmt(s?.revenue)}</td>
                  <td className="px-2 py-1 text-right text-gray-700">{fmt(s?.agency_fee)}</td>
                  <td className="px-2 py-1 text-right text-gray-700">{fmt(s?.data_fee)}</td>
                  <td className="px-2 py-1 text-right text-rose-700">{fmt(s?.profit)}</td>
                  <td className="px-2 py-1 text-right text-gray-500">{fmtRate(s?.profit_rate)}</td>
                  {/* /v1/stats/campaign/breakdown (기간 정확) */}
                  <td className="px-2 py-1 text-right text-gray-500 border-l">{fmt(bd?.payprice)}</td>
                  <td className="px-2 py-1 text-right text-gray-700">{fmt(bd?.cost)}</td>
                  <td className="px-2 py-1 text-right text-emerald-700 font-bold">{fmt(bd?.revenue)}</td>
                  <td className="px-2 py-1 text-right text-gray-700">{fmt(bd?.agency_fee)}</td>
                  <td className="px-2 py-1 text-right text-gray-700">{fmt(bd?.data_fee)}</td>
                  <td className="px-2 py-1 text-right text-rose-700">{fmt(bd?.profit)}</td>
                  <td className="px-2 py-1 text-right text-gray-500">{fmtRate(bd?.profit_rate)}</td>
                  {/* 현재 매핑 spend */}
                  <td className="px-2 py-1 text-right text-amber-700 font-bold border-l">{fmt(mapped)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg bg-blue-50/60 border border-blue-200 p-3 text-[11px] text-gray-700 space-y-1">
        <p className="font-semibold text-blue-800">사용자 확인 요청</p>
        <p>두 출처(list / breakdown)의 같은 필드 값을 비교 — 기간 변경 시 변하는 쪽이 정확한 기간 stats.</p>
        <p>실제 매출과 일치하는 컬럼이 식별되면 알려주세요. <code className="bg-white px-1 rounded">statsMapper.ts</code> 의 매핑을 교체합니다.</p>
      </div>
    </div>
  )
}
