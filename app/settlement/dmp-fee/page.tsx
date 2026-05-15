"use client"

import { useState, useMemo } from "react"
import { useMasterData } from "@/lib/hooks/useMasterData"
import { useRawData } from "@/lib/hooks/useRawData"
import { applyMarkupToRows } from "@/lib/markupService"
import { MEDIA_MARKUP_RATE, DMP_FEE_RATES } from "@/lib/campaignTypes"
import { DMP_FEE_RATES_DECIMAL } from "@/lib/calculationService"
import { SettlementFilterBar } from "@/components/atoms/SettlementFilterBar"
import { useMotivSettlementCampaignsByProduct } from "@/lib/hooks/useMotivSettlementCampaigns"
import { useMotivAdGroups } from "@/lib/hooks/useMotivAdGroups"
import type { MediaProductFilter } from "@/lib/motivApi/productMapping"

// DMP 컬럼 순서 (표에 표시할 유형만)
const DMP_COLS = ["SKP", "TG360", "LOTTE", "KB", "WIFI"] as const
type DmpCol = typeof DMP_COLS[number]

interface SettlementRow {
  key: string
  advertiserName: string
  agencyName: string
  campaignName: string
  media: string
  isMatched: boolean
  workAmount: number        // 작업(순금액) = sum supplyValue
  netAmount: number         // 집행금액(VAT기준) = sum netAmount
  execAmount: number        // 매출(세금계산서) = sum executionAmount
  dmpFees: Record<DmpCol, number>
  totalDmpFee: number
  mediaMarkupFee: number    // 기계비 수수료
  mediaMarkupFeeVat: number // 기계비 수수료 VAT14% 포함
  agencyFee: number         // 대행사 수수료
  totalFee: number
}

function toMonthStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}
function shiftMonth(month: string, dir: number) {
  const [y, m] = month.split("-").map(Number)
  return toMonthStr(new Date(y, m - 1 + dir, 1))
}
function fmt(n: number) {
  if (n === 0) return "-"
  return Math.round(n).toLocaleString("ko-KR")
}
function fmtNum(n: number) { return Math.round(n).toLocaleString("ko-KR") }

export default function DmpFeePage() {
  const { campaigns, agencies, advertisers } = useMasterData()
  const { allRows: rawRows } = useRawData()
  const [month, setMonth] = useState(() => toMonthStr(new Date()))
  const [product, setProduct] = useState<MediaProductFilter>('CT_PLUS')
  const [copied, setCopied] = useState(false)

  const showCtPlus = product === 'ALL' || product === 'CT_PLUS'
  const showCt     = product === 'ALL' || product === 'CT'
  const showCtv    = product === 'ALL' || product === 'CTV'
  const motivProduct = showCt && showCtv ? 'CT_CTV_BOTH' : showCtv ? 'CTV' : showCt ? 'CT' : null
  // DMP 는 CT+ 전용 개념 — CT/CTV 건수만 참고 표시
  const motivFetch = useMotivSettlementCampaignsByProduct(
    motivProduct ?? 'CT', month, motivProduct !== null,
  )

  // 월 필터 + markup 적용
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

  // 캠페인×매체 단위로 집계
  const rows = useMemo((): SettlementRow[] => {
    const map = new Map<string, SettlementRow>()

    for (const row of monthRows) {
      const campaignId  = row.matchedCampaignId ?? null
      const campaign    = campaignId ? campaigns.find(c => c.id === campaignId) : null
      const advertiser  = campaign ? advertisers.find(a => a.id === campaign.advertiserId) : null
      const agencyId    = advertiser?.agencyId ?? campaign?.agencyId ?? ""
      const agencyName  = agencies.find(a => a.id === agencyId)?.name ?? "-"
      const advName     = advertiser?.name ?? "-"
      const campaignName = campaign?.campaignName ?? row.campaignName
      const key         = `${campaignId ?? row.campaignName}::${row.media}`

      if (!map.has(key)) {
        const emptyFees: Record<DmpCol, number> = { SKP: 0, TG360: 0, LOTTE: 0, KB: 0, WIFI: 0 }
        map.set(key, {
          key, advertiserName: advName, agencyName,
          campaignName, media: row.media,
          isMatched: !!campaignId,
          workAmount: 0, netAmount: 0, execAmount: 0,
          dmpFees: emptyFees,
          totalDmpFee: 0, mediaMarkupFee: 0, mediaMarkupFeeVat: 0,
          agencyFee: 0, totalFee: 0,
        })
      }
      const entry = map.get(key)!
      const net   = row.netAmount ?? 0
      const exec  = row.executionAmount ?? 0
      const supply = row.supplyValue ?? 0
      entry.workAmount  += supply
      entry.netAmount   += net
      entry.execAmount  += exec

      // DMP 수수료 (유형별)
      const dt = row.dmpType
      if (dt && DMP_COLS.includes(dt as DmpCol)) {
        const rate = DMP_FEE_RATES_DECIMAL[dt as DmpCol] ?? 0
        entry.dmpFees[dt as DmpCol] += Math.round(net * rate)
        entry.totalDmpFee += Math.round(net * rate)
      }

      // 기계비 수수료 (매체 마크업)
      const mmRate = (MEDIA_MARKUP_RATE[row.media] ?? 0) / 100
      const mmFee  = Math.round(net * mmRate)
      entry.mediaMarkupFee    += mmFee
      entry.mediaMarkupFeeVat += Math.round(mmFee * 1.14)

      // 대행사 수수료 (agencyFeeRate × net)
      if (campaign) {
        const mb = campaign.mediaBudgets.find(b => b.media === row.media)
        const isDmpRow = dt && dt !== "DIRECT" && dt !== "MEDIA_TARGETING"
        let agRate = 0
        if (mb) {
          if (mb.totalFeeRate !== undefined) {
            // totalFeeRate에서 media markup과 dmp fee를 제외한 나머지가 대행사 수수료
            const dmpRate = isDmpRow ? (DMP_FEE_RATES[dt!] ?? 0) : 0
            agRate = Math.max(0, mb.totalFeeRate - (MEDIA_MARKUP_RATE[row.media] ?? 0) - dmpRate) / 100
          } else {
            agRate = (isDmpRow ? mb.dmp.agencyFeeRate : mb.nonDmp.agencyFeeRate) / 100
          }
        } else {
          agRate = (campaign.agencyFeeRate ?? 0) / 100
        }
        entry.agencyFee += Math.round(net * agRate)
      }
    }

    for (const entry of map.values()) {
      entry.totalFee = entry.totalDmpFee + entry.mediaMarkupFee + entry.agencyFee
    }

    return Array.from(map.values()).sort((a, b) => {
      if (a.isMatched !== b.isMatched) return a.isMatched ? -1 : 1
      return b.netAmount - a.netAmount
    })
  }, [monthRows, campaigns, advertisers, agencies])

  // 합계
  const totals = useMemo(() => {
    const t = {
      workAmount: 0, netAmount: 0, execAmount: 0,
      dmpFees: { SKP: 0, TG360: 0, LOTTE: 0, KB: 0, WIFI: 0 } as Record<DmpCol, number>,
      totalDmpFee: 0, mediaMarkupFee: 0, mediaMarkupFeeVat: 0, agencyFee: 0, totalFee: 0,
    }
    for (const r of rows) {
      t.workAmount      += r.workAmount
      t.netAmount       += r.netAmount
      t.execAmount      += r.execAmount
      t.totalDmpFee     += r.totalDmpFee
      t.mediaMarkupFee  += r.mediaMarkupFee
      t.mediaMarkupFeeVat += r.mediaMarkupFeeVat
      t.agencyFee       += r.agencyFee
      t.totalFee        += r.totalFee
      for (const d of DMP_COLS) t.dmpFees[d] += r.dmpFees[d]
    }
    return t
  }, [rows])

  function copyTsv() {
    const dmpHeaders = DMP_COLS.map(d => `${d}수수료`)
    const header = ["광고주", "대행사", "캠페인", "매체",
      "작업(순금액)", "집행금액(VAT기준)",
      ...dmpHeaders,
      "기계비 수수료", "기계비 VAT14%",
      "대행사 수수료", "총 수수료",
      "매술(세금계산서)"].join("\t")
    const dataRows = rows.map(r => [
      r.advertiserName, r.agencyName, r.campaignName, r.media,
      Math.round(r.workAmount), Math.round(r.netAmount),
      ...DMP_COLS.map(d => Math.round(r.dmpFees[d])),
      Math.round(r.mediaMarkupFee), Math.round(r.mediaMarkupFeeVat),
      Math.round(r.agencyFee), Math.round(r.totalFee),
      Math.round(r.execAmount),
    ].join("\t"))
    const total = ["\ud569\uacc4", "", "", "",
      Math.round(totals.workAmount), Math.round(totals.netAmount),
      ...DMP_COLS.map(d => Math.round(totals.dmpFees[d])),
      Math.round(totals.mediaMarkupFee), Math.round(totals.mediaMarkupFeeVat),
      Math.round(totals.agencyFee), Math.round(totals.totalFee),
      Math.round(totals.execAmount),
    ].join("\t")
    navigator.clipboard.writeText([header, ...dataRows, total].join("\n")).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const DMP_RATE_LABEL: Record<DmpCol, string> = {
    SKP: "10%", TG360: "10%", LOTTE: "9%", KB: "10%", WIFI: "10%",
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-gray-900">DMP 수수료 정산</h1>
            <p className="text-xs text-gray-400 mt-0.5">정산 리포트 · 캠페인×매체별 DMP 수수료 내역</p>
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
          month={month}
          onMonthChange={setMonth}
          product={product}
          onProductChange={setProduct}
          rightSlot={
            <div className="flex items-center gap-2 text-xs text-gray-500">
              {showCtPlus && <span>CT+ {rows.length}줄</span>}
              {motivProduct && <span>Motiv {motivFetch.data.length}개</span>}
            </div>
          }
        />

        {showCtPlus && (rows.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white py-16 text-center text-sm text-gray-400">
            해당 월 CT+ raw 데이터가 없습니다.
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                {/* 헤더 */}
                <thead>
                  {/* 헤더 그룹 행 */}
                  <tr className="bg-gray-800 text-white">
                    <th colSpan={4} className="px-3 py-2 text-left font-semibold border-r border-gray-600">정보</th>
                    <th colSpan={2} className="px-3 py-2 text-center font-semibold border-r border-gray-600">집행 금액</th>
                    <th colSpan={5} className="px-3 py-2 text-center font-semibold border-r border-gray-600">DMP 수수료</th>
                    <th colSpan={2} className="px-3 py-2 text-center font-semibold border-r border-gray-600">기계비</th>
                    <th colSpan={2} className="px-3 py-2 text-center font-semibold border-r border-gray-600">수수료</th>
                    <th className="px-3 py-2 text-center font-semibold">매술</th>
                  </tr>
                  {/* 컬럼 헤더 */}
                  <tr className="bg-gray-100 text-gray-600 border-b border-gray-200">
                    <th className="sticky left-0 z-20 bg-gray-100 px-3 py-2 text-left font-medium whitespace-nowrap shadow-[2px_0_0_0_rgba(0,0,0,0.05)]">광고주</th>
                    <th className="px-3 py-2 text-left font-medium whitespace-nowrap">대행사</th>
                    <th className="px-3 py-2 text-left font-medium whitespace-nowrap">캠페인</th>
                    <th className="px-3 py-2 text-left font-medium whitespace-nowrap border-r border-gray-200">매체</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">작업(순금액)</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap border-r border-gray-200">VAT기준</th>
                    {DMP_COLS.map(d => (
                      <th key={d} className="px-3 py-2 text-right font-medium whitespace-nowrap">
                        <span>{d}</span>
                        <span className="ml-1 text-gray-400 font-normal">({DMP_RATE_LABEL[d]})</span>
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap border-l border-r border-gray-200">DMP합계</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">기계비</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap border-r border-gray-200">VAT14%</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">대행사</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap border-r border-gray-200">합계</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">매술(세금계산서)</th>
                  </tr>
                  {/* 합계 행 */}
                  <tr className="bg-blue-600 text-white font-semibold text-[11px]">
                    <td colSpan={4} className="px-3 py-2 border-r border-blue-500">합계 ({rows.length}줄)</td>
                    <td className="px-3 py-2 text-right">{fmtNum(totals.workAmount)}</td>
                    <td className="px-3 py-2 text-right border-r border-blue-500">{fmtNum(totals.netAmount)}</td>
                    {DMP_COLS.map(d => (
                      <td key={d} className="px-3 py-2 text-right">{fmt(totals.dmpFees[d])}</td>
                    ))}
                    <td className="px-3 py-2 text-right border-l border-r border-blue-500">{fmtNum(totals.totalDmpFee)}</td>
                    <td className="px-3 py-2 text-right">{fmt(totals.mediaMarkupFee)}</td>
                    <td className="px-3 py-2 text-right border-r border-blue-500">{fmt(totals.mediaMarkupFeeVat)}</td>
                    <td className="px-3 py-2 text-right">{fmt(totals.agencyFee)}</td>
                    <td className="px-3 py-2 text-right border-r border-blue-500">{fmtNum(totals.totalFee)}</td>
                    <td className="px-3 py-2 text-right">{fmtNum(totals.execAmount)}</td>
                  </tr>
                </thead>
                {/* 데이터 행 */}
                <tbody className="divide-y divide-gray-50">
                  {rows.map((r) => (
                    <tr key={r.key} className="group hover:bg-gray-50/70 transition-colors">
                      <td className="sticky left-0 z-10 bg-white group-hover:bg-gray-50/70 px-3 py-2 text-gray-800 font-medium whitespace-nowrap shadow-[2px_0_0_0_rgba(0,0,0,0.05)]">{r.advertiserName}</td>
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.agencyName}</td>
                      <td className="px-3 py-2 text-gray-700 max-w-[180px] truncate">
                        {!r.isMatched && (
                          <span className="mr-1 rounded px-1 py-0.5 text-[9px] font-bold bg-yellow-100 text-yellow-700 border border-yellow-200">미매칭</span>
                        )}
                        {r.campaignName}
                      </td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap border-r border-gray-100">{r.media}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{fmtNum(r.workAmount)}</td>
                      <td className="px-3 py-2 text-right text-gray-800 font-medium border-r border-gray-100">{fmtNum(r.netAmount)}</td>
                      {DMP_COLS.map(d => (
                        <td key={d} className="px-3 py-2 text-right text-gray-600">
                          {r.dmpFees[d] > 0
                            ? <span className="font-medium text-indigo-700">{fmtNum(r.dmpFees[d])}</span>
                            : <span className="text-gray-300">-</span>
                          }
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right font-semibold text-indigo-800 border-l border-r border-gray-100">{fmt(r.totalDmpFee)}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{fmt(r.mediaMarkupFee)}</td>
                      <td className="px-3 py-2 text-right text-gray-500 border-r border-gray-100">{fmt(r.mediaMarkupFeeVat)}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{fmt(r.agencyFee)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-blue-700 border-r border-gray-100">{fmt(r.totalFee)}</td>
                      <td className="px-3 py-2 text-right font-bold text-emerald-700">{fmtNum(r.execAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {/* Motiv (CT/CTV) DMP 비용 — 사용자 요청: 광고그룹 단에서 DMP 사별 data_fee. */}
        {motivProduct && <MotivDmpSection month={month} campaigns={motivFetch.data} />}
      </main>
    </div>
  )
}

// ─── Motiv (CT/CTV) DMP 비용 섹션 ───────────────────────────────────
// 사용자 요청 — '광고그룹 단에서 DMP 사별로 data_fee 가져와서 DMP 수수료 페이지에 반영'.
// /v1/stats/adgroup/breakdown 결과 — 캠페인 × 광고그룹 단위로 data_fee 합산.
// DMP 사 매핑은 adgroup_title 에 포함된 토큰(SKP/TG360/LOTTE/KB/WIFI 등)으로 추정.
function MotivDmpSection({
  month, campaigns,
}: {
  month: string
  campaigns: import('@/lib/motivApi/types').MotivCampaign[]
}) {
  const monthRange = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    if (!y || !m) return undefined
    return {
      startDate: `${month}-01`,
      endDate:   `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`,
    }
  }, [month])

  // 활성 캠페인만 — 비활성/종료된 건 광고그룹도 의미 없음.
  const ids = useMemo(
    () => campaigns.filter(c => c.status === 'Y').map(c => c.id).slice(0, 30),
    [campaigns],
  )
  const adGroups = useMotivAdGroups({
    campaignIds: ids,
    startDate: monthRange?.startDate,
    endDate:   monthRange?.endDate,
    enabled:   ids.length > 0 && !!monthRange,
  })

  const rows = useMemo(() => {
    const campMap = new Map(campaigns.map(c => [c.id, c.title ?? `#${c.id}`]))
    return adGroups.rows.map(r => {
      const upper = r.title.toUpperCase()
      const vendor: DmpCol | 'ETC' = DMP_COLS.find(v => upper.includes(v)) ?? 'ETC'
      return {
        campaignId: r.campaignId,
        campaign:   campMap.get(r.campaignId) ?? `#${r.campaignId}`,
        adgroup:    r.title,
        vendor,
        dataFee:    Math.round(r.dataFee),
        cost:       Math.round(r.cost),
        agencyFee:  Math.round(r.agencyFee),
      }
    }).filter(r => r.dataFee > 0)
      .sort((a, b) => b.dataFee - a.dataFee)
  }, [adGroups.rows, campaigns])

  const totals = useMemo(() => {
    const byVendor: Record<string, number> = {}
    let total = 0
    for (const r of rows) {
      byVendor[r.vendor] = (byVendor[r.vendor] ?? 0) + r.dataFee
      total += r.dataFee
    }
    return { byVendor, total }
  }, [rows])

  // 에러 단순화 — 사용자 화면 잘림 방지. 자세한 메시지는 콘솔/title.
  const errorBrief = adGroups.error
    ? (/404/.test(adGroups.error) ? 'Motiv API 미지원 (404)'
       : /401/.test(adGroups.error) ? '인증 실패 (401)'
       : /504|시간 초과/.test(adGroups.error) ? '응답 시간 초과'
       : 'API 호출 실패')
    : null

  return (
    <div className="rounded-2xl border border-violet-100 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-violet-50/60 to-white flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-violet-500 text-white text-xs font-bold">D</span>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              Motiv DMP 비용
              {!adGroups.loading && rows.length > 0 && <span className="text-violet-600 ml-1.5 font-bold">{rows.length}</span>}
            </h3>
            <p className="text-[10px] text-gray-400 leading-tight mt-0.5">광고그룹 단위 data_fee · DMP 사 추정 (제목 토큰 기반)</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-gray-400">합계</p>
          <p className="text-sm font-bold text-violet-700 tabular-nums leading-tight">₩{fmtNum(totals.total)}</p>
        </div>
      </div>

      {adGroups.loading ? (
        <div className="flex items-center justify-center gap-2 px-4 py-10 text-xs text-gray-400">
          <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
          </svg>
          광고그룹 정보 가져오는 중…
        </div>
      ) : errorBrief ? (
        <div className="px-4 py-6">
          <div className="rounded-xl bg-rose-50/60 border border-rose-200 p-3 text-xs text-rose-800 flex items-start gap-2">
            <span className="text-base leading-none">⚠</span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold">{errorBrief}</p>
              <p className="mt-1 text-rose-600/80 truncate" title={adGroups.error ?? ''}>{adGroups.error}</p>
              <p className="mt-1 text-gray-500">/v1/adgroups 응답 권한·형식을 Motiv 측에 확인하세요.</p>
            </div>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="px-4 py-10 text-center text-xs text-gray-400">
          해당 월의 DMP 비용(data_fee) 데이터가 없습니다.
        </div>
      ) : (
        <>
          {/* DMP 사별 합계 칩 — 모던/단순 */}
          <div className="px-4 py-2.5 border-b border-gray-100 flex flex-wrap gap-1.5">
            {Object.entries(totals.byVendor).sort((a, b) => b[1] - a[1]).map(([v, sum]) => {
              const pct = totals.total > 0 ? Math.round(sum / totals.total * 100) : 0
              return (
                <span key={v} className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-medium ${
                  v === 'ETC' ? 'bg-gray-100 text-gray-700' : 'bg-violet-100 text-violet-800'
                }`}>
                  <span className="font-bold">{v}</span>
                  <span className="tabular-nums">₩{fmtNum(sum)}</span>
                  <span className="text-[9px] opacity-60">{pct}%</span>
                </span>
              )
            })}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-100 text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">캠페인</th>
                  <th className="px-3 py-2 text-left font-medium">광고그룹</th>
                  <th className="px-3 py-2 text-center font-medium">DMP 사</th>
                  <th className="px-3 py-2 text-right font-medium">data_fee</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-400">cost</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-400">agency_fee</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r, i) => (
                  <tr key={`${r.campaignId}-${i}`} className="hover:bg-violet-50/30 transition-colors">
                    <td className="px-3 py-1.5 text-gray-800 max-w-[220px] truncate" title={r.campaign}>{r.campaign}</td>
                    <td className="px-3 py-1.5 text-gray-600 max-w-[260px] truncate" title={r.adgroup}>{r.adgroup}</td>
                    <td className="px-3 py-1.5 text-center">
                      <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                        r.vendor === 'ETC' ? 'bg-gray-100 text-gray-500' : 'bg-violet-100 text-violet-700'
                      }`}>{r.vendor}</span>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-bold text-violet-700">{fmtNum(r.dataFee)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{fmtNum(r.cost)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{fmtNum(r.agencyFee)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
