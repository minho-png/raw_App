"use client"

import { useState, useMemo } from "react"
import { useMasterData } from "@/lib/hooks/useMasterData"
import { useRawData } from "@/lib/hooks/useRawData"
import { applyMarkupToRows } from "@/lib/markupService"
import { DMP_FEE_RATES_DECIMAL } from "@/lib/calculationService"
import { SettlementFilterBar } from "@/components/atoms/SettlementFilterBar"
import { useMotivSettlementCampaignsByProduct } from "@/lib/hooks/useMotivSettlementCampaigns"
import { useMotivAssignments } from "@/lib/hooks/useMotivAssignments"
import { useMotivAdAccounts } from "@/lib/hooks/useMotivAdAccounts"
import { useMotivAdGroups } from "@/lib/hooks/useMotivAdGroups"
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

export default function DmpFeePage() {
  const { campaigns, agencies, advertisers } = useMasterData()
  const { allRows: rawRows } = useRawData()
  const [month, setMonth] = useState(() => toMonthStr(new Date()))
  const [product, setProduct] = useState<MediaProductFilter>('ALL')
  const [copied, setCopied] = useState(false)

  const showCtPlus = product === 'ALL' || product === 'CT_PLUS'
  const showCt     = product === 'ALL' || product === 'CT'
  const showCtv    = product === 'ALL' || product === 'CTV'
  const motivProduct = showCt && showCtv ? 'CT_CTV_BOTH' : showCtv ? 'CTV' : showCt ? 'CT' : null

  // 사용자 결정 — '분석 페이지(CT/CTV) 의 날짜 로직과 동일하게'.
  // month → [1일, 말일] 일자 범위 로 변환해 dateRange 형식으로 통일.
  // 분석 페이지가 useMotivSettlementCampaignsByProduct(product, { dateRange }) 패턴을
  // 사용하므로 DMP 페이지도 같은 형식으로 호출.
  const dateRange = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    if (!y || !m) return undefined
    const start = `${month}-01`
    const end   = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
    return { start, end }
  }, [month])

  const motivFetch = useMotivSettlementCampaignsByProduct(
    motivProduct ?? 'CT',
    { dateRange, enabled: motivProduct !== null },
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
        const fee = Math.round(net * rate)
        entry.dmpFees[dt] += fee
        entry.dmpTotal += fee
      }
    }
    for (const [k, ids] of seenCampaign) {
      const r = map.get(k); if (r) r.campaignCount = ids.size
    }
    return Array.from(map.values()).filter(r => r.dmpTotal > 0)
  }, [showCtPlus, monthRows, campaigns, advertisers])

  // === Motiv 행 — /v1/adgroups (활성 캠페인만) ===
  // 분석 페이지와 동일 dateRange 활용 (사용자 요청).
  const motivCampaignIds = useMemo(
    () => motivFetch.data.filter(c => c.status === 'Y').map(c => c.id).slice(0, 30),
    [motivFetch.data],
  )
  const adGroups = useMotivAdGroups({
    campaignIds: motivCampaignIds,
    startDate: dateRange?.start,
    endDate:   dateRange?.end,
    enabled:   motivCampaignIds.length > 0,
  })

  const motivRows = useMemo((): UnifiedDmpRow[] => {
    if (!motivProduct) return []
    const asgById = new Map(assignments.map(a => [a.motivCampaignId, a]))
    const map = new Map<string, UnifiedDmpRow>()
    const seenCampaign = new Map<string, Set<number>>()
    for (const ag of adGroups.rows) {
      // 캠페인 ID 로 캠페인 → 제품/광고주 매칭 (사용자: '캠페인 번호 활용해서 데이터 맞추기').
      const camp = motivFetch.data.find(c => c.id === ag.campaignId)
      if (!camp) continue
      const product = motivTypeToProduct(camp.campaign_type)
      if (product !== 'CT' && product !== 'CTV') continue

      // 광고주 매핑 fallback — internal assignment → adAccount → '—'.
      const asg = asgById.get(camp.id)
      const internalAdv = asg?.advertiserId ? advertisers.find(a => a.id === asg.advertiserId) : undefined
      const adAccount   = adAccountById.get(camp.adaccount_id)
      const advertiserName = internalAdv?.name || getAdvertiserName(adAccount) || '—'

      // 광고주 단위 통합 키 — 같은 광고주는 모든 캠페인을 하나로 합침.
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

      // 사용자 결정 — DMP 식별은 targeting_product_id 만으로.
      const vendor = labelForTargetingProductId(ag.targetingProductId)
      const fee = Math.round(ag.dataFee)
      if (fee <= 0) continue
      if (vendor === 'SKP' || vendor === 'TG360' || vendor === 'LOTTE' || vendor === 'KB' || vendor === 'WIFI') {
        entry.dmpFees[vendor] += fee
      } else {
        entry.dmpFees.ETC += fee
        entry.isUnmapped = true
      }
      entry.dmpTotal += fee
    }
    for (const [k, ids] of seenCampaign) {
      const r = map.get(k); if (r) r.campaignCount = ids.size
    }
    return Array.from(map.values()).filter(r => r.dmpTotal > 0)
  }, [motivProduct, adGroups.rows, motivFetch.data, assignments, advertisers, adAccountById])

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
          rightSlot={
            <div className="flex items-center gap-2 text-[11px] text-gray-500">
              {showCtPlus && <span>CT+ {ctPlusRows.length}</span>}
              {motivProduct && <span>Motiv {motivRows.length}</span>}
            </div>
          }
        />

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
