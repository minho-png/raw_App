"use client"
import React from "react"
import type { MotivCampaign } from "@/lib/motivApi/types"
import type { Agency, Advertiser, Operator } from "@/lib/campaignTypes"
import { motivTypeToProduct, MEDIA_PRODUCT_LABEL, type MotivAssignment } from "@/lib/motivApi/productMapping"

interface Props {
  title: string
  loading: boolean
  error: string | null
  campaigns: MotivCampaign[]
  exchangeRate: number
  agencies: Agency[]
  advertisers: Advertiser[]
  operators: Operator[]
  assignments: MotivAssignment[]
  onUpsertAssignment: (a: MotivAssignment) => void
}

function fmt(n: number) { return n.toLocaleString("ko-KR") }
function n(v: number | null | undefined) { return Number.isFinite(v as number) ? (v as number) : 0 }

/**
 * Motiv 기반(CT/CTV) 캠페인 정산 간이 테이블.
 * 내부 agency/advertiser/operator 목록을 드롭다운으로 제공하여 재지정 가능.
 * 저장은 MongoDB motiv_assignments 컬렉션에 즉시 반영 (useMotivAssignments.upsert).
 */
export function MotivSettlementTable({
  title, loading, error, campaigns, exchangeRate,
  agencies, advertisers, operators,
  assignments, onUpsertAssignment,
}: Props) {
  const byId = React.useMemo(() => {
    const m = new Map<number, MotivAssignment>()
    for (const a of assignments) m.set(a.motivCampaignId, a)
    return m
  }, [assignments])

  // 합계 (집행금액·수수료)
  const totals = React.useMemo(() => {
    let spend = 0, agencyFee = 0, dataFee = 0, revenue = 0
    for (const c of campaigns) {
      spend     += n(c.stats?.cost)
      agencyFee += n(c.stats?.agency_fee)
      dataFee   += n(c.stats?.data_fee)
      revenue   += n(c.stats?.revenue)
    }
    return { spend, agencyFee, dataFee, revenue }
  }, [campaigns])

  return (
    <section className="rounded-lg border border-gray-200 bg-white">
      <header className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {exchangeRate > 0 && (
            <span className="text-[10px] text-gray-400">환율 {exchangeRate.toLocaleString()}</span>
          )}
        </div>
        <span className="text-xs text-gray-500">{campaigns.length}건</span>
      </header>

      {loading && <p className="px-4 py-6 text-center text-xs text-gray-400">불러오는 중...</p>}
      {error && (
        <div className="m-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          Motiv API 오류: {error}
        </div>
      )}

      {!loading && !error && campaigns.length === 0 && (
        <p className="px-4 py-6 text-center text-xs text-gray-400">해당 월에 집행된 캠페인이 없습니다.</p>
      )}

      {!loading && !error && campaigns.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-gray-500 font-medium">캠페인</th>
                <th className="px-3 py-2 text-left text-gray-500 font-medium">분류</th>
                <th className="px-3 py-2 text-left text-gray-500 font-medium">대행사</th>
                <th className="px-3 py-2 text-left text-gray-500 font-medium">광고주</th>
                <th className="px-3 py-2 text-left text-gray-500 font-medium">운영자</th>
                <th className="px-3 py-2 text-right text-gray-500 font-medium">집행금액</th>
                <th className="px-3 py-2 text-right text-gray-500 font-medium">대행수수료</th>
                <th className="px-3 py-2 text-right text-gray-500 font-medium">데이터비</th>
                <th className="px-3 py-2 text-right text-gray-500 font-medium">매출</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {campaigns.map(c => {
                const a = byId.get(c.id)
                const product = motivTypeToProduct(c.campaign_type)
                return (
                  <tr key={c.id} className="hover:bg-gray-50 align-middle">
                    <td className="px-3 py-2">
                      <p className="font-medium text-gray-800 truncate max-w-[220px]" title={c.title ?? ''}>
                        {c.title ?? `#${c.id}`}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        {c.campaign_type} · {c.delivery_type} · {c.status === 'Y' ? '활성' : '종료'}
                      </p>
                    </td>
                    <td className="px-3 py-2">
                      {product && (
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          product === 'CTV' ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {MEDIA_PRODUCT_LABEL[product]}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={a?.agencyId ?? ''}
                        onChange={e => onUpsertAssignment({ ...(a ?? {}), motivCampaignId: c.id, agencyId: e.target.value || undefined })}
                        className="w-full min-w-[110px] rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                      >
                        <option value="">미지정</option>
                        {agencies.map(ag => <option key={ag.id} value={ag.id}>{ag.name}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={a?.advertiserId ?? ''}
                        onChange={e => onUpsertAssignment({ ...(a ?? {}), motivCampaignId: c.id, advertiserId: e.target.value || undefined })}
                        className="w-full min-w-[110px] rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                      >
                        <option value="">미지정</option>
                        {advertisers
                          .filter(ad => !a?.agencyId || ad.agencyId === a.agencyId)
                          .map(ad => <option key={ad.id} value={ad.id}>{ad.name}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={a?.operatorId ?? ''}
                        onChange={e => onUpsertAssignment({ ...(a ?? {}), motivCampaignId: c.id, operatorId: e.target.value || undefined })}
                        className="w-full min-w-[100px] rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                      >
                        <option value="">미지정</option>
                        {operators.map(op => <option key={op.id} value={op.id}>{op.name}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmt(Math.round(n(c.stats?.cost)))}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmt(Math.round(n(c.stats?.agency_fee)))}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmt(Math.round(n(c.stats?.data_fee)))}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmt(Math.round(n(c.stats?.revenue)))}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="bg-gray-50">
              <tr>
                <td className="px-3 py-2 font-semibold text-gray-700" colSpan={5}>합계</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-900">{fmt(Math.round(totals.spend))}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-900">{fmt(Math.round(totals.agencyFee))}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-900">{fmt(Math.round(totals.dataFee))}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-900">{fmt(Math.round(totals.revenue))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  )
}
