"use client"

import { useState, useMemo } from "react"
import { useMasterData } from "@/lib/hooks/useMasterData"
import { useRawData } from "@/lib/hooks/useRawData"
import { applyMarkupToRows } from "@/lib/markupService"
import { getMediaTotals, MEDIA_MARKUP_RATE, DMP_FEE_RATE } from "@/lib/campaignTypes"
import type { Campaign, MediaBudget } from "@/lib/campaignTypes"
import type { RawRow } from "@/lib/rawDataParser"

function calcMediaMarkup(mb: MediaBudget): number {
  if (mb.totalBudget !== undefined && mb.totalFeeRate !== undefined) {
    return mb.totalBudget * (mb.totalFeeRate / 100)
  }
  const mm = MEDIA_MARKUP_RATE[mb.media] ?? 0
  const dmpRate = mm + DMP_FEE_RATE + (mb.dmp?.agencyFeeRate ?? 0)
  const nonDmpRate = mm + (mb.nonDmp?.agencyFeeRate ?? 0)
  return (mb.dmp?.budget ?? 0) * (dmpRate / 100) + (mb.nonDmp?.budget ?? 0) * (nonDmpRate / 100)
}
import { SettlementFilterBar } from "@/components/atoms/SettlementFilterBar"
import {
  buildSalesRows, buildPurchaseRows,
  downloadSalesExcel, downloadPurchaseExcel,
  type SalesRow, type PurchaseRow,
  type CtPlusSettlementLike,
} from "@/lib/export/settlementExcel"
import { useMotivAssignments } from "@/lib/hooks/useMotivAssignments"
import { useMotivSettlementCampaignsByProduct } from "@/lib/hooks/useMotivSettlementCampaigns"
import { useSettlementOverrides, applyOverride } from "@/lib/hooks/useSettlementOverrides"
import type { MediaProductFilter } from "@/lib/motivApi/productMapping"
import { ModalShell } from "@/components/atoms/ModalShell"

function fmt(n: number) { return Math.round(n).toLocaleString("ko-KR") }
function toMonthStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

// ── CT+ settlement 가공 ───────────────────────────────────────
// 매출 = 부킹 금액 (totalBudget) → 광고주 청구
// 매입 = RAW CSV netAmount (실집행 순매체비) → 매체사 지급
// 수수료(VAT포함) = (DMP사 비용 + 대행수수료) × 1.1 = markup × 1.1
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
    return {
      media: mb.media,
      netAmount: Math.round(net),
      executionAmount: Math.round(exec),
      budget: Math.round(t.totalBudget),
      markup: Math.round(calcMediaMarkup(mb)),
    }
  })
  const totalNet    = mediaRows.reduce((s, r) => s + r.netAmount, 0)
  const totalExec   = mediaRows.reduce((s, r) => s + r.executionAmount, 0)
  const totalBudget = mediaRows.reduce((s, r) => s + r.budget, 0)
  const totalMarkup = mediaRows.reduce((s, r) => s + r.markup, 0)
  return {
    campaign,
    agName:  agencies.find(a => a.id === campaign.agencyId)?.name      ?? "",
    advName: advertisers.find(a => a.id === campaign.advertiserId)?.name ?? "",
    mediaRows,
    totals: { netAmount: totalNet, executionAmount: totalExec, budget: totalBudget, markup: totalMarkup },
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
    assignments, agencies, advertisers, operators,
  }), [month, ctPlusSettlements, motivFetch.data, assignments, agencies, advertisers, operators])

  // overrides — type 별로 분리 조회 후 행에 머지
  const salesOv    = useSettlementOverrides('sales',    month)
  const purchaseOv = useSettlementOverrides('purchase', month)

  const mergedSales = useMemo(
    () => salesRows.map(r => applyOverride(r, salesOv.byKey.get(r._rowKey))),
    [salesRows, salesOv.byKey],
  )
  const mergedPurchase = useMemo(
    () => purchaseRows.map(r => applyOverride(r, purchaseOv.byKey.get(r._rowKey))),
    [purchaseRows, purchaseOv.byKey],
  )

  // 수정 모달 상태
  const [editTarget, setEditTarget] = useState<{ type: 'sales' | 'purchase'; row: SalesRow | PurchaseRow } | null>(null)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-gray-900">매입/매출 현황</h1>
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

        {view === 'sales'    && <SalesTable    rows={mergedSales}    onEdit={r => setEditTarget({ type: 'sales',    row: r })} />}
        {view === 'purchase' && <PurchaseTable rows={mergedPurchase} onEdit={r => setEditTarget({ type: 'purchase', row: r })} />}
      </main>

      {editTarget && (
        <RowEditModal
          target={editTarget}
          month={month}
          onClose={() => setEditTarget(null)}
          onSave={async (rowKey, overrides) => {
            const handle = editTarget.type === 'sales' ? salesOv : purchaseOv
            await handle.upsert({ rowKey, type: editTarget.type, month, overrides })
            setEditTarget(null)
          }}
          onReset={async (rowKey) => {
            const handle = editTarget.type === 'sales' ? salesOv : purchaseOv
            await handle.remove(rowKey)
            setEditTarget(null)
          }}
          hasOverride={
            editTarget.type === 'sales'
              ? salesOv.byKey.has(editTarget.row._rowKey)
              : purchaseOv.byKey.has(editTarget.row._rowKey)
          }
        />
      )}
    </div>
  )
}

// ─── 매출 테이블 ────────────────────────────────────────────────
function SalesTable({ rows, onEdit }: { rows: SalesRow[]; onEdit: (r: SalesRow) => void }) {
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
            <th className="px-2 py-2 w-10 text-center font-semibold">수정</th>
            <th className="px-2 py-2 text-left font-semibold">해당월</th>
            <th className="px-2 py-2 text-left font-semibold">담당자</th>
            <th className="px-2 py-2 text-left font-semibold">거래처명</th>
            <th className="px-2 py-2 text-left font-semibold">광고주명</th>
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
            <tr key={r._rowKey ?? i} className="hover:bg-gray-50">
              <td className="px-1 py-1 text-center">
                <button
                  onClick={() => onEdit(r)}
                  className="rounded p-1 text-gray-400 hover:bg-emerald-100 hover:text-emerald-700"
                  title="이 행 수정"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              </td>
              <td className="px-2 py-1.5 text-gray-700">{r.해당월}</td>
              <td className="px-2 py-1.5 text-gray-700">{r.담당자}</td>
              <td className="px-2 py-1.5 text-gray-800 font-medium truncate max-w-[200px]" title={r['거래처명 (사업자등록증 기준)']}>
                {r['거래처명 (사업자등록증 기준)']}
              </td>
              <td className="px-2 py-1.5 text-gray-600 truncate max-w-[160px]" title={r.광고주명}>{r.광고주명 || '-'}</td>
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
            <td colSpan={6} className="px-2 py-2 font-bold text-gray-900">합계</td>
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
function PurchaseTable({ rows, onEdit }: { rows: PurchaseRow[]; onEdit: (r: PurchaseRow) => void }) {
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
            <th className="px-2 py-2 w-10 text-center font-semibold">수정</th>
            <th className="px-2 py-2 text-left font-semibold">년월</th>
            <th className="px-2 py-2 text-left font-semibold">담당자</th>
            <th className="px-2 py-2 text-left font-semibold">구분</th>
            <th className="px-2 py-2 text-left font-semibold">거래처명</th>
            <th className="px-2 py-2 text-left font-semibold">광고주명</th>
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
            <tr key={r._rowKey ?? i} className="hover:bg-gray-50">
              <td className="px-1 py-1 text-center">
                <button
                  onClick={() => onEdit(r)}
                  className="rounded p-1 text-gray-400 hover:bg-blue-100 hover:text-blue-700"
                  title="이 행 수정"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              </td>
              <td className="px-2 py-1.5 text-gray-700">{r.년월}</td>
              <td className="px-2 py-1.5 text-gray-700">{r.담당자}</td>
              <td className="px-2 py-1.5 text-gray-700">{r.구분}</td>
              <td className="px-2 py-1.5 text-gray-800 font-medium truncate max-w-[200px]" title={r['거래처명 (세금계산서 기준)']}>
                {r['거래처명 (세금계산서 기준)']}
              </td>
              <td className="px-2 py-1.5 text-gray-600 truncate max-w-[160px]" title={r.광고주명}>{r.광고주명 || '-'}</td>
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
            <td colSpan={7} className="px-2 py-2 font-bold text-gray-900">합계</td>
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

// ─── 행 수정 Modal ─────────────────────────────────────────────
// 사용자 정책 (Q5/Q6): 금액 포함 전체 컬럼 수정 가능 + DB 영속화

const SALES_EDITABLE_FIELDS: { key: keyof SalesRow; label: string; type: 'text' | 'number' | 'date' }[] = [
  { key: '해당월',                          label: '해당월',                       type: 'text' },
  { key: '담당자',                          label: '담당자',                       type: 'text' },
  { key: '세금계산서 작성일자',              label: '세금계산서 작성일자',          type: 'text' },
  { key: '거래처명 (사업자등록증 기준)',     label: '거래처명',                     type: 'text' },
  { key: '광고주명',                        label: '광고주명',                     type: 'text' },
  { key: '캠페인명',                        label: '캠페인명',                     type: 'text' },
  { key: '공급가액',                        label: '공급가액',                     type: 'number' },
  { key: '세액',                            label: '세액',                         type: 'number' },
  { key: '합계금액',                        label: '합계금액',                     type: 'number' },
  { key: '수금일 기준',                     label: '수금일 기준',                  type: 'text' },
  { key: '수금 기한',                       label: '수금 기한',                    type: 'text' },
  { key: '수수료 (VAT포함)',                label: '수수료 (VAT포함)',             type: 'number' },
  { key: '수취이메일',                      label: '수취이메일',                   type: 'text' },
  { key: '수수료 세금계산서 발행여부',       label: '수수료 세금계산서 발행여부',   type: 'text' },
  { key: 'CT 해당금액 (vat 제외)',          label: 'CT 해당금액 (VAT 제외)',       type: 'number' },
  { key: 'IMC 해당금액 (vat 제외)',         label: 'IMC 해당금액 (VAT 제외)',      type: 'number' },
  { key: 'TV 해당금액 (vat 제외)',          label: 'TV 해당금액 (VAT 제외)',       type: 'number' },
  { key: '비고',                            label: '비고',                         type: 'text' },
  { key: '참고',                            label: '참고',                         type: 'text' },
  { key: '업데이트',                        label: '업데이트',                     type: 'text' },
  { key: '수금 여부',                       label: '수금 여부',                    type: 'text' },
  { key: '실 수금일',                       label: '실 수금일',                    type: 'text' },
]

const PURCHASE_EDITABLE_FIELDS: { key: keyof PurchaseRow; label: string; type: 'text' | 'number' | 'date' }[] = [
  { key: '년월',                            label: '년월',                         type: 'text' },
  { key: '담당자',                          label: '담당자',                       type: 'text' },
  { key: '구분',                            label: '구분',                         type: 'text' },
  { key: '일자',                            label: '일자',                         type: 'text' },
  { key: '거래처명 (세금계산서 기준)',       label: '거래처명',                     type: 'text' },
  { key: '광고주명',                        label: '광고주명',                     type: 'text' },
  { key: '캠페인명',                        label: '캠페인명',                     type: 'text' },
  { key: '공급가액',                        label: '공급가액',                     type: 'number' },
  { key: '세액',                            label: '세액',                         type: 'number' },
  { key: '합계금액',                        label: '합계금액',                     type: 'number' },
  { key: 'IMC',                             label: 'IMC',                          type: 'number' },
  { key: 'TV',                              label: 'TV',                           type: 'number' },
  { key: 'CT',                              label: 'CT',                           type: 'number' },
  { key: '송금일 기준',                     label: '송금일 기준',                  type: 'text' },
  { key: '송금기한',                        label: '송금기한',                     type: 'text' },
]

function RowEditModal({
  target, month, onClose, onSave, onReset, hasOverride,
}: {
  target: { type: 'sales' | 'purchase'; row: SalesRow | PurchaseRow }
  month: string
  onClose: () => void
  onSave: (rowKey: string, overrides: Record<string, unknown>) => Promise<void>
  onReset: (rowKey: string) => Promise<void>
  hasOverride: boolean
}) {
  const fields = (target.type === 'sales' ? SALES_EDITABLE_FIELDS : PURCHASE_EDITABLE_FIELDS) as { key: string; label: string; type: 'text' | 'number' | 'date' }[]
  const initial: Record<string, unknown> = useMemo(() => {
    const obj: Record<string, unknown> = {}
    for (const f of fields) obj[f.key] = (target.row as unknown as Record<string, unknown>)[f.key]
    return obj
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.row])
  const [values, setValues] = useState<Record<string, unknown>>(initial)
  const [saving, setSaving] = useState(false)

  function setField(key: string, type: 'text' | 'number' | 'date', raw: string) {
    setValues(v => ({ ...v, [key]: type === 'number' ? (raw === '' ? '' : parseFloat(raw) || 0) : raw }))
  }

  function diff(): Record<string, unknown> {
    const ov: Record<string, unknown> = {}
    for (const f of fields) {
      if (values[f.key] !== initial[f.key]) ov[f.key] = values[f.key]
    }
    return ov
  }

  async function handleSave() {
    setSaving(true)
    try {
      const ov = diff()
      if (Object.keys(ov).length === 0) {
        alert('변경된 항목이 없습니다.')
        return
      }
      await onSave(target.row._rowKey, ov)
    } finally { setSaving(false) }
  }

  return (
    <ModalShell
      open={true}
      onClose={onClose}
      title={`${target.type === 'sales' ? '매출' : '매입'} 행 수정 · ${month}`}
      maxWidth="2xl"
      scrollable
      onSave={handleSave}
      saveLabel={saving ? '저장 중...' : '저장'}
      saveDisabled={saving}
    >
      <div className="space-y-3">
        <div className="rounded-lg bg-gray-50 px-3 py-2 text-[11px] text-gray-600 flex items-center gap-2 flex-wrap">
          <span>행 식별자: <code className="text-[10px] text-gray-700">{target.row._rowKey}</code></span>
          {hasOverride && (
            <button
              onClick={() => onReset(target.row._rowKey)}
              className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700 hover:bg-red-100"
            >
              ↺ 수정 초기화 (자동값으로 복원)
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {fields.map(f => (
            <div key={f.key} className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-gray-700">{f.label}</label>
              <input
                type={f.type === 'date' ? 'text' : f.type}
                value={String(values[f.key] ?? '')}
                onChange={e => setField(f.key, f.type, e.target.value)}
                className={`rounded-md border px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 ${
                  values[f.key] !== initial[f.key]
                    ? 'bg-yellow-50 border-yellow-300'
                    : 'border-gray-200'
                }`}
              />
            </div>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 px-1">
          변경된 항목(노란색)만 영속화됩니다. 자동 계산 값은 그대로 유지되고, 수정값이 우선 적용됩니다.
        </p>
      </div>
    </ModalShell>
  )
}
