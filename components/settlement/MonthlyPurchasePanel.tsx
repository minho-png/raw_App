"use client"

/**
 * 매입(매체비) 패널 — 다른 페이지(`/settlement/media-cost`) 에서 입력/저장된
 * monthly_media_costs 컬렉션을 읽어와 해당 월의 매체별 매입금액을 표시.
 *
 * 사용자 요구 (2026-06-23): "매입의 경우 다른 페이지에서 입력 및 저장한 정보를
 * 바탕으로 DB에 불러와 보여주는 것."
 *
 * 입력 UI 는 여기 없음 (media-cost 페이지에 있음) — 표시 + 합계 + 안내 링크만.
 */

import { useMemo } from 'react'
import Link from 'next/link'
import { useMonthlyMediaCosts, type MediaCostCategory } from '@/lib/hooks/useMonthlyMediaCosts'
import { roundWon } from '@/lib/calculationService'

interface Props {
  /** YYYY-MM. amounts[monthIndex] 추출. */
  month: string
}

const CATEGORY_LABEL: Record<MediaCostCategory, string> = {
  CTV: 'CTV',
  CT: 'CT',
  'CT+': 'CT+',
}
const CATEGORY_ORDER: MediaCostCategory[] = ['CTV', 'CT', 'CT+']

function fmt(n: number): string {
  return roundWon(Number.isFinite(n) ? n : 0).toLocaleString('ko-KR')
}

export function MonthlyPurchasePanel({ month }: Props) {
  const [yearStr, monthStr] = month.split('-')
  const year = parseInt(yearStr, 10)
  const monthIndex = String(parseInt(monthStr, 10))
  const { data, loading, error } = useMonthlyMediaCosts(year)

  const grouped = useMemo(() => {
    const byCat = new Map<MediaCostCategory, Array<{ mediaName: string; amount: number; currency?: string }>>()
    for (const doc of data) {
      const amount = Number(doc.amounts?.[monthIndex] ?? 0)
      if (amount === 0) continue
      const cat = (doc.category ?? 'CT') as MediaCostCategory
      const arr = byCat.get(cat) ?? []
      arr.push({ mediaName: doc.mediaName, amount, currency: doc.currency })
      byCat.set(cat, arr)
    }
    return byCat
  }, [data, monthIndex])

  const grandTotal = useMemo(
    () => Array.from(grouped.values()).reduce((s, arr) => s + arr.reduce((ss, r) => ss + r.amount, 0), 0),
    [grouped],
  )

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-gray-100 flex-wrap">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-gray-700">매입(매체비) — {month}</p>
          <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-700" title="monthly_media_costs DB · /settlement/media-cost 에서 입력">
            DB · monthly_media_costs
          </span>
        </div>
        <Link
          href="/settlement/media-cost"
          className="rounded border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50"
        >매입 입력 페이지 →</Link>
      </div>
      {loading ? (
        <div className="px-5 py-8 text-center text-sm text-gray-400">불러오는 중…</div>
      ) : error ? (
        <div className="px-5 py-6 text-center text-sm text-rose-600">{error}</div>
      ) : grandTotal === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-gray-400">
          {month} 매입 데이터가 없습니다. 매입 입력 페이지에서 매체별 금액을 등록하세요.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-5 py-2.5 text-left font-medium text-gray-500">카테고리</th>
                <th className="px-4 py-2.5 text-left font-medium text-gray-500">매체</th>
                <th className="px-4 py-2.5 text-right font-medium text-gray-500">매입금액</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {CATEGORY_ORDER.flatMap(cat => {
                const rows = grouped.get(cat) ?? []
                if (rows.length === 0) return []
                const catTotal = rows.reduce((s, r) => s + r.amount, 0)
                return [
                  ...rows.map(r => (
                    <tr key={`${cat}:${r.mediaName}`} className="hover:bg-gray-50/50">
                      <td className="px-5 py-2 text-gray-500">{CATEGORY_LABEL[cat]}</td>
                      <td className="px-4 py-2 text-gray-800">
                        {r.mediaName}
                        {r.currency === 'USD' && <span className="ml-1 rounded bg-yellow-50 px-1 text-[9px] text-yellow-700">USD</span>}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-700">₩{fmt(r.amount)}</td>
                    </tr>
                  )),
                  <tr key={`${cat}:_sub`} className="bg-gray-50/60 font-medium">
                    <td className="px-5 py-1.5 text-[11px] text-gray-500" colSpan={2}>↳ {CATEGORY_LABEL[cat]} 소계</td>
                    <td className="px-4 py-1.5 text-right tabular-nums text-[11px] text-gray-700">₩{fmt(catTotal)}</td>
                  </tr>,
                ]
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                <td className="px-5 py-2.5 text-xs text-gray-700" colSpan={2}>매입 합계</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-xs text-gray-800">₩{fmt(grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <div className="border-t border-gray-100 px-5 py-2 text-[11px] text-gray-500">
        매입(매체비) 수치는 <Link href="/settlement/media-cost" className="text-blue-600 hover:underline">매입 입력</Link> 페이지의
        월별 입력값(<code className="rounded bg-gray-100 px-1 text-[10px]">monthly_media_costs</code>) 기준입니다.
      </div>
    </div>
  )
}
