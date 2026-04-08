"use client"

import { useState, useMemo, useEffect } from "react"
import { useReports } from "@/lib/hooks/useReports"
import { useMasterData } from "@/lib/hooks/useMasterData"
import DailyDataTable from "@/components/ct-plus/DailyDataTable"
import { MEDIA_CONFIG } from "@/lib/reportTypes"
import { calcDmpSettlement, DMP_FEE_RATES_PERCENT } from "@/lib/calculationService"
import type { MediaType } from "@/lib/reportTypes"
import type { RawRow, DmpType } from "@/lib/rawDataParser"
import type { Campaign } from "@/lib/campaignTypes"

type InnerTab = 'data' | 'markup' | 'dmp'

function fmt(n: number) { return n.toLocaleString('ko-KR') }

export default function CtPlusViewPage() {
  const { reports, loading: reportsLoading } = useReports()
  const { campaigns, saveCampaigns } = useMasterData()

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedMedia, setSelectedMedia] = useState<MediaType | null>(null)
  const [selectedCampaignName, setSelectedCampaignName] = useState<string | null>(null)
  const [innerTab, setInnerTab] = useState<InnerTab>('data')

  // 마크업 수정 임시 상태: { mediaLabel → { dmpRate, nonDmpRate } }
  const [markupEdits, setMarkupEdits] = useState<Record<string, { dmpRate: number; nonDmpRate: number }>>({})
  const [markupSaving, setMarkupSaving] = useState(false)
  const [markupSaved, setMarkupSaved] = useState(false)

  // ── 날짜+전체 리포트 기준 사용 가능한 매체 ─────────────────
  const availableMedia = useMemo<MediaType[]>(() => {
    const set = new Set<MediaType>()
    for (const r of reports) {
      for (const [media, rows] of Object.entries(r.rowsByMedia)) {
        if (!rows?.length) continue
        const hasInRange = rows.some(row => {
          if (dateFrom && row.date < dateFrom) return false
          if (dateTo   && row.date > dateTo)   return false
          return true
        })
        if (hasInRange) set.add(media as MediaType)
      }
    }
    return Array.from(set)
  }, [reports, dateFrom, dateTo])

  // 매체 없어지면 자동 선택
  useEffect(() => {
    if (availableMedia.length === 0) {
      setSelectedMedia(null)
      return
    }
    if (!selectedMedia || !availableMedia.includes(selectedMedia)) {
      setSelectedMedia(availableMedia[0])
    }
  }, [availableMedia.join(',')])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── 선택 매체의 날짜 필터 적용 RawRows ─────────────────────
  const mediaRows = useMemo<RawRow[]>(() => {
    if (!selectedMedia) return []
    const rows: RawRow[] = []
    for (const r of reports) {
      for (const row of r.rowsByMedia[selectedMedia] ?? []) {
        if (dateFrom && row.date < dateFrom) continue
        if (dateTo   && row.date > dateTo)   continue
        rows.push(row)
      }
    }
    return rows
  }, [reports, selectedMedia, dateFrom, dateTo])

  // ── 해당 매체의 고유 캠페인명 ───────────────────────────────
  const campaignNames = useMemo<string[]>(() => {
    const names = new Set(mediaRows.map(r => r.campaignName).filter(Boolean))
    return Array.from(names).sort()
  }, [mediaRows])

  // 매체 바뀌면 캠페인 선택 초기화
  useEffect(() => {
    setSelectedCampaignName(null)
  }, [selectedMedia])

  // ── 캠페인 필터 적용 최종 rows ──────────────────────────────
  const filteredRows = useMemo<RawRow[]>(() => {
    if (!selectedCampaignName) return mediaRows
    return mediaRows.filter(r => r.campaignName === selectedCampaignName)
  }, [mediaRows, selectedCampaignName])

  // ── DMP 정산 ───────────────────────────────────────────────
  const dmpSettlement = useMemo(() => {
    return calcDmpSettlement(
      filteredRows.map(r => ({
        dmpType: (r.dmpType as DmpType) || 'DIRECT',
        executionAmount: r.executionAmount || r.grossCost,
        netAmount: r.netAmount || r.netCost,
      }))
    )
  }, [filteredRows])

  // ── 마스터 캠페인 매칭 ──────────────────────────────────────
  const masterCampaign = useMemo<Campaign | null>(() => {
    if (!selectedCampaignName) return null
    return (
      campaigns.find(c => c.campaignName === selectedCampaignName) ??
      campaigns.find(c =>
        selectedCampaignName.includes(c.campaignName) ||
        c.campaignName.includes(selectedCampaignName)
      ) ??
      null
    )
  }, [campaigns, selectedCampaignName])

  // 캠페인 선택 시 마크업 에디터 초기화
  useEffect(() => {
    if (!masterCampaign) {
      setMarkupEdits({})
      return
    }
    const edits: Record<string, { dmpRate: number; nonDmpRate: number }> = {}
    for (const mb of masterCampaign.mediaBudgets) {
      edits[mb.media] = {
        dmpRate: mb.dmp.agencyFeeRate,
        nonDmpRate: mb.nonDmp.agencyFeeRate,
      }
    }
    setMarkupEdits(edits)
  }, [masterCampaign?.id])  // eslint-disable-line react-hooks/exhaustive-deps

  // 현재 선택 매체의 레이블 (MEDIA_CONFIG label)
  const selectedMediaLabel = selectedMedia ? MEDIA_CONFIG[selectedMedia].label : null

  async function handleSaveMarkup() {
    if (!masterCampaign) return
    setMarkupSaving(true)
    const updated: Campaign = {
      ...masterCampaign,
      mediaBudgets: masterCampaign.mediaBudgets.map(mb => ({
        ...mb,
        dmp:    { ...mb.dmp,    agencyFeeRate: markupEdits[mb.media]?.dmpRate    ?? mb.dmp.agencyFeeRate },
        nonDmp: { ...mb.nonDmp, agencyFeeRate: markupEdits[mb.media]?.nonDmpRate ?? mb.nonDmp.agencyFeeRate },
      })),
    }
    const next = campaigns.map(c => c.id === updated.id ? updated : c)
    await saveCampaigns(next)
    setMarkupSaving(false)
    setMarkupSaved(true)
    setTimeout(() => setMarkupSaved(false), 3000)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 헤더 */}
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-gray-900">데이터 조회</h1>
            <p className="text-xs text-gray-400 mt-0.5">캠페인 리포트 · CT+ · 조회</p>
          </div>
          {/* 날짜 필터 */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">기간</span>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-xs text-gray-300">~</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {(dateFrom || dateTo) && (
              <button
                onClick={() => { setDateFrom(''); setDateTo('') }}
                className="text-xs text-blue-600 hover:text-blue-700 px-1"
              >
                초기화
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* 왼쪽 패널: 매체 + 캠페인 선택 */}
        <aside className="w-56 shrink-0 border-r border-gray-200 bg-white">
          {/* 매체 탭 */}
          <div className="border-b border-gray-100 px-3 pt-3 pb-0">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 px-1">매체</p>
            <div className="flex flex-col gap-0.5 pb-3">
              {availableMedia.length === 0 ? (
                <p className="px-2 py-2 text-xs text-gray-400">
                  {reportsLoading ? '로딩 중...' : '저장된 데이터 없음'}
                </p>
              ) : (
                availableMedia.map(mt => {
                  const cfg = MEDIA_CONFIG[mt]
                  return (
                    <button
                      key={mt}
                      onClick={() => setSelectedMedia(mt)}
                      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors ${
                        selectedMedia === mt
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: cfg.color }} />
                      {cfg.label}
                    </button>
                  )
                })
              )}
            </div>
          </div>

          {/* 캠페인 목록 */}
          <div className="px-3 pt-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 px-1">캠페인</p>
            <div className="flex flex-col gap-0.5">
              <button
                onClick={() => setSelectedCampaignName(null)}
                className={`rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                  selectedCampaignName === null
                    ? 'bg-blue-50 font-semibold text-blue-700'
                    : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                전체 ({mediaRows.length}행)
              </button>
              {campaignNames.map(name => {
                const count = mediaRows.filter(r => r.campaignName === name).length
                return (
                  <button
                    key={name}
                    onClick={() => setSelectedCampaignName(name)}
                    className={`rounded-lg px-3 py-2 text-left text-xs transition-colors break-all ${
                      selectedCampaignName === name
                        ? 'bg-blue-50 font-semibold text-blue-700'
                        : 'text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    <span className="line-clamp-2">{name}</span>
                    <span className="text-[10px] text-gray-400">{count}행</span>
                  </button>
                )
              })}
            </div>
          </div>
        </aside>

        {/* 오른쪽 본문 */}
        <main className="flex-1 flex flex-col min-w-0">
          {/* 이너 탭 */}
          <div className="flex gap-0 border-b border-gray-200 bg-white px-6">
            {([
              { id: 'data'   as InnerTab, label: '데이터 테이블' },
              { id: 'markup' as InnerTab, label: '마크업 수정' },
              { id: 'dmp'    as InnerTab, label: 'DMP 정산 확인' },
            ]).map(tab => (
              <button
                key={tab.id}
                onClick={() => setInnerTab(tab.id)}
                className={`border-b-2 px-5 py-3 text-xs font-medium transition-colors ${
                  innerTab === tab.id
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 p-6">
            {/* ── 데이터 테이블 ─────────────────────────────── */}
            {innerTab === 'data' && (
              <>
                {selectedMedia === null ? (
                  <div className="flex h-40 items-center justify-center rounded-xl border border-gray-200 bg-white">
                    <p className="text-sm text-gray-400">왼쪽에서 매체를 선택하세요</p>
                  </div>
                ) : filteredRows.length === 0 ? (
                  <div className="flex h-40 items-center justify-center rounded-xl border border-gray-200 bg-white">
                    <p className="text-sm text-gray-400">해당 조건의 데이터가 없습니다</p>
                  </div>
                ) : (
                  <DailyDataTable rows={filteredRows} media={selectedMedia} />
                )}
              </>
            )}

            {/* ── 마크업 수정 ───────────────────────────────── */}
            {innerTab === 'markup' && (
              <div className="space-y-4">
                {!selectedCampaignName ? (
                  <div className="rounded-xl border border-gray-200 bg-white px-6 py-10 text-center">
                    <p className="text-sm text-gray-500">왼쪽에서 캠페인을 선택하세요</p>
                    <p className="mt-1 text-xs text-gray-400">캠페인을 선택하면 마크업 비율을 수정할 수 있습니다</p>
                  </div>
                ) : !masterCampaign ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-8 text-center">
                    <p className="text-sm font-medium text-amber-700">마스터 캠페인 미등록</p>
                    <p className="mt-1 text-xs text-amber-600">
                      &quot;{selectedCampaignName}&quot;에 매칭되는 캠페인이 마스터 데이터에 없습니다.
                    </p>
                    <p className="mt-0.5 text-xs text-amber-500">데이터 입력 페이지에서 캠페인을 먼저 등록하세요.</p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                    <div className="border-b border-gray-100 px-5 py-4 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{masterCampaign.campaignName}</p>
                        <p className="text-xs text-gray-400 mt-0.5">매체별 대행사 수수료율 (%) 수정</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {markupSaved && (
                          <span className="text-xs text-green-600 font-medium">저장 완료 ✓</span>
                        )}
                        <button
                          onClick={handleSaveMarkup}
                          disabled={markupSaving}
                          className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          {markupSaving ? '저장 중...' : '저장'}
                        </button>
                      </div>
                    </div>

                    <div className="divide-y divide-gray-50">
                      {masterCampaign.mediaBudgets.map(mb => {
                        const edit = markupEdits[mb.media] ?? { dmpRate: mb.dmp.agencyFeeRate, nonDmpRate: mb.nonDmp.agencyFeeRate }
                        const isCurrentMedia = selectedMediaLabel === mb.media
                        return (
                          <div
                            key={mb.media}
                            className={`px-5 py-4 ${isCurrentMedia ? 'bg-blue-50/40' : ''}`}
                          >
                            <div className="flex items-center gap-2 mb-3">
                              <span className="text-sm font-semibold text-gray-700">{mb.media}</span>
                              {isCurrentMedia && (
                                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                                  현재 선택
                                </span>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-[11px] text-gray-500 mb-1">
                                  DMP 활용 수수료율 (%)
                                </label>
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    step={0.1}
                                    value={edit.dmpRate}
                                    onChange={e => {
                                      const val = parseFloat(e.target.value) || 0
                                      setMarkupEdits(prev => ({
                                        ...prev,
                                        [mb.media]: { ...edit, dmpRate: val },
                                      }))
                                    }}
                                    className="w-24 rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                  <span className="text-xs text-gray-400">%</span>
                                  {edit.dmpRate !== mb.dmp.agencyFeeRate && (
                                    <span className="text-[10px] text-amber-600 ml-1">
                                      변경됨 (기존 {mb.dmp.agencyFeeRate}%)
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div>
                                <label className="block text-[11px] text-gray-500 mb-1">
                                  DMP 미활용 수수료율 (%)
                                </label>
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    step={0.1}
                                    value={edit.nonDmpRate}
                                    onChange={e => {
                                      const val = parseFloat(e.target.value) || 0
                                      setMarkupEdits(prev => ({
                                        ...prev,
                                        [mb.media]: { ...edit, nonDmpRate: val },
                                      }))
                                    }}
                                    className="w-24 rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                  <span className="text-xs text-gray-400">%</span>
                                  {edit.nonDmpRate !== mb.nonDmp.agencyFeeRate && (
                                    <span className="text-[10px] text-amber-600 ml-1">
                                      변경됨 (기존 {mb.nonDmp.agencyFeeRate}%)
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    <div className="border-t border-gray-100 bg-gray-50 px-5 py-3">
                      <p className="text-[11px] text-gray-400">
                        * 저장 시 마스터 캠페인 데이터가 업데이트됩니다. 이후 데이터 입력 시 새 수수료율이 적용됩니다.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── DMP 정산 확인 ─────────────────────────────── */}
            {innerTab === 'dmp' && (
              <div className="space-y-4">
                {/* 필터 정보 */}
                <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 flex items-center gap-3 text-xs text-gray-500">
                  <span>기준:</span>
                  {selectedMedia && (
                    <span className="font-medium text-gray-700">{MEDIA_CONFIG[selectedMedia].label}</span>
                  )}
                  {selectedCampaignName && (
                    <>
                      <span className="text-gray-300">·</span>
                      <span className="font-medium text-gray-700">{selectedCampaignName}</span>
                    </>
                  )}
                  {(dateFrom || dateTo) && (
                    <>
                      <span className="text-gray-300">·</span>
                      <span>{dateFrom || '~'} ~ {dateTo || '~'}</span>
                    </>
                  )}
                  <span className="ml-auto text-gray-400">{fmt(filteredRows.length)}행 기준</span>
                </div>

                {dmpSettlement.rows.length === 0 ? (
                  <div className="flex h-40 items-center justify-center rounded-xl border border-gray-200 bg-white">
                    <p className="text-sm text-gray-400">매체와 캠페인을 선택하면 DMP 정산 데이터가 표시됩니다</p>
                  </div>
                ) : (
                  <>
                    {/* 요약 카드 */}
                    <div className="grid grid-cols-3 gap-4">
                      {[
                        { label: '총 집행 금액', value: `${fmt(dmpSettlement.totalExecution)}원`, sub: '마크업 포함' },
                        { label: '총 순 금액(NET)', value: `${fmt(dmpSettlement.totalNet)}원`, sub: 'VAT 제외' },
                        { label: '총 DMP 수수료', value: `${fmt(dmpSettlement.totalFee)}원`, highlight: true },
                      ].map(c => (
                        <div
                          key={c.label}
                          className={`rounded-xl border p-4 shadow-sm ${c.highlight ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-white'}`}
                        >
                          <p className={`text-xs ${c.highlight ? 'text-blue-600' : 'text-gray-500'}`}>{c.label}</p>
                          <p className={`mt-1 text-xl font-bold ${c.highlight ? 'text-blue-700' : 'text-gray-900'}`}>{c.value}</p>
                          {c.sub && <p className="text-[11px] text-gray-400">{c.sub}</p>}
                        </div>
                      ))}
                    </div>

                    {/* DMP별 테이블 */}
                    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
                      <div className="border-b border-gray-100 px-5 py-3">
                        <h3 className="text-sm font-semibold text-gray-700">DMP별 정산 내역</h3>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-gray-100 bg-gray-50 text-gray-500">
                              <th className="px-4 py-2.5 text-left font-medium">DMP</th>
                              <th className="px-4 py-2.5 text-right font-medium">수수료율</th>
                              <th className="px-4 py-2.5 text-right font-medium">집행 금액</th>
                              <th className="px-4 py-2.5 text-right font-medium">순 금액(NET)</th>
                              <th className="px-4 py-2.5 text-right font-medium">DMP 수수료</th>
                              <th className="px-4 py-2.5 text-right font-medium">행 수</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {dmpSettlement.rows.map(row => (
                              <tr
                                key={row.dmpType}
                                className={`hover:bg-gray-50 ${row.feeRate > 0 ? '' : 'text-gray-400'}`}
                              >
                                <td className="px-4 py-2.5 font-medium text-gray-700">
                                  {row.dmpType}
                                  {row.feeRate > 0 && (
                                    <span className="ml-1.5 rounded bg-blue-50 px-1 py-0.5 text-[10px] text-blue-600">
                                      DMP
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 text-right tabular-nums">
                                  {DMP_FEE_RATES_PERCENT[row.dmpType]}%
                                </td>
                                <td className="px-4 py-2.5 text-right tabular-nums">{fmt(row.totalExecution)}원</td>
                                <td className="px-4 py-2.5 text-right tabular-nums">{fmt(row.totalNet)}원</td>
                                <td className={`px-4 py-2.5 text-right font-medium tabular-nums ${row.feeAmount > 0 ? 'text-blue-700' : ''}`}>
                                  {row.feeAmount > 0 ? `${fmt(row.feeAmount)}원` : '—'}
                                </td>
                                <td className="px-4 py-2.5 text-right text-gray-400">{row.rowCount}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                              <td className="px-4 py-3 text-gray-700" colSpan={2}>합계</td>
                              <td className="px-4 py-3 text-right tabular-nums text-gray-800">{fmt(dmpSettlement.totalExecution)}원</td>
                              <td className="px-4 py-3 text-right tabular-nums text-gray-800">{fmt(dmpSettlement.totalNet)}원</td>
                              <td className="px-4 py-3 text-right tabular-nums text-blue-700">{fmt(dmpSettlement.totalFee)}원</td>
                              <td className="px-4 py-3 text-right text-gray-400">
                                {dmpSettlement.rows.reduce((s, r) => s + r.rowCount, 0)}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
