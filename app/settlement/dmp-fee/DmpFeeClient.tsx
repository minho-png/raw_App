"use client"

import { useState } from "react"
import { SettlementFilterBar } from "@/components/atoms/SettlementFilterBar"
import { type MediaProductFilter } from "@/lib/motivApi/productMapping"
import { useOpenApiDataProviders } from "@/lib/hooks/useOpenApiDataProviders"
import { findDimension } from "@/lib/openApi/settlementsTypes"
import { friendlyOpenApiError } from "@/lib/openApi/health"
import { useOpenApiSettlementSnapshot } from "@/lib/hooks/useOpenApiSettlementSnapshot"
import { SnapshotActions, SnapshotStatusBadge } from "@/components/settlement/SnapshotActions"

/**
 * DMP 수수료 정산 페이지 — Open API DATA_PROVIDER 기반 (PR #150/151 마이그레이션).
 *
 * 데이터 소스:
 *   - Open API /settlements (DATA_PROVIDER 집계, 월별 실측)
 *   - DB 스냅샷 (영속화 + 수정값 오버레이)
 *
 * 레거시 "CT+ raw + Motiv lifetime" 파이프라인은 PR #150/151 에서 제거.
 */

function toMonthStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}
function fmtNum(n: number) { return Math.round(n).toLocaleString("ko-KR") }

export default function DmpFeeClient() {
  const [month, setMonth] = useState(() => toMonthStr(new Date()))
  const [product, setProduct] = useState<MediaProductFilter>('ALL')
  // 사용자 요청 — DMP 부분에서 매체별 확인 토글. ON 시 DATA_PROVIDER × MEDIA 매트릭스.
  const [byMedia, setByMedia] = useState(false)

  const showCt  = product === 'ALL' || product === 'CT'
  const showCtv = product === 'ALL' || product === 'CTV'
  const motivProduct = showCt && showCtv ? 'CT_CTV_BOTH' : showCtv ? 'CTV' : showCt ? 'CT' : null

  // Open API DATA_PROVIDER 집계 — DMP 공식 정산값 (월 단위 실측).
  const dataProviderSettlement = useOpenApiDataProviders({
    month,
    byMedia,
    enabled: motivProduct !== null,
  })
  // DB 영속화 — byMedia 토글에 따라 groupBy 가 다른 스냅샷 분리 저장.
  const dpSnapshot = useOpenApiSettlementSnapshot({
    month,
    groupBy: byMedia ? ['DATA_PROVIDER', 'MEDIA'] : ['DATA_PROVIDER'],
    enabled: motivProduct !== null,
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-gray-900">DMP 수수료</h1>
            <p className="text-xs text-gray-400 mt-0.5">Open API DATA_PROVIDER 월별 실측</p>
          </div>
        </div>
      </header>

      <main className="p-6 space-y-4">
        <SettlementFilterBar
          month={month} onMonthChange={setMonth}
          product={product} onProductChange={setProduct}
        />

        {/* product=CT_PLUS 단일 선택 시 Open API 정산 섹션 미표시 — 사용자 안내 (FE-B). */}
        {!motivProduct && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-2.5 text-[11px] text-emerald-900 flex items-center gap-2">
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">안내</span>
            <span>
              <strong>CT/CTV 공식 정산값(Open API)</strong>은 product 필터를 <strong>&apos;CT&apos;</strong>, <strong>&apos;CTV&apos;</strong>, 또는 <strong>&apos;ALL&apos;</strong> 로 선택하면 표시됩니다.
            </span>
          </div>
        )}

        {/* DMP 공식 정산값 — Open API DATA_PROVIDER 집계 (월별 실측, 사용자 결정 2026-06-16) */}
        {motivProduct && (() => {
          const rawRows = dpSnapshot.doc
            ? dpSnapshot.doc.rows.map(r => ({ dimension: r.dimension, metrics: r.metrics }))
            : dataProviderSettlement.rows
          const merged = rawRows.map(r => ({ ...r, metrics: dpSnapshot.effectiveMetrics(r as { dimension: unknown[]; metrics: Record<string, number> }) }))
          // QA BUG-CT-08: byMedia=false 일 때 동일 DATA_PROVIDER id 가 여러 행으로 분리돼 오는 경우
          // (특히 "NON" 더미) 가 있어 클라이언트 합산. byMedia=true 는 DMP × MEDIA 매트릭스라 합산 안 함.
          const rows = byMedia ? merged : (() => {
            const agg = new Map<string, typeof merged[number]>()
            for (const r of merged) {
              const dp = findDimension(r as Parameters<typeof findDimension>[0], 'DATA_PROVIDER')
              const k = dp?.id ?? '-'
              const cur = agg.get(k)
              if (cur) {
                const nm: Record<string, number> = { ...cur.metrics }
                for (const [mk, mv] of Object.entries(r.metrics)) nm[mk] = (nm[mk] ?? 0) + (mv ?? 0)
                agg.set(k, { ...cur, metrics: nm })
              } else {
                agg.set(k, r)
              }
            }
            return Array.from(agg.values())
          })()
          const totalCost = rows.reduce((s, r) => s + (r.metrics.mediaCost ?? 0), 0)
          return (
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-gray-100 flex-wrap">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-gray-700">DMP(데이터 제공자)별 정산 ({month})</p>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700" title="Open API 월별 실측값 — 정산 공식값으로 사용">공식 정산값 · Open API</span>
                  <SnapshotStatusBadge doc={dpSnapshot.doc} />
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-[11px] text-gray-500 select-none cursor-pointer" title="DMP × 매체 매트릭스로 분리해 확인">
                    <input
                      type="checkbox"
                      checked={byMedia}
                      onChange={e => setByMedia(e.target.checked)}
                      className="h-3.5 w-3.5 accent-emerald-600"
                    />
                    매체별로 보기
                  </label>
                  <SnapshotActions snapshot={dpSnapshot} liveRows={dataProviderSettlement.rows} />
                </div>
              </div>
              {dataProviderSettlement.loading ? (
                <div className="px-5 py-10 text-center text-sm text-gray-400 flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin text-gray-400" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity=".25"/><path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>
                  불러오는 중…
                </div>
              ) : dataProviderSettlement.error ? (
                (() => {
                  const [code, ...rest] = dataProviderSettlement.error.split(':')
                  const message = rest.join(':').trim() || undefined
                  return (
                    <div className="px-5 py-8 text-center">
                      <p className="text-sm text-rose-600">{friendlyOpenApiError(code, message)}</p>
                      <p className="mt-1 text-[11px] text-gray-400">상세 코드: {dataProviderSettlement.error}</p>
                    </div>
                  )
                })()
              ) : rows.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-gray-400">해당 월 DMP 정산 데이터가 없습니다.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="px-5 py-2.5 text-left font-medium text-gray-500">데이터 제공자</th>
                        {byMedia && <th className="px-4 py-2.5 text-left font-medium text-gray-500">매체</th>}
                        <th className="px-4 py-2.5 text-right font-medium text-gray-500" title="mediaCost">매체비</th>
                        <th className="px-4 py-2.5 text-right font-medium text-gray-500">비중</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {rows.map((r, i) => {
                        const dp = findDimension(r as Parameters<typeof findDimension>[0], 'DATA_PROVIDER')
                        const md = byMedia ? findDimension(r as Parameters<typeof findDimension>[0], 'MEDIA') : undefined
                        const cost = r.metrics.mediaCost ?? 0
                        // 명세: 데이터비용 없으면 id="NON", name="데이터비용 없음"
                        const isNone = dp?.id === 'NON'
                        // QA-1: 같은 DMP+매체 조합이 여러 번 오면 key 중복 → index 추가로 고유성 보장.
                        return (
                          <tr key={`${dp?.id ?? '-'}-${md?.id ?? '-'}-${i}`} className={`hover:bg-gray-50/50 transition-colors ${isNone ? 'text-gray-400' : ''}`}>
                            <td className="px-5 py-2.5 font-medium">{dp?.name ?? dp?.id ?? '—'}</td>
                            {byMedia && <td className="px-4 py-2.5 text-gray-700">{md?.name ?? md?.id ?? '—'}</td>}
                            <td className="px-4 py-2.5 text-right tabular-nums">₩{fmtNum(cost)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums">{totalCost > 0 ? ((cost / totalCost) * 100).toFixed(1) + '%' : '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                        <td className="px-5 py-2.5 text-xs text-gray-600" colSpan={byMedia ? 2 : 1}>합계</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-xs text-gray-800">₩{fmtNum(totalCost)}</td>
                        <td className="px-3 py-2.5"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
              <div className="border-t border-gray-100 px-5 py-2.5 text-[11px] text-gray-500">
                <strong className="text-emerald-700">DMP 정산 공식값</strong>은 이 표(Open API DATA_PROVIDER · 월별 실측) 기준입니다.
                <span className="ml-1 text-gray-400">⚠ 데이터비용 분해 metric 은 명세 미확정 — 현재 mediaCost 만 표시. 명세 확정 시 dataFee 로 교체.</span>
              </div>
            </div>
          )
        })()}
      </main>
    </div>
  )
}
