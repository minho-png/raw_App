"use client"

import { useState, useMemo, useEffect } from "react"
import { useMasterData } from "@/lib/hooks/useMasterData"
import { useRawData } from "@/lib/hooks/useRawData"
import { applyMarkupToRows } from "@/lib/markupService"
import { DMP_FEE_RATES_DECIMAL } from "@/lib/calculationService"
import { SettlementFilterBar } from "@/components/atoms/SettlementFilterBar"
import { useMotivSettlementCampaignsByProduct } from "@/lib/hooks/useMotivSettlementCampaigns"
import { useMotivAssignments } from "@/lib/hooks/useMotivAssignments"
import { useMotivAdAccounts } from "@/lib/hooks/useMotivAdAccounts"
import { useMotivAdGroups } from "@/lib/hooks/useMotivAdGroups"
import { useMotivStatsCampaign } from "@/lib/hooks/useMotivStatsCampaign"
import { labelForTargetingProductId, motivTypeToProduct, type MediaProductFilter } from "@/lib/motivApi/productMapping"
import { getAdvertiserName } from "@/lib/motivApi/advertiserHelpers"

/**
 * DMP 수수료 정산 페이지 — 통합 표.
 *
 * 사용자 결정 (다중 에이전트 토론·검증 후):
 *   1) DMP 페이지는 'DMP 비용만' 고려 — 기존 큰 정산 표(작업/VAT/기계비/대행사/매술) 제거.
 *   2) CT+ + CT + CTV 단일 통합 표 — (광고주, 캠페인, 제품) 행 단위.
 *   3) DMP 사별 비용 컬럼 (SKP/TG360/LOTTE/KB/WIFI + ETC).
 *   4) 합계 카드: 전체 / CT+ / CT / CTV.
 *   5) 매핑 안된 행은 노란 배지로 가시화.
 *
 * 데이터 소스:
 *   - CT+: row.dmpType × DMP_FEE_RATES_DECIMAL[type] (계산값)
 *   - Motiv (CT/CTV): /v1/adgroups → ag.data_fee 의 캠페인 단위 합 (실측)
 *     DMP 사 분류 = ag.targeting_product_id → labelForTargetingProductId
 */

const DMP_COLS = ["SKP", "TG360", "LOTTE", "KB", "WIFI", "ETC"] as const
type DmpVendor = typeof DMP_COLS[number]

interface UnifiedDmpRow {
  key: string                  // `${product}::${advertiserName}`
  product: 'CT+' | 'CT' | 'CTV'
  advertiserName: string
  /** 광고주 단위 통합이라 캠페인 수만 카운트 (그룹화된 캠페인 수). */
  campaignCount: number
  dmpFees: Record<DmpVendor, number>
  dmpTotal: number
  source: 'CT_PLUS' | 'MOTIV'
  isUnmapped?: boolean
}

function toMonthStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}
function fmt(n: number) {
  if (!Number.isFinite(n) || n === 0) return "-"
  return Math.round(n).toLocaleString("ko-KR")
}
function fmtNum(n: number) { return Math.round(n).toLocaleString("ko-KR") }

function emptyFees(): Record<DmpVendor, number> {
  return { SKP: 0, TG360: 0, LOTTE: 0, KB: 0, WIFI: 0, ETC: 0 }
}

export default function DmpFeeClient() {
  const { campaigns, agencies, advertisers } = useMasterData()
  const { allRows: rawRows } = useRawData()
  const [month, setMonth] = useState(() => toMonthStr(new Date()))
  const [product, setProduct] = useState<MediaProductFilter>('ALL')
  const [copied, setCopied] = useState(false)

  const showCtPlus = product === 'ALL' || product === 'CT_PLUS'
  const showCt     = product === 'ALL' || product === 'CT'
  const showCtv    = product === 'ALL' || product === 'CTV'
  const motivProduct = showCt && showCtv ? 'CT_CTV_BOTH' : showCtv ? 'CTV' : showCt ? 'CT' : null

  // 사용자 결정 — '분석 페이지(CT/CTV) 의 dateRange 호출 패턴 사용 / UI 는 월별만'.
  // month → [1일, 말일] dateRange 변환. month 도 함께 넘겨 캐시 키 명확화.
  const dateRange = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    if (!y || !m) return undefined
    const start = `${month}-01`
    const end   = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
    return { start, end }
  }, [month])

  const motivFetch = useMotivSettlementCampaignsByProduct(
    motivProduct ?? 'CT',
    { month, dateRange, enabled: motivProduct !== null },
  )

  // 광고주/대행사 매핑 — Motiv 행 채울 때 fallback chain 에 사용.
  const { data: assignments } = useMotivAssignments()
  const { byId: adAccountById } = useMotivAdAccounts(true)

  // === CT+ 행 ===
  const computedRows = useMemo(
    () => applyMarkupToRows(rawRows, campaigns),
    [rawRows, campaigns]
  )
  const monthRows = useMemo(() => {
    const [y, m] = month.split("-").map(Number)
    const mStart = new Date(y, m - 1, 1)
    const mEnd   = new Date(y, m, 0, 23, 59, 59)
    return computedRows.filter(r => {
      const dt = new Date(r.date)
      return dt >= mStart && dt <= mEnd
    })
  }, [computedRows, month])

  const ctPlusRows = useMemo((): UnifiedDmpRow[] => {
    if (!showCtPlus) return []
    const map = new Map<string, UnifiedDmpRow>()
    const seenCampaign = new Map<string, Set<string>>() // key → campaignIds
    for (const row of monthRows) {
      const cId = row.matchedCampaignId
      if (!cId) continue
      const camp = campaigns.find(c => c.id === cId)
      if (!camp) continue
      // 사용자 결정 — 광고주 단위로 행 통합. 캠페인/대행사 컬럼 제거.
      // 매칭은 캠페인 ID → advertiserId → advertiserName 으로 정확히 가져옴.
      const adv = advertisers.find(a => a.id === camp.advertiserId)
      const advertiserName = adv?.name ?? '—'
      const key = `CT+::${advertiserName}`
      if (!map.has(key)) {
        map.set(key, {
          key, product: 'CT+',
          advertiserName,
          campaignCount: 0,
          dmpFees: emptyFees(), dmpTotal: 0,
          source: 'CT_PLUS',
        })
        seenCampaign.set(key, new Set())
      }
      const entry = map.get(key)!
      seenCampaign.get(key)!.add(cId)
      const dt = row.dmpType as string | undefined
      const net = row.netAmount ?? 0
      if (dt && (dt === 'SKP' || dt === 'TG360' || dt === 'LOTTE' || dt === 'KB' || dt === 'WIFI')) {
        const rate = (DMP_FEE_RATES_DECIMAL as Record<string, number>)[dt] ?? 0
        // raw float 으로 누적 — 사용자 보고 'DMP 비용 소폭 다름' fix.
        // 이전엔 row 단위 Math.round 후 누적 → 반올림 오차 누적.
        const fee = net * rate
        entry.dmpFees[dt] += fee
        entry.dmpTotal += fee
      }
    }
    for (const [k, ids] of seenCampaign) {
      const r = map.get(k); if (r) r.campaignCount = ids.size
    }
    return Array.from(map.values()).filter(r => Math.round(r.dmpTotal) > 0)
  }, [showCtPlus, monthRows, campaigns, advertisers])

  // === Motiv 행 — /v1/adgroups + /v1/stats/campaign/breakdown ===
  // 사용자 결정 — '활성 캠페인이 아니라 기간에 대해 존재하는 캠페인 전부'.
  // motivFetch.data 가 이미 dateRange overlap 으로 필터됨.
  //
  // 사용자 보고 — 'Hill's Pet Nutrition 캠페인 CTV 에서 보이는데 DMP 에서 안 보임'.
  // 원인: useMotivAdGroups 의 list 응답 stats 는 lifetime 일 가능성 (서버측 dateRange
  // filter 가 작동 안 함). 4월 data_fee 가 실제 발생했어도 list stats 에는 0 일 수 있음.
  // → CTV 분석 페이지와 동일 source(stats/campaign/breakdown) 로 캠페인 단위 정확한
  //    기간 dmpFee 를 받아 fallback. 광고그룹 list 는 DMP 사 분류용으로만 사용.
  const motivCampaignIds = useMemo(
    () => motivFetch.data.map(c => c.id),
    [motivFetch.data],
  )
  const adGroups = useMotivAdGroups({
    campaignIds: motivCampaignIds,
    startDate: dateRange?.start,
    endDate:   dateRange?.end,
    enabled:   motivCampaignIds.length > 0,
  })

  // 사용자 진단 결과 — 힐스펫(id=20038, TV) 의 광고그룹 10개 / dataFee 합 = 0.
  // /v1/adgroups list 응답 stats 는 lifetime → 4월 dmpFee 없으면 0 으로 응답.
  // 정확한 기간 dmpFee 는 /v1/stats/campaign/breakdown (CTV 분석과 같은 source).
  const periodStats = useMotivStatsCampaign({
    scope:     { campaignIds: motivCampaignIds },
    startDate: dateRange?.start,
    endDate:   dateRange?.end,
    enabled:   motivCampaignIds.length > 0,
  })

  // 캠페인 단위 순회 — accurateDmpFee 우선, 광고그룹 비율로 vendor 분배.
  const motivRows = useMemo((): UnifiedDmpRow[] => {
    if (!motivProduct) return []
    const asgById = new Map(assignments.map(a => [a.motivCampaignId, a]))
    const map = new Map<string, UnifiedDmpRow>()
    const seenCampaign = new Map<string, Set<number>>()

    // 광고그룹을 캠페인별로 그룹화 — vendor 비율 계산용.
    const adGroupsByCampaign = new Map<number, typeof adGroups.rows>()
    for (const ag of adGroups.rows) {
      const arr = adGroupsByCampaign.get(ag.campaignId) ?? []
      arr.push(ag)
      adGroupsByCampaign.set(ag.campaignId, arr)
    }

    // 캠페인 단위 순회 — periodStats(기간 정확) 의 dmpFee 우선, 광고그룹 vendor 비율로 분배.
    for (const camp of motivFetch.data) {
      const product = motivTypeToProduct(camp.campaign_type)
      if (product !== 'CT' && product !== 'CTV') continue

      const asg = asgById.get(camp.id)
      const internalAdv = asg?.advertiserId ? advertisers.find(a => a.id === asg.advertiserId) : undefined
      const adAccount   = adAccountById.get(camp.adaccount_id)
      const advertiserName = internalAdv?.name || getAdvertiserName(adAccount) || '—'

      // accurateDmpFee — /v1/stats/campaign/breakdown 의 dmpFee (기간 정확) 우선.
      // 광고그룹 list 의 dataFee 는 lifetime 일 가능성 (사용자 진단: 힐스펫 광고그룹 10개 dataFee=0).
      const campAdGroups = adGroupsByCampaign.get(camp.id) ?? []
      const adGroupTotal = campAdGroups.reduce((s, r) => s + r.dataFee, 0)
      const periodDmpFee = periodStats.byMotivId.get(camp.id)?.dmpFee
      // periodStats 미응답 시 lifetime adGroupTotal 사용 (기간 외도 표시되는 단점 있음 → diag 로 추적).
      const accurateDmpFee = (periodDmpFee != null && periodDmpFee > 0)
        ? periodDmpFee
        : adGroupTotal
      if (accurateDmpFee <= 0) continue

      const key = `${product}::${advertiserName}`
      if (!map.has(key)) {
        map.set(key, {
          key, product,
          advertiserName,
          campaignCount: 0,
          dmpFees: emptyFees(), dmpTotal: 0,
          source: 'MOTIV',
        })
        seenCampaign.set(key, new Set())
      }
      const entry = map.get(key)!
      seenCampaign.get(key)!.add(camp.id)

      // vendor 비율 분배 — 우선순위:
      //   ① 광고그룹 dataFee 분포 (lifetime 이라도 vendor 비율은 유효).
      //   ② dataFee 가 모두 0 이면 광고그룹 개수 비율(targeting_product_id 분포)로 분배.
      //      — 사용자 진단: 4-에이전트 토론 결과, dataFee=0 일 때 ETC 로 몰리던 문제 해결.
      //   ③ 광고그룹 자체가 0 이면 ETC + isUnmapped 표시.
      if (campAdGroups.length > 0) {
        const vendorWeight: Record<DmpVendor, number> = emptyFees()
        let weightSum = 0
        if (adGroupTotal > 0) {
          for (const r of campAdGroups) {
            const v = labelForTargetingProductId(r.targetingProductId)
            const k2 = (v === 'SKP' || v === 'TG360' || v === 'LOTTE' || v === 'KB' || v === 'WIFI') ? v : 'ETC'
            vendorWeight[k2] += r.dataFee
          }
          weightSum = adGroupTotal
        } else {
          // dataFee 모두 0 — 광고그룹 개수로 vendor 비율 산출.
          for (const r of campAdGroups) {
            const v = labelForTargetingProductId(r.targetingProductId)
            const k2 = (v === 'SKP' || v === 'TG360' || v === 'LOTTE' || v === 'KB' || v === 'WIFI') ? v : 'ETC'
            vendorWeight[k2] += 1
          }
          weightSum = campAdGroups.length
        }
        if (weightSum > 0) {
          for (const v of DMP_COLS) {
            entry.dmpFees[v] += (vendorWeight[v] / weightSum) * accurateDmpFee
          }
        } else {
          entry.dmpFees.ETC += accurateDmpFee
          entry.isUnmapped = true
        }
      } else {
        // 광고그룹 정보 자체 없음 — ETC 로 분류 + 매핑 필요 표시.
        entry.dmpFees.ETC += accurateDmpFee
        entry.isUnmapped = true
      }
      entry.dmpTotal += accurateDmpFee
    }
    for (const [k, ids] of seenCampaign) {
      const r = map.get(k); if (r) r.campaignCount = ids.size
    }
    const result = Array.from(map.values()).filter(r => Math.round(r.dmpTotal) > 0)
    // 디버그 — sessionStorage 'dmp-debug' 또는 URL ?debug= 시 결과 콘솔 출력.
    if (typeof window !== 'undefined') {
      const kw = (new URLSearchParams(window.location.search).get('debug')
        || window.sessionStorage.getItem('dmp-debug') || '').toLowerCase().trim()
      if (kw) {
        const matched = result.filter(r => r.advertiserName.toLowerCase().includes(kw))
        console.log('[DMP debug] keyword=' + kw + ' matched=' + matched.length)
        for (const r of matched) {
          console.log('  - ' + r.advertiserName + ' / ' + r.product + ' / 캠페인=' + r.campaignCount + ' / dmpTotal=' + Math.round(r.dmpTotal))
        }
      }
    }
    return result
  }, [motivProduct, adGroups.rows, motivFetch.data, assignments, advertisers, adAccountById, periodStats.byMotivId])

  const allRows = useMemo(
    () => [...ctPlusRows, ...motivRows].sort((a, b) => b.dmpTotal - a.dmpTotal),
    [ctPlusRows, motivRows],
  )

  // 합계 (전체/CT+/CT/CTV)
  const totals = useMemo(() => {
    const byProduct: Record<'전체' | 'CT+' | 'CT' | 'CTV', number> = { '전체': 0, 'CT+': 0, 'CT': 0, 'CTV': 0 }
    const byVendor: Record<DmpVendor, number> = emptyFees()
    for (const r of allRows) {
      byProduct['전체'] += r.dmpTotal
      byProduct[r.product] += r.dmpTotal
      for (const v of DMP_COLS) byVendor[v] += r.dmpFees[v]
    }
    return { byProduct, byVendor }
  }, [allRows])

  function copyTsv() {
    const header = ["광고주", "제품", "캠페인 수", ...DMP_COLS, "DMP합계"].join("\t")
    const data = allRows.map(r => [
      r.advertiserName, r.product, r.campaignCount,
      ...DMP_COLS.map(v => Math.round(r.dmpFees[v])),
      Math.round(r.dmpTotal),
    ].join("\t"))
    const total = ["합계", "전체", allRows.reduce((s, r) => s + r.campaignCount, 0),
      ...DMP_COLS.map(v => Math.round(totals.byVendor[v])),
      Math.round(totals.byProduct['전체']),
    ].join("\t")
    navigator.clipboard.writeText([header, ...data, total].join("\n")).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const productChipClass = (p: 'CT+' | 'CT' | 'CTV') =>
    p === 'CT+' ? 'bg-violet-100 text-violet-700'
    : p === 'CT' ? 'bg-blue-100 text-blue-700'
    : 'bg-emerald-100 text-emerald-700'

  const cardToneClass = (k: '전체' | 'CT+' | 'CT' | 'CTV') => {
    if (k === '전체') return 'bg-violet-50 border-violet-200 text-violet-700'
    if (k === 'CT+')  return 'bg-violet-50 border-violet-200 text-violet-700'
    if (k === 'CT')   return 'bg-blue-50 border-blue-200 text-blue-700'
    return 'bg-emerald-50 border-emerald-200 text-emerald-700'
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-gray-900">DMP 수수료 정산</h1>
            <p className="text-xs text-gray-400 mt-0.5">CT+ · CT · CTV 통합 — 광고주 단위 DMP 비용</p>
          </div>
          <button
            onClick={copyTsv}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              copied ? "border-green-200 bg-green-50 text-green-700" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {copied ? "✓ 복사됨" : "엑셀 복사"}
          </button>
        </div>
      </header>

      <main className="p-6 space-y-4">
        <SettlementFilterBar
          month={month} onMonthChange={setMonth}
          product={product} onProductChange={setProduct}
        />

        {/* 진단 카드 — 항상 노출. 사용자 보고 '힐스펫 못 가져옴' 진단용. */}
        {motivProduct && (() => {
          const d = motivFetch.diag
          const dropped = d.fetched - d.final
          return (
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-[11px] text-gray-700">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-bold text-amber-700">Motiv 진단:</span>
                <span>서버 <b>{d.serverTotal}</b></span>
                <span>→ 받은 <b>{d.fetched}</b></span>
                <span>- 제외 <b className="text-rose-600">{d.excluded}</b></span>
                <span>- 기간외 <b className="text-rose-600">{d.outOfRange}</b></span>
                <span>= 통과 <b className="text-emerald-700">{d.final}</b></span>
                <span className="mx-1 text-gray-300">|</span>
                <span>광고그룹 <b>{adGroups.rows.length}</b> ({motivCampaignIds.length} 캠페인 fetch)</span>
                {d.truncated && <span className="text-rose-700 font-bold">⚠ 페이지 한계 도달!</span>}
                {dropped > d.excluded + d.outOfRange && <span className="text-amber-700">⚠ dedup 손실 {dropped - d.excluded - d.outOfRange}</span>}
                <span className="mx-1 text-gray-300">|</span>
                <span title="기간 정확 dmpFee 캠페인 / 누락 fallback / chunk 절단 수">
                  periodStats: <b className="text-emerald-700">{periodStats.byMotivId.size}</b>
                  <span className="text-gray-400">/{motivCampaignIds.length}</span>
                  <span className="ml-1 text-gray-400">rows={periodStats.diag.rowsFetched}</span>
                  {periodStats.diag.truncatedChunks > 0 && (
                    <span className="ml-1 text-rose-700 font-bold">⚠ chunk 절단 {periodStats.diag.truncatedChunks}</span>
                  )}
                  {periodStats.loading && <span className="ml-1 text-blue-600">loading...</span>}
                  {periodStats.error && <span className="ml-1 text-rose-600">err: {periodStats.error}</span>}
                </span>
              </div>
              <div className="mt-1.5 text-[10px] text-gray-500">
                ?debug=ALL → 콘솔에 통과 캠페인 전체 dump. ?debug=힐스펫 → 매칭만.
              </div>
            </div>
          )
        })()}

        {/* 통과 캠페인 콘솔 dump — ?debug=ALL 시 (페이지 mount 후 1회). */}
        <DiagCampaignDump campaigns={motivFetch.data} />

        {/* 통과 89개 캠페인 list — 화면에서 검색 가능 (사용자: '힐스펫이 있는지 확인'). */}
        {motivProduct && motivFetch.data.length > 0 && (
          <DiagCampaignList
            campaigns={motivFetch.data}
            adGroups={adGroups.rows}
            periodStats={periodStats.byMotivId}
          />
        )}

        <div className="flex items-center gap-2 text-[11px] text-gray-500 -mt-2">
          {showCtPlus && <span>CT+ {ctPlusRows.length}</span>}
          {motivProduct && (() => {
            const d = motivFetch.diag
            const dropped = d.fetched - d.final
            return (
              <span title={`서버 ${d.serverTotal} / fetched ${d.fetched} / dropped ${dropped}`}>
                Motiv {motivRows.length}
              </span>
            )
          })()}
        </div>

        {/* 합계 카드 — 전체 / CT+ / CT / CTV (사용자 요청) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {(['전체', 'CT+', 'CT', 'CTV'] as const).map(k => (
            <div key={k} className={`rounded-xl border px-4 py-2.5 ${cardToneClass(k)}`}>
              <p className="text-[10px] font-medium opacity-80">{k}</p>
              <p className="text-base font-bold tabular-nums leading-tight mt-0.5">₩{fmtNum(totals.byProduct[k])}</p>
            </div>
          ))}
        </div>

        {/* 통합 표 */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-gray-700 text-white text-[10px] font-bold">∑</span>
              <h3 className="text-sm font-semibold text-gray-900">캠페인 DMP 비용 <span className="text-gray-500 ml-1 font-normal">({allRows.length})</span></h3>
            </div>
            <p className="text-[10px] text-gray-400">CT+: 계산값 · CT/CTV: 광고그룹 data_fee 실측</p>
          </div>

          {adGroups.loading && motivProduct ? (
            <div className="flex items-center justify-center gap-2 px-4 py-10 text-xs text-gray-400">
              <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
              </svg>
              CT/CTV 광고그룹 데이터 가져오는 중…
            </div>
          ) : allRows.length === 0 ? (
            <div className="px-4 py-12 text-center text-xs text-gray-400">
              해당 월의 DMP 비용 데이터가 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-200 text-gray-500">
                  <tr>
                    <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left font-medium whitespace-nowrap shadow-[2px_0_0_0_rgba(0,0,0,0.05)]">광고주</th>
                    <th className="px-3 py-2 text-center font-medium whitespace-nowrap">제품</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap text-gray-400">캠페인 수</th>
                    {DMP_COLS.map(v => (
                      <th key={v} className="px-3 py-2 text-right font-medium whitespace-nowrap">{v}</th>
                    ))}
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap bg-gray-100">DMP 합계</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {allRows.map((r, i) => {
                    const prev = i > 0 ? allRows[i - 1] : null
                    const sameAdv = prev?.advertiserName === r.advertiserName
                    return (
                      <tr key={r.key} className="group hover:bg-gray-50/70 transition-colors">
                        <td className={`sticky left-0 z-[1] bg-white group-hover:bg-gray-50/70 px-3 py-1.5 font-medium whitespace-nowrap max-w-[200px] truncate shadow-[2px_0_0_0_rgba(0,0,0,0.05)] ${
                          sameAdv ? 'text-gray-300' : 'text-gray-800'
                        }`} title={r.advertiserName}>
                          {sameAdv ? '·' : r.advertiserName}
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${productChipClass(r.product)}`}>{r.product}</span>
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{r.campaignCount}</td>
                        {DMP_COLS.map(v => (
                          <td key={v} className={`px-3 py-1.5 text-right tabular-nums ${
                            v === 'ETC' && r.dmpFees[v] > 0 ? 'bg-yellow-50' : ''
                          }`}>
                            {r.dmpFees[v] > 0
                              ? <span
                                  className={v === 'ETC' ? 'text-yellow-700 font-medium' : 'text-violet-700 font-medium'}
                                  title={v === 'ETC' ? 'targeting_product_id 미매핑 — TARGETING_PRODUCT_LABEL 에 추가 필요' : ''}
                                >{fmt(r.dmpFees[v])}</span>
                              : <span className="text-gray-300">-</span>
                            }
                          </td>
                        ))}
                        <td className="px-3 py-1.5 text-right font-bold tabular-nums text-violet-800 bg-violet-50/30">{fmt(r.dmpTotal)}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="bg-gray-100 border-t border-gray-200">
                  <tr className="text-gray-800 font-semibold">
                    <td className="sticky left-0 z-[1] bg-gray-100 px-3 py-2 whitespace-nowrap shadow-[2px_0_0_0_rgba(0,0,0,0.05)]" colSpan={3}>
                      합계 ({allRows.length} 광고주)
                    </td>
                    {DMP_COLS.map(v => (
                      <td key={v} className="px-3 py-2 text-right tabular-nums">{fmt(totals.byVendor[v])}</td>
                    ))}
                    <td className="px-3 py-2 text-right font-bold tabular-nums text-violet-800 bg-violet-100">{fmtNum(totals.byProduct['전체'])}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* ETC 진단 — 매핑 못 한 광고그룹을 raw 그대로 노출.
            사용자가 화면에서 targeting_product_id 또는 title 패턴을 확인 → 매핑 추가. */}
        {(() => {
          const unmapped = adGroups.rows.filter(r => {
            if (r.dataFee <= 0) return false
            const v = labelForTargetingProductId(r.targetingProductId)
            return v !== 'SKP' && v !== 'TG360' && v !== 'LOTTE' && v !== 'KB' && v !== 'WIFI'
          })
          if (unmapped.length === 0) return null
          const sorted = [...unmapped].sort((a, b) => b.dataFee - a.dataFee).slice(0, 20)
          return (
            <div className="rounded-2xl border border-yellow-200 bg-yellow-50/40 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-yellow-200 flex items-center gap-2">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-yellow-500 text-white text-[10px] font-bold">?</span>
                <h3 className="text-sm font-semibold text-gray-900">매핑 누락 광고그룹 <span className="text-yellow-700 font-bold ml-1">({unmapped.length})</span></h3>
                <p className="text-[10px] text-gray-500 ml-auto">아래 광고그룹의 targeting_product_id 또는 title 을 확인 후 매핑 추가 → ETC → 정상 컬럼으로 자동 분류</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-yellow-100/50 text-gray-600">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-medium">캠페인 ID</th>
                      <th className="px-3 py-1.5 text-left font-medium">광고그룹</th>
                      <th className="px-3 py-1.5 text-center font-medium">targeting_product_id</th>
                      <th className="px-3 py-1.5 text-right font-medium">data_fee</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-yellow-100/40">
                    {sorted.map(r => (
                      <tr key={r.adGroupId} className="hover:bg-yellow-100/30">
                        <td className="px-3 py-1 text-gray-500 font-mono">#{r.campaignId}</td>
                        <td className="px-3 py-1 text-gray-800 max-w-[400px] truncate" title={r.title}>{r.title}</td>
                        <td className="px-3 py-1 text-center">
                          <code className="rounded bg-white px-1.5 py-0.5 text-[10px] border border-gray-200">
                            {r.targetingProductId ?? 'null'}
                          </code>
                        </td>
                        <td className="px-3 py-1 text-right tabular-nums font-medium text-yellow-700">{fmtNum(r.dataFee)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="px-4 py-2 text-[10px] text-gray-500 border-t border-yellow-100">
                매핑 추가 위치: <code className="bg-white px-1 rounded">lib/motivApi/productMapping.ts</code> 의
                <code className="bg-white px-1 rounded ml-1">TARGETING_PRODUCT_LABEL</code> — 위 ID 를 SKP/TG360/LOTTE/KB/WIFI 에 매핑.
              </p>
            </div>
          )
        })()}

        {adGroups.error && motivProduct && (
          <div className="rounded-xl bg-rose-50/60 border border-rose-200 p-3 text-xs text-rose-800">
            <p className="font-semibold">⚠ CT/CTV 광고그룹 API 호출 실패</p>
            <p className="mt-1 text-rose-600/80 truncate" title={adGroups.error}>{adGroups.error}</p>
          </div>
        )}
      </main>
    </div>
  )
}

// 진단 — ?debug=KEYWORD 또는 ALL 시 캠페인 list 콘솔에 dump.
function DiagCampaignDump({ campaigns }: { campaigns: import('@/lib/motivApi/types').MotivCampaign[] }) {
  useEffect(() => {
    if (typeof window === 'undefined') return
    const kw = (new URLSearchParams(window.location.search).get('debug')
      || window.sessionStorage.getItem('dmp-debug') || '').trim()
    if (!kw) return
    if (kw.toUpperCase() === 'ALL') {
      console.log('[DMP debug] ALL — ' + campaigns.length + ' campaigns passed:')
      for (const c of campaigns) {
        console.log('  - id=' + c.id + ' type=' + c.campaign_type + ' status=' + c.status + ' start=' + c.start_date + ' end=' + c.end_date + ' title=' + c.title)
      }
    } else {
      const low = kw.toLowerCase()
      const matched = campaigns.filter(c => (c.title || '').toLowerCase().includes(low))
      console.log('[DMP debug] keyword="' + kw + '" — ' + matched.length + ' matched of ' + campaigns.length)
      for (const c of matched) {
        console.log('  - id=' + c.id + ' type=' + c.campaign_type + ' status=' + c.status + ' start=' + c.start_date + ' end=' + c.end_date + ' title=' + c.title)
      }
    }
  }, [campaigns])
  return null
}

// 통과 캠페인 검색 패널 — 사용자가 힐스펫 등 특정 캠페인이 통과했는지 직접 확인.
// 사용자 보고 (id=20100, 5월 힐스펫) — DMP 비용 누락 진단을 위해 데이터 소스별 값 노출.
function DiagCampaignList({
  campaigns, adGroups, periodStats,
}: {
  campaigns: import('@/lib/motivApi/types').MotivCampaign[]
  adGroups: import('@/lib/hooks/useMotivAdGroups').AdGroupRow[]
  periodStats: Map<number, import('@/lib/motivApi/statsMapper').UnifiedDailyMetrics>
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const adGroupsByCampaign = useMemo(() => {
    const m = new Map<number, typeof adGroups>()
    for (const ag of adGroups) {
      const arr = m.get(ag.campaignId) ?? []
      arr.push(ag)
      m.set(ag.campaignId, arr)
    }
    return m
  }, [adGroups])

  const filtered = useMemo(() => {
    const low = q.trim().toLowerCase()
    if (!low) return campaigns
    return campaigns.filter(c => (c.title || '').toLowerCase().includes(low) || String(c.id) === low)
  }, [campaigns, q])

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-[11px] text-gray-600 hover:bg-gray-50"
      >
        <span>
          <b className="text-emerald-700">{campaigns.length}</b>개 통과 캠페인 list — 클릭으로 펼침/닫기 (검색 / id 직접 입력 가능)
        </span>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="border-t border-gray-100 p-3">
          <input
            type="text"
            placeholder="캠페인 이름 또는 id (예: 힐스펫, 20100)"
            value={q}
            onChange={e => setQ(e.target.value)}
            className="w-full mb-2 rounded border border-gray-300 px-2 py-1 text-[11px]"
          />
          <div className="max-h-80 overflow-y-auto text-[10px] tabular-nums">
            <table className="w-full">
              <thead className="bg-gray-50 text-gray-500 sticky top-0">
                <tr>
                  <th className="px-2 py-1 text-left">id</th>
                  <th className="px-2 py-1 text-left">type</th>
                  <th className="px-2 py-1 text-left">status</th>
                  <th className="px-2 py-1 text-left">기간</th>
                  <th className="px-2 py-1 text-right" title="adgroups list(lifetime) 합">광고그룹/dataFee(lifetime)</th>
                  <th className="px-2 py-1 text-right" title="campaigns.index 응답의 lifetime data_fee">캠페인 lifetime dataFee</th>
                  <th className="px-2 py-1 text-right" title="/v1/stats/campaign/breakdown 의 기간 dmpFee — 본 페이지에서 실제 사용됨">⭐ periodStats dmpFee</th>
                  <th className="px-2 py-1 text-center" title="periodStats.dmpFee>0 or adGroupTotal>0 이면 표시(통과)">결과</th>
                  <th className="px-2 py-1 text-left">title</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(c => {
                  const ags = adGroupsByCampaign.get(c.id) ?? []
                  const sum = ags.reduce((s, a) => s + a.dataFee, 0)
                  const campLifetime = Number(c.stats?.data_fee ?? 0)
                  const pdf = periodStats.get(c.id)?.dmpFee ?? 0
                  const accurate = pdf > 0 ? pdf : sum
                  const willInclude = accurate > 0
                  return (
                    <tr key={c.id} className={`hover:bg-gray-50 ${!willInclude ? 'bg-rose-50/40' : ''}`}>
                      <td className="px-2 py-0.5 font-mono">{c.id}</td>
                      <td className="px-2 py-0.5">{c.campaign_type}</td>
                      <td className="px-2 py-0.5">{c.status}</td>
                      <td className="px-2 py-0.5">{c.start_date?.slice(2) ?? '-'} ~ {c.end_date?.slice(2) ?? '-'}</td>
                      <td className="px-2 py-0.5 text-right">
                        <span className={ags.length === 0 ? 'text-rose-600' : 'text-gray-500'}>
                          {ags.length} / {Math.round(sum).toLocaleString('ko-KR')}
                        </span>
                      </td>
                      <td className="px-2 py-0.5 text-right text-gray-500">{Math.round(campLifetime).toLocaleString('ko-KR')}</td>
                      <td className={`px-2 py-0.5 text-right font-semibold ${pdf > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {Math.round(pdf).toLocaleString('ko-KR')}
                      </td>
                      <td className="px-2 py-0.5 text-center">
                        {willInclude ? (
                          <span className="inline-block rounded-full bg-emerald-100 text-emerald-700 px-1.5 py-0.5 text-[9px] font-bold">표시</span>
                        ) : (
                          <span className="inline-block rounded-full bg-rose-100 text-rose-700 px-1.5 py-0.5 text-[9px] font-bold">제외</span>
                        )}
                      </td>
                      <td className="px-2 py-0.5 max-w-[360px] truncate" title={c.title ?? ''}>
                        {c.title}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <p className="px-2 py-2 text-rose-600">검색 매칭 없음 — 이 캠페인은 통과 list 안에 없음. 기간외(outOfRange) 로 빠짐.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
