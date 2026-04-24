"use client"
import React from "react"
import type { MotivCampaign } from "@/lib/motivApi/types"
import type { Agency } from "@/lib/campaignTypes"
import { motivTypeToProduct, MEDIA_PRODUCT_LABEL, type MotivAssignment } from "@/lib/motivApi/productMapping"

interface Props {
  title: string
  loading: boolean
  error: string | null
  campaigns: MotivCampaign[]
  agencies: Agency[]
  assignments: MotivAssignment[]
}

function fmt(n: number) { return Math.round(n).toLocaleString("ko-KR") }
function n(v: number | null | undefined) { return Number.isFinite(v as number) ? (v as number) : 0 }

interface AgencyBucket {
  agency: Agency | null      // null = 미지정
  items: {
    campaign: MotivCampaign
    product: 'CT' | 'CTV'
    spend: number
    agencyFee: number
    dataFee: number
    revenue: number
  }[]
  spend: number
  agencyFee: number
  dataFee: number
  revenue: number
}

/**
 * 정산 확인 페이지에서 저장된 motiv_assignments.agencyId 를 기준으로
 * CT · CTV 캠페인을 대행사별로 집계해 보여주는 **읽기 전용** 뷰.
 * "대행사별 수수료" 페이지 전용.
 */
export function MotivAgencyAggregation({
  title, loading, error, campaigns, agencies, assignments,
}: Props) {
  const byAgency = React.useMemo(() => {
    const assignById = new Map(assignments.map(a => [a.motivCampaignId, a]))
    const agById     = new Map(agencies.map(a => [a.id, a]))
    const buckets = new Map<string, AgencyBucket>()

    const ensureBucket = (key: string, agency: Agency | null): AgencyBucket => {
      let b = buckets.get(key)
      if (!b) {
        b = { agency, items: [], spend: 0, agencyFee: 0, dataFee: 0, revenue: 0 }
        buckets.set(key, b)
      }
      return b
    }

    for (const c of campaigns) {
      const product = motivTypeToProduct(c.campaign_type)
      if (product !== 'CT' && product !== 'CTV') continue
      const a = assignById.get(c.id)
      const ag = a?.agencyId ? agById.get(a.agencyId) ?? null : null
      const key = ag?.id ?? '__unassigned__'
      const bucket = ensureBucket(key, ag)
      const spend     = n(c.stats?.cost)
      const agencyFee = n(c.stats?.agency_fee)
      const dataFee   = n(c.stats?.data_fee)
      const revenue   = n(c.stats?.revenue)
      bucket.items.push({ campaign: c, product, spend, agencyFee, dataFee, revenue })
      bucket.spend     += spend
      bucket.agencyFee += agencyFee
      bucket.dataFee   += dataFee
      bucket.revenue   += revenue
    }

    return [...buckets.values()].sort((a, b) => {
      // 미지정을 마지막으로
      if (!a.agency && b.agency) return 1
      if (a.agency && !b.agency) return -1
      return (a.agency?.name ?? '').localeCompare(b.agency?.name ?? '')
    })
  }, [campaigns, assignments, agencies])

  const totals = React.useMemo(() => {
    let spend = 0, agencyFee = 0, dataFee = 0, revenue = 0
    for (const b of byAgency) {
      spend += b.spend; agencyFee += b.agencyFee; dataFee += b.dataFee; revenue += b.revenue
    }
    return { spend, agencyFee, dataFee, revenue }
  }, [byAgency])

  const unassignedCount = byAgency.find(b => !b.agency)?.items.length ?? 0

  return (
    <section className="rounded-lg border border-gray-200 bg-white">
      <header className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          {unassignedCount > 0 && (
            <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-orange-700">
              미지정 {unassignedCount}건
            </span>
          )}
          <span>{campaigns.length}개 캠페인</span>
        </div>
      </header>

      {loading && <p className="px-4 py-6 text-center text-xs text-gray-400">불러오는 중...</p>}
      {error && (
        <div className="m-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          Motiv API 오류: {error}
        </div>
      )}

      {!loading && !error && byAgency.length === 0 && (
        <p className="px-4 py-6 text-center text-xs text-gray-400">해당 월에 집행된 CT/CTV 캠페인이 없습니다.</p>
      )}

      {!loading && !error && byAgency.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-gray-500 font-medium">대행사</th>
                <th className="px-3 py-2 text-left text-gray-500 font-medium">캠페인</th>
                <th className="px-3 py-2 text-right text-gray-500 font-medium">집행금액</th>
                <th className="px-3 py-2 text-right text-gray-500 font-medium">대행수수료</th>
                <th className="px-3 py-2 text-right text-gray-500 font-medium">데이터비</th>
                <th className="px-3 py-2 text-right text-gray-500 font-medium">매출</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {byAgency.map((bucket, bIdx) => (
                <React.Fragment key={bucket.agency?.id ?? '__unassigned__'}>
                  {/* 대행사 집계 행 */}
                  <tr className={`${bucket.agency ? 'bg-blue-50' : 'bg-orange-50'} border-t-2 ${bIdx === 0 ? 'border-transparent' : 'border-gray-200'}`}>
                    <td className="px-3 py-2 font-semibold" colSpan={2}>
                      {bucket.agency ? (
                        <span className="text-blue-900">{bucket.agency.name}</span>
                      ) : (
                        <span className="text-orange-700">미지정 (정산 확인에서 대행사 지정 필요)</span>
                      )}
                      <span className="ml-2 text-[10px] text-gray-500">· {bucket.items.length}건</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-900">{fmt(bucket.spend)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-blue-700">{fmt(bucket.agencyFee)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-700">{fmt(bucket.dataFee)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-700">{fmt(bucket.revenue)}</td>
                  </tr>

                  {/* 캠페인 상세 행 */}
                  {bucket.items.map(item => (
                    <tr key={item.campaign.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 pl-6 text-gray-400">└</td>
                      <td className="px-3 py-2">
                        <span className={`mr-2 inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                          item.product === 'CTV' ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {MEDIA_PRODUCT_LABEL[item.product]}
                        </span>
                        <span className="text-gray-800 truncate max-w-[240px] inline-block align-middle" title={item.campaign.title ?? ''}>
                          {item.campaign.title ?? `#${item.campaign.id}`}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-600">{fmt(item.spend)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-blue-600">{fmt(item.agencyFee)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-500">{fmt(item.dataFee)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-500">{fmt(item.revenue)}</td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
            <tfoot className="bg-gray-100">
              <tr>
                <td className="px-3 py-2 font-bold text-gray-900" colSpan={2}>합계</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold text-gray-900">{fmt(totals.spend)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold text-blue-700">{fmt(totals.agencyFee)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold text-gray-900">{fmt(totals.dataFee)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold text-gray-900">{fmt(totals.revenue)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  )
}
