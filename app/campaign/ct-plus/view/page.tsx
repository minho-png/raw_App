"use client"

import { useState, useMemo, useEffect } from "react"
import { useReports } from "@/lib/hooks/useReports"
import { useMasterData } from "@/lib/hooks/useMasterData"
import { MEDIA_CONFIG } from "@/lib/reportTypes"
import { getMediaTotals } from "@/lib/campaignTypes"
import type { MediaType } from "@/lib/reportTypes"
import type { RawRow } from "@/lib/rawDataParser"
import type { Campaign } from "@/lib/campaignTypes"

type SettlementTab = 'aggregate' | 'detailed'

function fmt(n: number) { return n.toLocaleString('ko-KR') }

export default function CtPlusViewPage() {
  const { reports, expandReport } = useReports()
  const { campaigns, agencies, advertisers } = useMasterData()

  // 청크 리포트 자동 확장
  const [expandedMap, setExpandedMap] = useState<Record<string, Partial<Record<MediaType, RawRow[]>>>>({})
  const [expandingIds, setExpandingIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    const chunked = reports.filter(r => r.chunked && !expandedMap[r.id] && !expandingIds.has(r.id))
    if (chunked.length === 0) return
    setExpandingIds(prev => {
      const next = new Set(prev)
      chunked.forEach(r => next.add(r.id))
      return next
    })
    Promise.all(chunked.map(r => expandReport(r.id))).then(results => {
      setExpandedMap(prev => {
        const next = { ...prev }
        results.forEach(full => {
          if (full) next[full.id] = full.rowsByMedia
        })
        return next
      })
      setExpandingIds(prev => {
        const next = new Set(prev)
        chunked.forEach(r => next.delete(r.id))
        return next
      })
    })
  }, [reports, expandReport, expandedMap, expandingIds])

  // 청크 리포트의 rowsByMedia를 확장된 데이터로 대체
  const fullReports = useMemo(() =>
    reports.map(r =>
      r.chunked && expandedMap[r.id]
        ? { ...r, rowsByMedia: expandedMap[r.id]! }
        : r
    ),
    [reports, expandedMap]
  )

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null)
  const [settlementTab, setSettlementTab] = useState<SettlementTab>('aggregate')
  const [selectedMediaForDetailed, setSelectedMediaForDetailed] = useState<MediaType | null>(null)

  const selectedCampaign = useMemo<Campaign | null>(() => {
    if (!selectedCampaignId) return null
    return campaigns.find(c => c.id === selectedCampaignId) ?? null
  }, [campaigns, selectedCampaignId])

  // 캠페인에 연결된 리포트 필터링 (csvNames 기반)
  const linkedReports = useMemo(() =>
    selectedCampaign
      ? reports.filter(r =>
          r.campaignName && selectedCampaign.csvNames?.includes(r.campaignName)
        )
      : [],
    [reports, selectedCampaign]
  )

  // 확장된 리포트 데이터 사용
  const linkedFullReports = useMemo(() =>
    linkedReports.map(r =>
      r.chunked && expandedMap[r.id]
        ? { ...r, rowsByMedia: expandedMap[r.id]! }
        : r
    ),
    [linkedReports, expandedMap]
  )

  // 날짜 범위 필터 적용 후 매체별 RawRow 추출
  const filteredRows = useMemo(() => {
    const result: Partial<Record<MediaType, RawRow[]>> = {}
    for (const r of linkedFullReports) {
      for (const [mt, rows] of Object.entries(r.rowsByMedia)) {
        const filtered = (rows ?? []).filter(row => {
          if (dateFrom && row.date < dateFrom) return false
          if (dateTo && row.date > dateTo) return false
          return true
        })
        if (filtered.length) {
          result[mt as MediaType] = [...(result[mt as MediaType] ?? []), ...filtered]
        }
      }
    }
    return result
  }, [linkedFullReports, dateFrom, dateTo])

  // 사용 가능한 매체 목록
  const availableMedia = useMemo<MediaType[]>(() => {
    return (Object.keys(filteredRows) as MediaType[])
      .filter(mt => filteredRows[mt]?.length ?? 0 > 0)
  }, [filteredRows])

  // 매체 없어지면 자동 선택
  useEffect(() => {
    if (availableMedia.length === 0) {
      setSelectedMediaForDetailed(null)
      return
    }
    if (!selectedMediaForDetailed || !availableMedia.includes(selectedMediaForDetailed)) {
      setSelectedMediaForDetailed(availableMedia[0])
    }
  }, [availableMedia.join(',')])

  // 정산 집계 계산
  const settlementAggregates = useMemo(() => {
    const result: Record<MediaType, {
      media: MediaType
      label: string
      color: string
      activeDays: number
      impressions: number
      clicks: number
      spend: number
      settingCost: number | null
      spendRate: number | null
    }> = {} as any

    for (const media of availableMedia) {
      const rows = filteredRows[media] ?? []
      const totalSpend = rows.reduce((s, r) => s + (r.executionAmount ?? r.grossCost ?? r.supplyValue ?? 0), 0)
      const totalImpressions = rows.reduce((s, r) => s + (r.impressions ?? 0), 0)
      const totalClicks = rows.reduce((s, r) => s + (r.clicks ?? 0), 0)
      const activeDays = new Set(rows.map(r => r.date)).size

      // 세팅비용: Campaign.mediaBudgets에서 계산
      let settingCost: number | null = null
      if (selectedCampaign) {
        const mediaLabel = MEDIA_CONFIG[media].label
        const mb = selectedCampaign.mediaBudgets.find(m =>
          m.media.toLowerCase().includes(media) ||
          m.media === mediaLabel
        )
        if (mb) {
          const totals = getMediaTotals(mb)
          settingCost = totals.totalSettingCost
        }
      }

      const spendRate = settingCost && settingCost > 0
        ? Math.round((totalSpend / settingCost) * 1000) / 10
        : null

      result[media] = {
        media,
        label: MEDIA_CONFIG[media].label,
        color: MEDIA_CONFIG[media].color,
        activeDays,
        impressions: totalImpressions,
        clicks: totalClicks,
        spend: totalSpend,
        settingCost,
        spendRate,
      }
    }

    return result
  }, [filteredRows, availableMedia, selectedCampaign])

  // 정산 집계 합계
  const settlementTotals = useMemo(() => {
    let totalImpressions = 0
    let totalClicks = 0
    let totalSpend = 0
    let totalSettingCost = 0

    for (const agg of Object.values(settlementAggregates)) {
      totalImpressions += agg.impressions
      totalClicks += agg.clicks
      totalSpend += agg.spend
      if (agg.settingCost) totalSettingCost += agg.settingCost
    }

    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0
    const avgCtr = Math.round(ctr * 1000) / 1000

    return {
      impressions: totalImpressions,
      clicks: totalClicks,
      spend: totalSpend,
      settingCost: totalSettingCost,
      avgCtr,
    }
  }, [settlementAggregates])

  // 선택 매체의 일별 데이터 (정렬)
  const detailedMediaRows = useMemo<RawRow[]>(() => {
    if (!selectedMediaForDetailed) return []
    const rows = filteredRows[selectedMediaForDetailed] ?? []
    return [...rows].sort((a, b) => a.date.localeCompare(b.date))
  }, [filteredRows, selectedMediaForDetailed])

  // 선택 매체 일별 데이터 합계
  const detailedMediaTotals = useMemo(() => {
    const totalImpressions = detailedMediaRows.reduce((s, r) => s + (r.impressions ?? 0), 0)
    const totalClicks = detailedMediaRows.reduce((s, r) => s + (r.clicks ?? 0), 0)
    const totalSpend = detailedMediaRows.reduce((s, r) => s + (r.executionAmount ?? r.grossCost ?? r.supplyValue ?? 0), 0)
    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0

    return {
      impressions: totalImpressions,
      clicks: totalClicks,
      spend: totalSpend,
      ctr: Math.round(ctr * 1000) / 1000,
    }
  }, [detailedMediaRows])

  // 대행사/광고주 조회
  const agencyName = useMemo(() => {
    if (!selectedCampaign) return ''
    return agencies.find(a => a.id === selectedCampaign.agencyId)?.name ?? ''
  }, [selectedCampaign, agencies])

  const advertiserName = useMemo(() => {
    if (!selectedCampaign) return ''
    return advertisers.find(a => a.id === selectedCampaign.advertiserId)?.name ?? ''
  }, [selectedCampaign, advertisers])

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 헤더 */}
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-gray-900">데이터 조회</h1>
            <p className="text-xs text-gray-400 mt-0.5">캠페인 정산 조회</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-500">캠페인 선택</label>
            <select
              value={selectedCampaignId ?? ''}
              onChange={e => setSelectedCampaignId(e.target.value || null)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— 캠페인을 선택하세요 —</option>
              {campaigns.map(c => (
                <option key={c.id} value={c.id}>
                  {c.campaignName}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col">
        {/* 캠페인 미선택 */}
        {!selectedCampaign ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="rounded-xl border border-gray-200 bg-white p-12 text-center max-w-sm">
              <p className="text-lg font-medium text-gray-700">캠페인을 선택하세요</p>
              <p className="mt-2 text-sm text-gray-500">
                위의 드롭다운에서 캠페인을 선택하면 정산 데이터를 조회할 수 있습니다.
              </p>
            </div>
          </div>
        ) : linkedFullReports.length === 0 ? (
          // 연결 리포트 없음
          <div className="flex-1 flex flex-col p-6">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
              <p className="font-medium text-amber-900">선택한 캠페인에 연결된 데이터가 없습니다.</p>
              <p className="mt-2 text-sm text-amber-700">
                데이터 업로드 탭에서 캠페인명을 연결하세요.
              </p>
            </div>
          </div>
        ) : (
          // 캠페인 선택됨 + 리포트 존재
          <>
            {/* 캠페인 정보 카드 */}
            <div className="border-b border-gray-200 bg-white px-6 py-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{selectedCampaign.campaignName}</h2>
                  <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                    <span>광고주: <span className="font-medium">{advertiserName}</span></span>
                    <span>대행사: <span className="font-medium">{agencyName}</span></span>
                    <span>기간: <span className="font-medium">{selectedCampaign.startDate} ~ {selectedCampaign.endDate}</span></span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">연결 리포트</p>
                  <p className="text-2xl font-bold text-gray-900">{linkedFullReports.length}</p>
                  <p className="text-xs text-gray-500">건</p>
                </div>
              </div>
            </div>

            {/* 날짜 필터 */}
            <div className="border-b border-gray-200 bg-white px-6 py-3">
              <div className="flex items-center gap-3">
                <label className="text-xs text-gray-500">기간</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-xs text-gray-400">~</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {(dateFrom || dateTo) && (
                  <button
                    onClick={() => { setDateFrom(''); setDateTo('') }}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    초기화
                  </button>
                )}
              </div>
            </div>

            {/* 정산 탭 */}
            <div className="border-b border-gray-200 bg-white px-6">
              <div className="flex gap-0">
                {[
                  { id: 'aggregate' as SettlementTab, label: '정산 집계' },
                  { id: 'detailed' as SettlementTab, label: '매체별 상세' },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setSettlementTab(tab.id)}
                    className={`border-b-2 px-5 py-3 text-xs font-medium transition-colors ${
                      settlementTab === tab.id
                        ? 'border-blue-600 text-blue-700'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 탭 내용 */}
            <div className="flex-1 overflow-auto p-6">
              {settlementTab === 'aggregate' && (
                <div className="space-y-6">
                  {/* 매체별 집계 테이블 */}
                  <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                    <div className="border-b border-gray-100 px-6 py-3 bg-gray-50">
                      <h3 className="text-sm font-semibold text-gray-900">매체별 집계</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-gray-200 bg-gray-50 text-gray-600">
                            <th className="px-6 py-3 text-left font-semibold">매체</th>
                            <th className="px-6 py-3 text-right font-semibold">집행일수</th>
                            <th className="px-6 py-3 text-right font-semibold">노출</th>
                            <th className="px-6 py-3 text-right font-semibold">클릭</th>
                            <th className="px-6 py-3 text-right font-semibold">소진금액</th>
                            <th className="px-6 py-3 text-right font-semibold">세팅비용</th>
                            <th className="px-6 py-3 text-right font-semibold">소진율</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {availableMedia.map(media => {
                            const agg = settlementAggregates[media]
                            const spendRateColor = agg.spendRate === null
                              ? 'text-gray-400'
                              : agg.spendRate <= 80
                                ? 'text-blue-600'
                                : agg.spendRate <= 100
                                  ? 'text-green-600'
                                  : 'text-red-600'

                            return (
                              <tr key={media} className="hover:bg-gray-50">
                                <td className="px-6 py-3 font-medium text-gray-900">
                                  <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: agg.color }} />
                                    {agg.label}
                                  </div>
                                </td>
                                <td className="px-6 py-3 text-right text-gray-700">{agg.activeDays}일</td>
                                <td className="px-6 py-3 text-right text-gray-700">{fmt(agg.impressions)}</td>
                                <td className="px-6 py-3 text-right text-gray-700">{fmt(agg.clicks)}</td>
                                <td className="px-6 py-3 text-right text-gray-700">{fmt(Math.round(agg.spend))}원</td>
                                <td className="px-6 py-3 text-right text-gray-700">
                                  {agg.settingCost !== null ? `${fmt(Math.round(agg.settingCost))}원` : '—'}
                                </td>
                                <td className={`px-6 py-3 text-right font-semibold ${spendRateColor}`}>
                                  {agg.spendRate !== null ? `${agg.spendRate}%` : '—'}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-gray-300 bg-gray-100 font-semibold">
                            <td className="px-6 py-3 text-gray-900">합계</td>
                            <td className="px-6 py-3 text-right text-gray-900">—</td>
                            <td className="px-6 py-3 text-right text-gray-900">{fmt(settlementTotals.impressions)}</td>
                            <td className="px-6 py-3 text-right text-gray-900">{fmt(settlementTotals.clicks)}</td>
                            <td className="px-6 py-3 text-right text-gray-900">{fmt(Math.round(settlementTotals.spend))}원</td>
                            <td className="px-6 py-3 text-right text-gray-900">{fmt(Math.round(settlementTotals.settingCost))}원</td>
                            <td className="px-6 py-3 text-right text-gray-900">
                              {settlementTotals.settingCost > 0
                                ? `${Math.round((settlementTotals.spend / settlementTotals.settingCost) * 1000) / 10}%`
                                : '—'
                              }
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>

                  {/* 매체별 기간 요약 카드 */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="rounded-xl border border-gray-200 bg-white p-4">
                      <p className="text-xs text-gray-500">총 노출수</p>
                      <p className="text-2xl font-bold text-gray-900 mt-1">{fmt(settlementTotals.impressions)}</p>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-white p-4">
                      <p className="text-xs text-gray-500">총 클릭수</p>
                      <p className="text-2xl font-bold text-gray-900 mt-1">{fmt(settlementTotals.clicks)}</p>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-white p-4">
                      <p className="text-xs text-gray-500">총 소진금액</p>
                      <p className="text-2xl font-bold text-gray-900 mt-1">{fmt(Math.round(settlementTotals.spend))}원</p>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-white p-4">
                      <p className="text-xs text-gray-500">평균 CTR</p>
                      <p className="text-2xl font-bold text-gray-900 mt-1">{settlementTotals.avgCtr.toFixed(3)}%</p>
                    </div>
                  </div>
                </div>
              )}

              {settlementTab === 'detailed' && (
                <div className="space-y-4">
                  {/* 매체 선택 버튼 */}
                  {availableMedia.length > 0 && (
                    <div className="flex gap-2">
                      {availableMedia.map(media => (
                        <button
                          key={media}
                          onClick={() => setSelectedMediaForDetailed(media)}
                          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                            selectedMediaForDetailed === media
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          }`}
                        >
                          {MEDIA_CONFIG[media].label}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* 일별 데이터 테이블 */}
                  {selectedMediaForDetailed && (
                    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-gray-200 bg-gray-50 text-gray-600">
                              <th className="px-6 py-3 text-left font-semibold">날짜</th>
                              <th className="px-6 py-3 text-left font-semibold">캠페인명</th>
                              <th className="px-6 py-3 text-left font-semibold">DMP명</th>
                              <th className="px-6 py-3 text-right font-semibold">노출</th>
                              <th className="px-6 py-3 text-right font-semibold">클릭</th>
                              <th className="px-6 py-3 text-right font-semibold">CTR</th>
                              <th className="px-6 py-3 text-right font-semibold">소진금액</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {detailedMediaRows.map((row, idx) => {
                              const ctr = (row.impressions ?? 0) > 0
                                ? ((row.clicks ?? 0) / (row.impressions ?? 0)) * 100
                                : 0
                              return (
                                <tr key={idx} className="hover:bg-gray-50">
                                  <td className="px-6 py-3 text-gray-900">{row.date}</td>
                                  <td className="px-6 py-3 text-gray-700 max-w-xs truncate">{row.campaignName}</td>
                                  <td className="px-6 py-3 text-gray-700">{row.dmpName || '—'}</td>
                                  <td className="px-6 py-3 text-right text-gray-700">{fmt(row.impressions ?? 0)}</td>
                                  <td className="px-6 py-3 text-right text-gray-700">{fmt(row.clicks ?? 0)}</td>
                                  <td className="px-6 py-3 text-right text-gray-700">{ctr.toFixed(3)}%</td>
                                  <td className="px-6 py-3 text-right text-gray-700">
                                    {fmt(Math.round(row.executionAmount ?? row.grossCost ?? row.supplyValue ?? 0))}원
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-gray-300 bg-gray-100 font-semibold">
                              <td className="px-6 py-3 text-gray-900" colSpan={3}>
                                {selectedMediaForDetailed ? MEDIA_CONFIG[selectedMediaForDetailed].label : ''} 합계
                              </td>
                              <td className="px-6 py-3 text-right text-gray-900">{fmt(detailedMediaTotals.impressions)}</td>
                              <td className="px-6 py-3 text-right text-gray-900">{fmt(detailedMediaTotals.clicks)}</td>
                              <td className="px-6 py-3 text-right text-gray-900">{detailedMediaTotals.ctr.toFixed(3)}%</td>
                              <td className="px-6 py-3 text-right text-gray-900">{fmt(Math.round(detailedMediaTotals.spend))}원</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
