"use client"

import { useState, useMemo } from "react"
import { useMasterData } from "@/lib/hooks/useMasterData"
import { useRawData } from "@/lib/hooks/useRawData"
import { applyMarkupToRows } from "@/lib/markupService"
import { getMediaTotals } from "@/lib/campaignTypes"
import type { Campaign } from "@/lib/campaignTypes"
import type { RawRow } from "@/lib/rawDataParser"
import { SettlementFilterBar } from "@/components/atoms/SettlementFilterBar"
import {
  buildSalesRows, buildPurchaseRows,
  downloadSalesExcel, downloadPurchaseExcel,
  type SalesRow, type PurchaseRow,
  type CtPlusSettlementLike,
} from "@/lib/export/settlementExcel"
import { useMotivAssignments } from "@/lib/hooks/useMotivAssignments"
import { useMotivSettlementCampaignsByProduct } from "@/lib/hooks/useMotivSettlementCampaigns"
import type { MediaProductFilter } from "@/lib/motivApi/productMapping"

function fmt(n: number) { return Math.round(n).toLocaleString("ko-KR") }
function toMonthStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

// ── CT+ settlement 가공 (필요한 최소 필드만) ───────────────────
function buildCtPlusSettlement(
  campaign: Campaign,
  computedRows: RawRow[],
  agencies: { id: string; name: string }[],
  advertisers: { id: string; name: string }[],
): CtPlusSettlementLike {
  const campRows = computedRows.filter(r => r.matchedCampaignId === campaign.id)
  const mediaRows = campaign.mediaBudgets.map(mb => {
    const t = getMediaTotals(mb)
    const rows = campRows.filter(r => r.media === mb.media)
    const net  = rows.reduce((s, r) => s + (r.netAmount       ?? 0), 0)
    const exec = rows.reduce((s, r) => s + (r.executionAmount ?? 0), 0)
    return { media: mb.media, netAmount: net || t.totalSettingCost, executionAmount: exec || t.totalSettingCost }
  })
  const totalNet  = mediaRows.reduce((s, r) => s + r.netAmount, 0)
  const totalExec = mediaRows.reduce((s, r) => s + r.executionAmount, 0)
  return {
    campaign,
    agName:  agencies.find(a => a.id === campaign.agencyId)?.name      ?? "",
    advName: advertisers.find(a => a.id === campaign.advertiserId)?.name ?? "",
    mediaRows,
    totals: { netAmount: totalNet, executionAmount: totalExec },
  }
}

export default function SalesPurchasePage() {
  const today = new Date()
  const { campaigns, agencies, advertisers, operators } = useMasterData()
  const { allRows: rawRows } = useRawData()
  const [month, setMonth]     = useState(toMonthStr(today))
  const [product, setProduct] = useState<MediaProductFilter>('ALL')
  const [view, setView]       = useState<'sales' | 'purchase'>('sales')

  // Motiv CT/CTV 데이터 + assignments
  const showCt    = product === 'ALL' || product === 'CT'
  const showCtv   = product === 'ALL' || product === 'CTV'
  const showCtPlus = product === 'ALL' || product === 'CT_PLUS'
  const motivProduct = showCt && showCtv ? 'CT_CTV_BOTH' : showCtv ? 'CTV' : showCt ? 'CT' : null
  const motivFetch = useMotivSettlementCampaignsByProduct(motivProduct ?? 'CT', month, motivProduct !== null)
  const { data: assignments } = useMotivAssignments()

  // CT+ settlement 빌드 (월별)
  const allComputed = useMemo(
    () => rawRows.length > 0 && campaigns.length > 0 ? applyMarkupToRows(rawRows, campaigns) : [],
    [rawRows, campaigns],
  )
  const ctPlusSettlements = useMemo((): CtPlusSettlementLike[] => {
    if (!showCtPlus) return []
    return campaigns
      .filter(c => c.settlementMonth === month)
      .map(c => buildCtPlusSettlement(c, allComputed, agencies, advertisers))
  }, [showCtPlus, campaigns, month, allComputed, agencies, advertisers])

  // 매출/매입 행
  const salesRows: SalesRow[] = useMemo(() => buildSalesRows({
    month, ctPlus: ctPlusSettlements, motivCampaigns: motivFetch.data,
    assignments, agencies, advertisers, operators,
  }), [month, ctPlusSettlements, motivFetch.data, assignments, agencies, advertisers, operators])

  const purchaseRows: PurchaseRow[] = useMemo(() => buildPurchaseRows({
    month, ctPlus: ctPlusSettlements, motivCampaigns: motivFetch.data,
    assignments, agencies, operators,
  }), [month, ctPlusSettlements, motivFetch.data, assignments, agencies, operators])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-gray-900">매입/매출 확인</h1>
            <p className="text-xs text-gray-400 mt-0.5">Motiv API + CT+ 데이터를 기반으로 한 정산 시트 미리보기 · Excel 다운로드</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => downloadSalesExcel(salesRows, month)}
              disabled={salesRows.length === 0}
              className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 transition-colors"
            >매출 Excel</button>
            <button
              onClick={() => downloadPurchaseExcel(purchaseRows, month)}
              disabled={purchaseRows.length === 0}
              className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50 transition-colors"
            >매입 Excel</button>
          </div>
        </div>
      </header>

      <main className="p-6 space-y-4">
        <SettlementFilterBar
          month={month}
          onMonthChange={setMonth}
          product={product}
          onProductChange={setProduct}
          rightSlot={
            <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
              <button
                onClick={() => setView('sales')}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  view === 'sales' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >매출 ({salesRows.length})</button>
              <button
                onClick={() => setView('purchase')}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  view === 'purchase' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >매입 ({purchaseRows.length})</button>
            </div>
          }
        />

        {view === 'sales'    && <SalesTable    rows={salesRows} />}
        {view === 'purchase' && <PurchaseTable rows={purchaseRows} />}
      </main>
    </div>
  )
}

// ─── 매출 테이블 ────────────────────────────────────────────────
function SalesTable({ rows }: { rows: SalesRow[] }) {
  if (rows.length === 0) {
    return <div className="rounded-xl border border-gray-200 bg-white py-12 text-center text-sm text-gray-400">
      해당 월·필터의 매출 데이터가 없습니다.
    </div>
  }
  const totals = rows.reduce((acc, r) => ({
    net: acc.net + Number(r.공급가액 ?? 0),
    vat: acc.vat + Number(r.세액 ?? 0),
    total: acc.total + Number(r.합계금액 ?? 0),
    fee: acc.fee + Number(r['수수료 (VAT포함)'] ?? 0),
    ct: acc.ct + Number(r['CT 해당금액 (vat 제외)'] ?? 0),
    imc: acc.imc + Number(r['IMC 해당금액 (vat 제외)'] ?? 0),
    tv: acc.tv + Number(r['TV 해당금액 (vat 제외)'] ?? 0),
  }), { net: 0, vat: 0, total: 0, fee: 0, ct: 0, imc: 0, tv: 0 })
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="min-w-full text-xs">
        <thead className="bg-emerald-50 text-emerald-900">
          <tr>
            <th className="px-2 py-2 text-left font-semibold">해당월</th>
            <th className="px-2 py-2 text-left font-semibold">담당자</th>
            <th className="px-2 py-2 text-left font-semibold">거래처명</th>
            <th className="px-2 py-2 text-left font-semibold">캠페인명</th>
            <th className="px-2 py-2 text-right font-semibold">공급가액</th>
            <th className="px-2 py-2 text-right font-semibold">세액</th>
            <th className="px-2 py-2 text-right font-semibold">합계금액</th>
            <th className="px-2 py-2 text-right font-semibold">수수료(VAT포함)</th>
            <th className="px-2 py-2 text-right font-semibold">CT</th>
            <th className="px-2 py-2 text-right font-semibold">IMC</th>
            <th className="px-2 py-2 text-right font-semibold">TV</th>
            <th className="px-2 py-2 text-left font-semibold">수금일 기준</th>
            <th className="px-2 py-2 text-left font-semibold">수금 기한</th>
            <th className="px-2 py-2 text-left font-semibold">수취이메일</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-gray-50">
              <td className="px-2 py-1.5 text-gray-700">{r.해당월}</td>
              <td className="px-2 py-1.5 text-gray-700">{r.담당자}</td>
              <td className="px-2 py-1.5 text-gray-800 font-medium truncate max-w-[200px]" title={r['거래처명 (사업자등록증 기준)']}>
                {r['거래처명 (사업자등록증 기준)']}
              </td>
              <td className="px-2 py-1.5 text-gray-700 truncate max-w-[260px]" title={r.캠페인명}>{r.캠페인명}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-gray-800">{fmt(r.공급가액)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-gray-600">{fmt(r.세액)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-gray-900">{fmt(r.합계금액)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-blue-700">{fmt(r['수수료 (VAT포함)'])}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-blue-600">{r['CT 해당금액 (vat 제외)'] > 0 ? fmt(r['CT 해당금액 (vat 제외)']) : '-'}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-blue-600">{r['IMC 해당금액 (vat 제외)'] > 0 ? fmt(r['IMC 해당금액 (vat 제외)']) : '-'}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-indigo-600">{r['TV 해당금액 (vat 제외)'] > 0 ? fmt(r['TV 해당금액 (vat 제외)']) : '-'}</td>
              <td className="px-2 py-1.5 text-gray-500">{r['수금일 기준']}</td>
              <td className="px-2 py-1.5 text-gray-500">{r['수금 기한']}</td>
              <td className="px-2 py-1.5 text-gray-500 truncate max-w-[180px]" title={r.수취이메일}>{r.수취이메일}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-gray-100">
          <tr>
            <td colSpan={4} className="px-2 py-2 font-bold text-gray-900">합계</td>
            <td className="px-2 py-2 text-right tabular-nums font-bold text-gray-900">{fmt(totals.net)}</td>
            <td className="px-2 py-2 text-right tabular-nums font-bold text-gray-700">{fmt(totals.vat)}</td>
            <td className="px-2 py-2 text-right tabular-nums font-bold text-gray-900">{fmt(totals.total)}</td>
            <td className="px-2 py-2 text-right tabular-nums font-bold text-blue-700">{fmt(totals.fee)}</td>
            <td className="px-2 py-2 text-right tabular-nums font-bold text-blue-700">{fmt(totals.ct)}</td>
            <td className="px-2 py-2 text-right tabular-nums font-bold text-blue-700">{fmt(totals.imc)}</td>
            <td className="px-2 py-2 text-right tabular-nums font-bold text-indigo-700">{fmt(totals.tv)}</td>
            <td colSpan={3} />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ─── 매입 테이블 ────────────────────────────────────────────────
function PurchaseTable({ rows }: { rows: PurchaseRow[] }) {
  if (rows.length === 0) {
    return <div className="rounded-xl border border-gray-200 bg-white py-12 text-center text-sm text-gray-400">
      해당 월·필터의 매입 데이터가 없습니다.
    </div>
  }
  const totals = rows.reduce((acc, r) => ({
    net: acc.net + Number(r.공급가액 ?? 0),
    vat: acc.vat + Number(r.세액 ?? 0),
    total: acc.total + Number(r.합계금액 ?? 0),
    imc: acc.imc + Number(r.IMC ?? 0),
    tv: acc.tv + Number(r.TV ?? 0),
    ct: acc.ct + Number(r.CT ?? 0),
  }), { net: 0, vat: 0, total: 0, imc: 0, tv: 0, ct: 0 })
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="min-w-full text-xs">
        <thead className="bg-blue-50 text-blue-900">
          <tr>
            <th className="px-2 py-2 text-left font-semibold">년월</th>
            <th className="px-2 py-2 text-left font-semibold">담당자</th>
            <th className="px-2 py-2 text-left font-semibold">구분</th>
            <th className="px-2 py-2 text-left font-semibold">거래처명</th>
            <th className="px-2 py-2 text-left font-semibold">캠페인명</th>
            <th className="px-2 py-2 text-right font-semibold">공급가액</th>
            <th className="px-2 py-2 text-right font-semibold">세액</th>
            <th className="px-2 py-2 text-right font-semibold">합계금액</th>
            <th className="px-2 py-2 text-right font-semibold">IMC</th>
            <th className="px-2 py-2 text-right font-semibold">TV</th>
            <th className="px-2 py-2 text-right font-semibold">CT</th>
            <th className="px-2 py-2 text-left font-semibold">송금일 기준</th>
            <th className="px-2 py-2 text-left font-semibold">송금기한</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-gray-50">
              <td className="px-2 py-1.5 text-gray-700">{r.년월}</td>
              <td className="px-2 py-1.5 text-gray-700">{r.담당자}</td>
              <td className="px-2 py-1.5 text-gray-700">{r.구분}</td>
              <td className="px-2 py-1.5 text-gray-800 font-medium truncate max-w-[200px]" title={r['거래처명 (세금계산서 기준)']}>
                {r['거래처명 (세금계산서 기준)']}
              </td>
              <td className="px-2 py-1.5 text-gray-700 truncate max-w-[260px]" title={r.캠페인명}>{r.캠페인명}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-gray-800">{fmt(r.공급가액)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-gray-600">{fmt(r.세액)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-gray-900">{fmt(r.합계금액)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-blue-600">{r.IMC > 0 ? fmt(r.IMC) : '-'}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-indigo-600">{r.TV > 0 ? fmt(r.TV) : '-'}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-blue-600">{r.CT > 0 ? fmt(r.CT) : '-'}</td>
              <td className="px-2 py-1.5 text-gray-500">{r['송금일 기준']}</td>
              <td className="px-2 py-1.5 text-gray-500">{r.송금기한}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-gray-100">
          <tr>
            <td colSpan={5} className="px-2 py-2 font-bold text-gray-900">합계</td>
            <td className="px-2 py-2 text-right tabular-nums font-bold text-gray-900">{fmt(totals.net)}</td>
            <td className="px-2 py-2 text-right tabular-nums font-bold text-gray-700">{fmt(totals.vat)}</td>
            <td className="px-2 py-2 text-right tabular-nums font-bold text-gray-900">{fmt(totals.total)}</td>
            <td className="px-2 py-2 text-right tabular-nums font-bold text-blue-700">{fmt(totals.imc)}</td>
            <td className="px-2 py-2 text-right tabular-nums font-bold text-indigo-700">{fmt(totals.tv)}</td>
            <td className="px-2 py-2 text-right tabular-nums font-bold text-blue-700">{fmt(totals.ct)}</td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
