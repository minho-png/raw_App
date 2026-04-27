"use client"
import React, { useMemo, useState } from "react"
import type { MotivCampaign, MotivAdAccount } from "@/lib/motivApi/types"
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
  /** Motiv adaccount.id → adaccount 정보 (기본값 자동 채우기용). 없으면 fallback. */
  adAccountById?: Map<number, MotivAdAccount>
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
  adAccountById,
}: Props) {
  const byId = React.useMemo(() => {
    const m = new Map<number, MotivAssignment>()
    for (const a of assignments) m.set(a.motivCampaignId, a)
    return m
  }, [assignments])

  // ─── 필터 + 일괄 지정 상태 ─────────────────────────────────────
  const [search, setSearch] = useState('')
  const [unassignedOnly, setUnassignedOnly] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkAgencyId, setBulkAgencyId] = useState('')
  const [bulkAdvertiserId, setBulkAdvertiserId] = useState('')
  const [bulkOperatorId, setBulkOperatorId] = useState('')

  const filteredCampaigns = useMemo(() => {
    const q = search.trim().toLowerCase()
    return campaigns.filter(c => {
      if (unassignedOnly) {
        const a = byId.get(c.id)
        if (a?.agencyId) return false
      }
      if (q && !(c.title ?? '').toLowerCase().includes(q)) return false
      return true
    })
  }, [campaigns, search, unassignedOnly, byId])

  const unassignedCount = useMemo(
    () => campaigns.filter(c => !byId.get(c.id)?.agencyId).length,
    [campaigns, byId],
  )

  function toggleOne(id: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  function toggleAllVisible() {
    setSelected(prev => {
      const allVisibleSelected = filteredCampaigns.every(c => prev.has(c.id))
      if (allVisibleSelected) {
        const next = new Set(prev)
        for (const c of filteredCampaigns) next.delete(c.id)
        return next
      }
      const next = new Set(prev)
      for (const c of filteredCampaigns) next.add(c.id)
      return next
    })
  }
  function clearSelection() { setSelected(new Set()) }

  function applyBulk() {
    if (selected.size === 0) return
    if (!bulkAgencyId && !bulkAdvertiserId && !bulkOperatorId) {
      alert('적용할 대행사 / 광고주 / 운영자 중 하나는 선택해야 합니다.')
      return
    }
    for (const id of selected) {
      const existing = byId.get(id)
      onUpsertAssignment({
        ...(existing ?? {}),
        motivCampaignId: id,
        agencyId:     bulkAgencyId     || existing?.agencyId,
        advertiserId: bulkAdvertiserId || existing?.advertiserId,
        operatorId:   bulkOperatorId   || existing?.operatorId,
      })
    }
    clearSelection()
    setBulkAgencyId(''); setBulkAdvertiserId(''); setBulkOperatorId('')
  }

  // 합계 (집행금액·수수료)
  const totals = React.useMemo(() => {
    let spend = 0, agencyFee = 0, dataFee = 0, revenue = 0
    for (const c of filteredCampaigns) {
      spend     += n(c.stats?.cost)
      agencyFee += n(c.stats?.agency_fee)
      dataFee   += n(c.stats?.data_fee)
      revenue   += n(c.stats?.revenue)
    }
    return { spend, agencyFee, dataFee, revenue }
  }, [filteredCampaigns])

  return (
    <section className="rounded-lg border border-gray-200 bg-white">
      <header className="border-b border-gray-100 px-4 py-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
            {exchangeRate > 0 && (
              <span className="text-[10px] text-gray-400">환율 {exchangeRate.toLocaleString()}</span>
            )}
          </div>
          <div className="text-xs text-gray-500">
            전체 <strong className="text-gray-800">{campaigns.length}</strong>건
            {unassignedCount > 0 && (
              <> · 미지정 <strong className="text-orange-600">{unassignedCount}</strong>건</>
            )}
            {filteredCampaigns.length !== campaigns.length && (
              <> · <span className="text-blue-600">필터 결과 {filteredCampaigns.length}건</span></>
            )}
          </div>
        </div>

        {/* 필터 줄 */}
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔍 캠페인명 검색"
            className="min-w-[200px] rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <label className="inline-flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={unassignedOnly}
              onChange={e => setUnassignedOnly(e.target.checked)}
              className="rounded"
            />
            미지정만 보기
          </label>
        </div>

        {/* 일괄 적용 줄 */}
        <div className={`flex items-center gap-2 flex-wrap rounded-lg border px-2 py-1.5 ${
          selected.size > 0 ? 'border-blue-300 bg-blue-50' : 'border-dashed border-gray-200 bg-gray-50/40'
        }`}>
          <span className="text-xs font-medium text-gray-700">
            선택 <strong className={selected.size > 0 ? 'text-blue-700' : 'text-gray-400'}>{selected.size}</strong>건
          </span>
          <span className="text-gray-300">·</span>
          <span className="text-[11px] text-gray-500">대행사:</span>
          <select value={bulkAgencyId} onChange={e => setBulkAgencyId(e.target.value)}
            className="rounded border border-gray-200 px-2 py-1 text-xs">
            <option value="">— 변경 안 함 —</option>
            {agencies.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <span className="text-[11px] text-gray-500">광고주:</span>
          <select value={bulkAdvertiserId} onChange={e => setBulkAdvertiserId(e.target.value)}
            className="rounded border border-gray-200 px-2 py-1 text-xs">
            <option value="">— 변경 안 함 —</option>
            {advertisers
              .filter(ad => !bulkAgencyId || ad.agencyId === bulkAgencyId)
              .map(ad => <option key={ad.id} value={ad.id}>{ad.name}</option>)}
          </select>
          <span className="text-[11px] text-gray-500">운영자:</span>
          <select value={bulkOperatorId} onChange={e => setBulkOperatorId(e.target.value)}
            className="rounded border border-gray-200 px-2 py-1 text-xs">
            <option value="">— 변경 안 함 —</option>
            {operators.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <button
            onClick={applyBulk}
            disabled={selected.size === 0 || (!bulkAgencyId && !bulkAdvertiserId && !bulkOperatorId)}
            className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            선택 {selected.size}건에 적용
          </button>
          {selected.size > 0 && (
            <button
              onClick={clearSelection}
              className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
            >
              선택 해제
            </button>
          )}
        </div>
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

      {!loading && !error && campaigns.length > 0 && filteredCampaigns.length === 0 && (
        <p className="px-4 py-6 text-center text-xs text-gray-400">필터 조건에 맞는 캠페인이 없습니다.</p>
      )}

      {!loading && !error && filteredCampaigns.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-2 w-8">
                  <input
                    type="checkbox"
                    checked={filteredCampaigns.length > 0 && filteredCampaigns.every(c => selected.has(c.id))}
                    ref={el => {
                      if (!el) return
                      const some = filteredCampaigns.some(c => selected.has(c.id))
                      const all  = filteredCampaigns.every(c => selected.has(c.id))
                      el.indeterminate = some && !all
                    }}
                    onChange={toggleAllVisible}
                    className="rounded"
                  />
                </th>
                <th className="px-3 py-2 text-left text-gray-500 font-medium">캠페인</th>
                <th className="px-3 py-2 text-left text-gray-500 font-medium">분류</th>
                <th className="px-3 py-2 text-left text-gray-500 font-medium">대행사</th>
                <th className="px-3 py-2 text-left text-gray-500 font-medium">광고주</th>
                <th className="px-3 py-2 text-left text-gray-500 font-medium">운영자</th>
                <th className="px-3 py-2 text-right text-gray-500 font-medium">집행금액<br/><span className="text-[9px] font-normal text-gray-400">(cost)</span></th>
                <th className="px-3 py-2 text-right text-gray-500 font-medium">수수료<br/><span className="text-[9px] font-normal text-gray-400">(agency_fee)</span></th>
                <th className="px-3 py-2 text-right text-gray-500 font-medium">DMP 비용<br/><span className="text-[9px] font-normal text-gray-400">(data_fee)</span></th>
                <th className="px-3 py-2 text-right text-gray-500 font-medium">매출<br/><span className="text-[9px] font-normal text-gray-400">(revenue)</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredCampaigns.map(c => {
                const a = byId.get(c.id)
                const product = motivTypeToProduct(c.campaign_type)
                const adAcc = adAccountById?.get(c.adaccount_id)
                const apiAgencyName    = adAcc?.agency_name    ?? adAcc?.agency?.name    ?? null
                const apiAdvName       = adAcc?.advertiser_name ?? adAcc?.advertiser?.name ?? null
                const apiOperatorName  = adAcc?.manager_name   ?? adAcc?.manager?.name   ?? null
                const isSelected = selected.has(c.id)
                return (
                  <tr key={c.id} className={`align-middle ${isSelected ? 'bg-blue-50/60' : 'hover:bg-gray-50'}`}>
                    <td className="px-2 py-2 w-8">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOne(c.id)}
                        className="rounded"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-medium text-gray-800 truncate max-w-[220px]" title={c.title ?? ''}>
                        {c.title ?? `#${c.id}`}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        {c.campaign_type} · {c.delivery_type} · {c.status === 'Y' ? '활성' : '종료'}
                        {adAcc?.name && <> · 계정 <span className="text-gray-500">{adAcc.name}</span></>}
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
                      {!a?.agencyId && apiAgencyName && (
                        <p className="mt-0.5 text-[9px] text-purple-600 truncate" title={`Motiv 기본값: ${apiAgencyName}`}>
                          API: {apiAgencyName}
                        </p>
                      )}
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
                      {!a?.advertiserId && apiAdvName && (
                        <p className="mt-0.5 text-[9px] text-purple-600 truncate" title={`Motiv 기본값: ${apiAdvName}`}>
                          API: {apiAdvName}
                        </p>
                      )}
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
                      {!a?.operatorId && apiOperatorName && (
                        <p className="mt-0.5 text-[9px] text-purple-600 truncate" title={`Motiv 기본값: ${apiOperatorName}`}>
                          API: {apiOperatorName}
                        </p>
                      )}
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
                <td className="px-3 py-2 font-semibold text-gray-700" colSpan={6}>합계</td>
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
