"use client"

import { useState } from "react"
import { roundWon, fmtMargin } from "@/lib/calculationService"
import { SettlementFilterBar } from "@/components/atoms/SettlementFilterBar"
import type { MediaProductFilter } from "@/lib/motivApi/productMapping"
import { useOpenApiSettlements } from "@/lib/hooks/useOpenApiSettlements"
import { findDimension } from "@/lib/openApi/settlementsTypes"
import { friendlyOpenApiError } from "@/lib/openApi/health"
import { useOpenApiSettlementSnapshot } from "@/lib/hooks/useOpenApiSettlementSnapshot"
import { SnapshotActions, SnapshotStatusBadge } from "@/components/settlement/SnapshotActions"

function fmt(n: number) { return roundWon(n).toLocaleString("ko-KR") }
function toMonthStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

export default function SalesPurchasePage() {
  const today = new Date()
  const [month, setMonth]     = useState(toMonthStr(today))
  const [product, setProduct] = useState<MediaProductFilter>('ALL')

  // Motiv CT/CTV 데이터 — Open API 정산 집계만 사용 (legacy CT+ raw 파이프라인 제거됨).
  const showCt    = product === 'ALL' || product === 'CT'
  const showCtv   = product === 'ALL' || product === 'CTV'
  const motivProduct = showCt && showCtv ? 'CT_CTV_BOTH' : showCtv ? 'CTV' : showCt ? 'CT' : null
  // CT/CTV 매출/매입 — 새 Open API 정산 집계 (월 단위, groupBy=AGENCY). 실측
  // revenue/grossProfit/margin/mediaCost 직접 제공 (cost×요율 파생 불필요).
  const agencySettlement = useOpenApiSettlements({
    month,
    groupBy: ['AGENCY'],
    orderBy: 'revenue',
    order: 'DESC',
    enabled: motivProduct !== null,
  })
  // DB 영속화 스냅샷 (PR-C 인프라).
  const agencySnapshot = useOpenApiSettlementSnapshot({ month, groupBy: ['AGENCY'], enabled: motivProduct !== null })

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">매입/매출 현황</h1>
          <p className="text-xs text-gray-400 mt-0.5">Open API 기반 CT/CTV 대행사별 정산 (월별 실측값)</p>
        </div>
      </header>

      <main className="p-6 space-y-4">
        <SettlementFilterBar
          month={month}
          onMonthChange={setMonth}
          product={product}
          onProductChange={setProduct}
        />

        {/* product=CT_PLUS 단일 선택 시 Open API 정산 섹션 미표시 — 사용자 안내 (FE-B). */}
        {!motivProduct && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-2.5 text-[11px] text-emerald-900 flex items-center gap-2">
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">안내</span>
            <span>
              <strong>CT/CTV 대행사별 공식 정산값(Open API)</strong>은 product 필터를 <strong>&apos;CT&apos;</strong>, <strong>&apos;CTV&apos;</strong>, 또는 <strong>&apos;ALL&apos;</strong> 로 선택하면 표시됩니다.
            </span>
          </div>
        )}

        {/* CT/CTV 대행사별 정산 (Open API · 월별 실측) — revenue/grossProfit/margin/mediaCost */}
        {motivProduct && (() => {
          const rawRows = agencySnapshot.doc
            ? agencySnapshot.doc.rows.map(r => ({ dimension: r.dimension, metrics: r.metrics }))
            : agencySettlement.rows
          const rows = rawRows.map(r => ({ ...r, metrics: agencySnapshot.effectiveMetrics(r as { dimension: unknown[]; metrics: Record<string, number> }) }))
          const tot = rows.reduce((a, r) => ({
            revenue: a.revenue + (r.metrics.revenue ?? 0),
            grossProfit: a.grossProfit + (r.metrics.grossProfit ?? 0),
            mediaCost: a.mediaCost + (r.metrics.mediaCost ?? 0),
          }), { revenue: 0, grossProfit: 0, mediaCost: 0 })
          return (
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-gray-100 flex-wrap">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-gray-700">CT/CTV 대행사별 정산 ({month})</p>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700" title="Open API 월별 실측값 — 정산 공식값으로 사용">공식 정산값 · Open API</span>
                  <SnapshotStatusBadge doc={agencySnapshot.doc} />
                </div>
                <div className="flex items-center gap-2">
                  <SnapshotActions snapshot={agencySnapshot} liveRows={agencySettlement.rows} />
                </div>
              </div>
              {agencySettlement.loading ? (
                <div className="px-5 py-10 text-center text-sm text-gray-400">불러오는 중…</div>
              ) : agencySettlement.error ? (
                (() => {
                  const [code, ...rest] = agencySettlement.error.split(':')
                  const message = rest.join(':').trim() || undefined
                  return (
                    <div className="px-5 py-8 text-center">
                      <p className="text-sm text-rose-600">{friendlyOpenApiError(code, message)}</p>
                      <p className="mt-1 text-[11px] text-gray-400">상세 코드: {agencySettlement.error}</p>
                    </div>
                  )
                })()
              ) : rows.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-gray-400">해당 월 CT/CTV 정산 데이터가 없습니다.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="px-5 py-2.5 text-left font-medium text-gray-500">대행사</th>
                        <th className="px-4 py-2.5 text-right font-medium text-gray-500" title="revenue">매출</th>
                        <th className="px-4 py-2.5 text-right font-medium text-gray-500" title="mediaCost">매체비(매입)</th>
                        <th className="px-4 py-2.5 text-right font-medium text-gray-500" title="grossProfit">매출총이익</th>
                        <th className="px-4 py-2.5 text-right font-medium text-gray-500" title="margin">마진</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {rows.map((r, i) => {
                        const ag = findDimension(r as Parameters<typeof findDimension>[0], 'AGENCY')
                        return (
                          <tr key={ag?.id ?? i} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-5 py-2.5 font-medium text-gray-800">{ag?.name ?? ag?.id ?? '—'}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-gray-800">₩{fmt(r.metrics.revenue ?? 0)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">₩{fmt(r.metrics.mediaCost ?? 0)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700">₩{fmt(r.metrics.grossProfit ?? 0)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-gray-500" title="명세 단위(소수/퍼센트) 미확정 — 휴리스틱 표시">{fmtMargin(r.metrics.margin)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                        <td className="px-5 py-2.5 text-xs text-gray-600">합계</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-xs text-gray-800">₩{fmt(tot.revenue)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-xs text-gray-600">₩{fmt(tot.mediaCost)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-xs text-emerald-700">₩{fmt(tot.grossProfit)}</td>
                        <td className="px-3 py-2.5"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
              <div className="border-t border-gray-100 px-5 py-2.5 text-[11px] text-gray-500">
                <strong className="text-emerald-700">CT/CTV 정산 공식값</strong>은 이 표(Open API 월별 실측 — revenue/grossProfit/margin/mediaCost) 기준입니다.
              </div>
            </div>
          )
        })()}

      </main>
    </div>
  )
}
