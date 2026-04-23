"use client"
import { useState, useMemo } from "react"
import { useMasterData } from "@/lib/hooks/useMasterData"
import { useRawData } from "@/lib/hooks/useRawData"
import { computeCampaignRows } from "@/lib/markupService"
import { getMediaTotals, getCampaignTotals } from "@/lib/campaignTypes"
import type { Campaign } from "@/lib/campaignTypes"

function fmt(n: number) { return n.toLocaleString('ko-KR') }
function fmtRate(n: number) { return n.toFixed(1) + '%' }

export default function CtPlusFinalPage() {
  const { campaigns, agencies, advertisers, loading: masterLoading } = useMasterData()
  const { allRows: rawRows, loading: rawLoading } = useRawData()
  const [selectedId, setSelectedId] = useState<string>("")

  const campaign = useMemo(() => campaigns.find(c => c.id === selectedId) ?? null, [campaigns, selectedId])
  const agency = useMemo(() => agencies.find(a => a.id === campaign?.agencyId) ?? null, [agencies, campaign])
  const advertiser = useMemo(() => advertisers.find(a => a.id === campaign?.advertiserId) ?? null, [advertisers, campaign])

  // MongoDB raw rows + 캠페인 수수료율 → 실시간 markup 계산 (localStorage 불필요)
  const computedRows = useMemo(() => {
    if (!selectedId || rawRows.length === 0) return []
    return computeCampaignRows(rawRows, campaigns, selectedId)
  }, [selectedId, rawRows, campaigns])

  const settlementRows = useMemo(() => {
    if (!campaign) return []
    return campaign.mediaBudgets.map(mb => {
      const totals = getMediaTotals(mb)
      const mediaRows = computedRows.filter(r => r.media === mb.media)
      const netAmount = mediaRows.reduce((s, r) => s + (r.netAmount ?? 0), 0)
      const executionAmount = mediaRows.reduce((s, r) => s + (r.executionAmount ?? 0), 0)
      const spendRate = totals.totalSettingCost > 0 ? Math.round((netAmount / totals.totalSettingCost) * 1000) / 10 : 0
      const isNaver = mb.media === 'naver'
      return {
        media: mb.media,
        budget: totals.totalBudget,
        feeRate: mb.totalFeeRate ?? totals.dmpMarkup,
        settingCost: totals.totalSettingCost,
        netAmount,
        executionAmount,
        spendRate,
        rowCount: mediaRows.length,
        isNaver,
      }
    })
  }, [campaign, computedRows])

  const totals = useMemo(() => ({
    budget: settlementRows.reduce((s, r) => s + r.budget, 0),
    settingCost: settlementRows.reduce((s, r) => s + r.settingCost, 0),
    netAmount: settlementRows.reduce((s, r) => s + r.netAmount, 0),
    executionAmount: settlementRows.reduce((s, r) => s + r.executionAmount, 0),
  }), [settlementRows])

  const overallSpendRate = totals.settingCost > 0
    ? Math.round((totals.netAmount / totals.settingCost) * 1000) / 10 : 0

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4 print:hidden">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-gray-900">Settlement Check</h1>
            <p className="text-xs text-gray-400 mt-0.5">Based on campaign registration info and performance data</p>
          </div>
          {campaign && (
            <button onClick={() => window.print()} className="rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700 transition-colors">
              Print / PDF
            </button>
          )}
        </div>
      </header>

      <main className="p-6 space-y-6">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm print:hidden">
          <label className="block text-xs font-semibold text-gray-700 mb-2">Select Campaign</label>
          {(masterLoading || rawLoading) ? (
            <p className="text-xs text-gray-400">Loading...</p>
          ) : (
            <select
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="">Please select a campaign</option>
              {campaigns.map(c => {
                const adv = advertisers.find(a => a.id === c.advertiserId)?.name ?? ''
                return (
                  <option key={c.id} value={c.id}>
                    {adv ? `[${adv}] ` : ''}{c.campaignName} ({c.settlementMonth})
                  </option>
                )
              })}
            </select>
          )}
        </div>

        {campaign && (
          <>
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Campaign Info</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: 'Advertiser', value: advertiser?.name ?? '-' },
                  { label: 'Agency', value: agency?.name ?? '-' },
                  { label: 'Campaign', value: campaign.campaignName },
                  { label: 'Month', value: campaign.settlementMonth },
                  { label: 'Period', value: `${campaign.startDate} ~ ${campaign.endDate}` },
                  { label: 'Status', value: campaign.status },
                  { label: 'Data Rows', value: computedRows.length > 0 ? `${fmt(computedRows.length)} rows` : 'None' },
                  { label: 'Type', value: campaign.campaignType ?? '-' },
                ].map(({ label, value }) => (
                  <div key={label} className="space-y-0.5">
                    <p className="text-[11px] text-gray-400">{label}</p>
                    <p className="text-xs font-medium text-gray-800">{value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-900">Settlement by Media</h2>
                {computedRows.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">No performance data - upload CSV on data input page</p>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      {['Media', 'Budget', 'Fee Rate', 'Setting Cost', 'Net Amount', 'Spend Rate', 'Execution'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left font-medium text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {settlementRows.map(row => (
                      <tr key={row.media} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-800">
                          {row.media}
                          {row.isNaver && <span className="ml-1 text-[10px] text-amber-600">(VAT included)</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700">{fmt(row.budget)}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{fmtRate(row.feeRate ?? 0)}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{fmt(row.settingCost)}</td>
                        <td className="px-4 py-3 text-right font-medium text-blue-700">
                          {row.rowCount > 0 ? fmt(row.netAmount) : <span className="text-gray-300">-</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {row.rowCount > 0 ? (
                            <span className={`font-medium ${row.spendRate >= 80 ? 'text-green-600' : row.spendRate >= 50 ? 'text-blue-600' : 'text-gray-500'}`}>
                              {fmtRate(row.spendRate)}
                            </span>
                          ) : <span className="text-gray-300">-</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {row.rowCount > 0 ? fmt(row.executionAmount) : <span className="text-gray-300">-</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                    <tr>
                      <td className="px-4 py-3 font-semibold text-gray-900">Total</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmt(totals.budget)}</td>
                      <td className="px-4 py-3 text-right text-gray-400">-</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmt(totals.settingCost)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-blue-700">{fmt(totals.netAmount)}</td>
                      <td className="px-4 py-3 text-right font-semibold">
                        <span className={overallSpendRate >= 80 ? 'text-green-600' : 'text-blue-600'}>
                          {fmtRate(overallSpendRate)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-700">{fmt(totals.executionAmount)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </>
        )}

        {!campaign && !masterLoading && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="rounded-full bg-gray-100 p-6 mb-4">
              <svg className="h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500">Select a campaign to see settlement summary</p>
            <p className="text-xs text-gray-400 mt-1">Calculated based on campaign info and uploaded CSV data</p>
          </div>
        )}
      </main>
    </div>
  )
}
