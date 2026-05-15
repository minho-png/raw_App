"use client"
import type { MotivCampaign } from "@/lib/motivApi/types"
import type { UnifiedDailyMetrics } from "@/lib/motivApi/statsMapper"

/**
 * MOTIV API 매출 후보 필드 진단 카드.
 *
 * 사용자 보고 — '매출액이 실제 데이터와 다른 것들이 있어. revenue 는 수익 항목인
 * 것 같아. 일단 확인을 위해 각각을 API 호출명과 함께 보여줘 매출로 예상되는'.
 *
 * 화면에 두 종류의 stats 를 나란히 표시:
 *   1) /v1/campaigns 의 c.stats  → lifetime 누적 가능성 (campaigns.index)
 *   2) /v1/stats/campaign/breakdown 의 기간 stats → 정확한 기간 합계
 *
 * 매출 후보 필드 (Motiv 응답 raw 필드명):
 *   - cost       : 매체비 raw (매체사 지급)
 *   - revenue    : 광고주 청구액 (현재 'spend' 로 매핑됨)
 *   - agency_fee : 대행 + DMP 합
 *   - data_fee   : DMP 단독
 *   - profit     : Motiv 이익  ← 사용자 의심 — revenue 가 사실 이거?
 *   - payprice   : 입찰 지불가 (RTB)
 *   - pubprice   : 매체사 수익가
 *   - winprice   : 낙찰가
 *
 * MotivCampaign 자체 필드 (stats 가 아님):
 *   - total_budget / total_spent  : 캠페인 lifetime 누적 (사용자: '기간으론 못씀')
 *   - daily_budget / daily_spent  : 당일 실시간
 *
 * 사용자가 이 표를 보고 실제 매출 데이터와 일치하는 필드를 식별 → 다음 PR 에서 매핑 변경.
 */
export function StatsRawDiagnostic({
  campaigns,
  periodStatsByMotivId,
  mappedSpendByMotivId,
  rangeStart, rangeEnd,
}: {
  campaigns: MotivCampaign[]
  periodStatsByMotivId: Map<number, UnifiedDailyMetrics>
  mappedSpendByMotivId: Map<number, number>
  rangeStart: string
  rangeEnd: string
}) {
  // 노출 분량 제한 — 가장 spend 큰 10개 (혹은 c.stats.revenue 큰 순).
  const rows = [...campaigns]
    .sort((a, b) => Number(b.stats?.revenue ?? 0) - Number(a.stats?.revenue ?? 0))
    .slice(0, 10)

  const fmt = (n: number | null | undefined) => {
    const v = Number(n ?? 0)
    if (!Number.isFinite(v)) return "-"
    return Math.round(v).toLocaleString("ko-KR")
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50/60 via-white to-white p-4 shadow-sm space-y-3">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-bold">⚠</span>
        <h3 className="text-sm font-semibold text-gray-900">API raw 진단 — 매출 후보 필드</h3>
        <span className="text-[10px] text-gray-400 ml-1">기간 {rangeStart} ~ {rangeEnd} · 상위 10건</span>
      </div>

      <p className="text-[11px] text-gray-600 leading-relaxed">
        실제 매출과 일치하는 필드를 식별하려고 두 API 응답의 raw 필드들을 그대로 표시.
        <br />
        <span className="text-amber-700">현재 매핑</span>: <code className="bg-gray-100 px-1 rounded">spend ← stats.revenue</code> (없으면 cost+agency_fee+profit 폴백).
        <br />
        <span className="text-rose-700">사용자 의심</span>: revenue 가 실은 수익(profit) 항목일 가능성 — 아래 표로 비교.
      </p>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-[11px] tabular-nums">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr className="text-gray-600">
              <th className="px-2 py-1.5 text-left font-semibold" rowSpan={2}>캠페인 (motivId)</th>
              <th className="px-2 py-1.5 text-center font-semibold border-l border-gray-200" colSpan={9}>
                /v1/campaigns &nbsp;<span className="text-[10px] text-gray-400">(c.stats / c.total_spent — 누적 가능)</span>
              </th>
              <th className="px-2 py-1.5 text-center font-semibold border-l border-gray-200" colSpan={5}>
                /v1/stats/campaign/breakdown &nbsp;<span className="text-[10px] text-gray-400">(정확한 기간)</span>
              </th>
              <th className="px-2 py-1.5 text-center font-semibold border-l border-gray-200" rowSpan={2}>
                매핑값<br /><span className="text-[10px] text-amber-600">snap.today.spend</span>
              </th>
            </tr>
            <tr className="text-gray-500 text-[10px]">
              <th className="px-2 py-1 text-right font-medium border-l">cost</th>
              <th className="px-2 py-1 text-right font-medium">revenue</th>
              <th className="px-2 py-1 text-right font-medium">agency_fee</th>
              <th className="px-2 py-1 text-right font-medium">data_fee</th>
              <th className="px-2 py-1 text-right font-medium">profit</th>
              <th className="px-2 py-1 text-right font-medium">payprice</th>
              <th className="px-2 py-1 text-right font-medium">pubprice</th>
              <th className="px-2 py-1 text-right font-medium">winprice</th>
              <th className="px-2 py-1 text-right font-medium">total_spent</th>
              <th className="px-2 py-1 text-right font-medium border-l">spend</th>
              <th className="px-2 py-1 text-right font-medium">mediaCost</th>
              <th className="px-2 py-1 text-right font-medium">agencyFee</th>
              <th className="px-2 py-1 text-right font-medium">dmpFee</th>
              <th className="px-2 py-1 text-right font-medium">완료 조회</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(c => {
              const s = c.stats
              const period = periodStatsByMotivId.get(c.id)
              const mapped = mappedSpendByMotivId.get(c.id)
              return (
                <tr key={c.id} className="hover:bg-amber-50/30">
                  <td className="px-2 py-1.5 text-gray-800 max-w-[180px] truncate font-medium" title={c.title ?? ''}>
                    {c.title || '(제목없음)'} <span className="text-gray-400 text-[10px]">#{c.id}</span>
                  </td>
                  <td className="px-2 py-1 text-right text-gray-700 border-l">{fmt(s?.cost)}</td>
                  <td className="px-2 py-1 text-right text-blue-700 font-semibold">{fmt(s?.revenue)}</td>
                  <td className="px-2 py-1 text-right text-gray-700">{fmt(s?.agency_fee)}</td>
                  <td className="px-2 py-1 text-right text-gray-700">{fmt(s?.data_fee)}</td>
                  <td className="px-2 py-1 text-right text-rose-700 font-semibold">{fmt(s?.profit)}</td>
                  <td className="px-2 py-1 text-right text-gray-500">{fmt(s?.payprice)}</td>
                  <td className="px-2 py-1 text-right text-gray-500">{fmt(s?.pubprice)}</td>
                  <td className="px-2 py-1 text-right text-gray-500">{fmt(s?.winprice)}</td>
                  <td className="px-2 py-1 text-right text-emerald-700 font-semibold">{fmt(c.total_spent)}</td>
                  <td className="px-2 py-1 text-right text-blue-700 font-semibold border-l">{period ? fmt(period.spend) : '—'}</td>
                  <td className="px-2 py-1 text-right text-gray-700">{period ? fmt(period.mediaCost) : '—'}</td>
                  <td className="px-2 py-1 text-right text-gray-700">{period ? fmt(period.agencyFee) : '—'}</td>
                  <td className="px-2 py-1 text-right text-gray-700">{period ? fmt(period.dmpFee) : '—'}</td>
                  <td className="px-2 py-1 text-right text-amber-700 font-bold border-l">{fmt(mapped)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg bg-blue-50/60 border border-blue-200 p-3 text-[11px] text-gray-700 space-y-1">
        <p className="font-semibold text-blue-800">사용자 확인 요청</p>
        <p>위 표에서 실제 매출과 일치하는 컬럼을 확인 후 어떤 필드명인지 알려주세요. 매핑을 그 필드로 교체합니다.</p>
        <p className="text-gray-500">
          <span className="text-emerald-700 font-semibold">total_spent</span> 는 lifetime 가능성이 있으니
          기간 변경 시 값이 동일하면 lifetime, 변하면 기간 합산입니다 — 직접 테스트 후 결정해주세요.
        </p>
      </div>
    </div>
  )
}
