"use client"
import React, { useState } from "react"
import { Campaign, Agency, Advertiser, Operator, getCampaignTotals, getCampaignProgress, getDday } from "@/lib/campaignTypes"
import { fmt, spendRateStyle } from "./statusUtils"
import { DailyDeltaCell } from "@/components/DailyDeltaCell"
import type { DailySpendEntry } from "@/lib/hooks/useDailySpendMap"

export function CampaignTableSection({
  filtered, agencies, advertisers, operators, computedSpendMap, dailySpendMap,
  onEdit, onDelete, onStatusToggle, onMemoSave, onDateSave,
  selectedDetailId, setSelectedDetailId
}: {
  filtered: Campaign[]
  agencies: Agency[]
  advertisers: Advertiser[]
  operators: Operator[]
  computedSpendMap: Map<string, { netAmount: number; executionAmount: number; rowCount: number }>
  dailySpendMap?: Map<string, DailySpendEntry>
  onEdit: (c: Campaign) => void
  onDelete: (id: string) => void
  onStatusToggle: (id: string) => void
  // 캠페인 현황 인라인 메모 저장
  onMemoSave: (c: Campaign, memo: string) => Promise<void>
  /** 신규 — 시작일/종료일 inline 수정 저장. 매번 호출되므로 status 페이지에서 throttle/upsert 처리. */
  onDateSave?: (c: Campaign, startDate: string, endDate: string) => Promise<void>
  selectedDetailId: string | null
  setSelectedDetailId: (id: string | null) => void
}) {
  // 인라인 수정 — { [campaignId]: 'start' | 'end' } 형태로 어느 날짜 셀이 열려있는지 추적.
  const [editingDate, setEditingDate] = useState<{ id: string; field: 'start' | 'end' } | null>(null)
  const opName = (id: string) => operators.find(o => o.id === id)?.name ?? "-"
  const agName = (id: string) => agencies.find(a => a.id === id)?.name ?? "-"
  const advName = (id: string) => advertisers.find(a => a.id === id)?.name ?? "-"

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {filtered.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-gray-500">캠페인이 없습니다.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              {/* UX-06: 헤더 간소화 — 부연 설명은 title 툴팁으로 이동, 줄바꿈 제거. */}
              <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500 whitespace-nowrap">
                <th className="px-4 py-3 text-left">캠페인명</th>
                <th className="px-4 py-3 text-left">광고주</th>
                <th className="px-4 py-3 text-left">대행사</th>
                <th className="px-4 py-3 text-left">담당자</th>
                <th className="px-4 py-3 text-left">기간</th>
                <th className="px-4 py-3 text-center" title="운영 기간 대비 경과한 비율">진행률</th>
                <th className="px-4 py-3 text-center" title="raw 데이터 기준 소진율 (실 소진 / 세팅금액)">소진율</th>
                <th className="px-4 py-3 text-right" title="집행금액(세팅금액) — 매체별 총예산 합">집행금액</th>
                <th className="px-4 py-3 text-right" title="당일 / 전일 소진 비교">전일 대비 소진</th>
                <th className="px-4 py-3 text-left">메모</th>
                <th className="px-4 py-3 text-center" title="연결된 CSV 캠페인 수 (DB)">연결</th>
                <th className="px-4 py-3 text-center">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(c => {
                const totals   = getCampaignTotals(c)
                const dday     = getDday(c.endDate)
                const progress = getCampaignProgress(c.startDate, c.endDate)
                const computed = computedSpendMap.get(c.id)
                // 소진율 = raw data 기반 (CSV 업로드 집행금액 ÷ 세팅금액)
                const rawSpendRate = computed && totals.totalSettingCost > 0
                  ? Math.round((computed.netAmount / totals.totalSettingCost) * 1000) / 10
                  : 0
                const isLagging = c.status === "집행 중" && computed && (progress - rawSpendRate) >= 15
                const sc       = spendRateStyle(rawSpendRate)
                const csvCount = c.csvNames?.length ?? 0

                return (
                  <tr
                    key={c.id}
                    data-campaign-row={c.id}
                    className={`hover:bg-gray-50 transition-colors cursor-pointer ${isLagging ? "bg-yellow-50/60" : ""} ${selectedDetailId === c.id ? "ring-1 ring-inset ring-blue-200 bg-blue-50/60" : ""}`}
                    onClick={() => setSelectedDetailId(selectedDetailId === c.id ? null : c.id)}
                  >
                    <td className="px-4 py-3 max-w-[200px]">
                      <div className="font-medium text-gray-900 truncate" title={c.campaignName}>{c.campaignName}</div>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {c.campaignType && (
                          <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold bg-purple-100 text-purple-700">
                            {c.campaignType}
                          </span>
                        )}
                        <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${c.status === "집행 중" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"}`}>
                          {c.status}
                        </span>
                        {dday.label && (
                          <span className={`text-[10px] font-medium ${dday.urgent ? "text-red-600" : dday.expired ? "text-gray-400" : "text-gray-500"}`}>
                            {dday.label}
                          </span>
                        )}
                        {isLagging && <span className="text-[10px] font-semibold text-yellow-700">⚠ 지연</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 max-w-[120px] truncate" title={advName(c.advertiserId)}>
                      {advName(c.advertiserId)}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 max-w-[120px] truncate" title={agName(c.agencyId)}>
                      {agName(c.agencyId)}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{opName(c.managerId)}</td>
                    <td
                      className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap tabular-nums"
                      onClick={e => e.stopPropagation()}
                    >
                      {editingDate?.id === c.id && editingDate.field === 'start' ? (
                        <input
                          type="date"
                          autoFocus
                          defaultValue={c.startDate}
                          max={c.endDate || undefined}
                          onBlur={e => {
                            const v = e.target.value
                            if (v && v !== c.startDate && onDateSave) onDateSave(c, v, c.endDate)
                            setEditingDate(null)
                          }}
                          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingDate(null) }}
                          className="rounded border border-blue-300 px-1 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => onDateSave && setEditingDate({ id: c.id, field: 'start' })}
                          className={`block w-full text-left ${onDateSave ? 'hover:text-blue-600 hover:underline cursor-text' : ''}`}
                          title={onDateSave ? '클릭하여 시작일 수정' : c.startDate}
                        >{c.startDate.slice(2)}</button>
                      )}
                      {editingDate?.id === c.id && editingDate.field === 'end' ? (
                        <input
                          type="date"
                          autoFocus
                          defaultValue={c.endDate}
                          min={c.startDate || undefined}
                          onBlur={e => {
                            const v = e.target.value
                            if (v && v !== c.endDate && onDateSave) onDateSave(c, c.startDate, v)
                            setEditingDate(null)
                          }}
                          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingDate(null) }}
                          className="rounded border border-blue-300 px-1 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => onDateSave && setEditingDate({ id: c.id, field: 'end' })}
                          className={`block w-full text-left ${onDateSave ? 'hover:text-blue-600 hover:underline cursor-text' : ''}`}
                          title={onDateSave ? '클릭하여 종료일 수정' : c.endDate}
                        >{c.endDate.slice(2)}</button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="text-xs font-semibold text-blue-600">{progress}%</div>
                      <div className="mt-1 h-1.5 w-16 mx-auto rounded-full bg-gray-200">
                        <div className="h-full rounded-full bg-blue-400 transition-all" style={{ width: `${Math.min(progress, 100)}%` }} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {computed ? (
                        <>
                          <div className={`text-xs font-semibold ${sc.text}`}>{rawSpendRate.toFixed(1)}%</div>
                          <div className="mt-1 h-1.5 w-16 mx-auto rounded-full bg-gray-200">
                            <div className={`h-full rounded-full transition-all ${sc.bar}`} style={{ width: `${Math.min(rawSpendRate, 100)}%` }} />
                          </div>
                        </>
                      ) : (
                        <span className="text-[10px] text-gray-300">데이터 없음</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-xs">
                      {computed ? (
                        <div>
                          <div className="font-medium text-blue-700">{fmt(computed.netAmount)}</div>
                          <div className="text-[10px] text-gray-400">/ {fmt(totals.totalSettingCost)}</div>
                        </div>
                      ) : (
                        <span className="text-gray-300 text-[11px]">—</span>
                      )}
                    </td>
                    <DailyDeltaCell entry={dailySpendMap?.get(c.id)} />
                    <td className="px-4 py-3 max-w-[180px]" onClick={e => e.stopPropagation()}>
                      <MemoCell c={c} onSave={onMemoSave} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      {csvCount > 0 ? (
                        <span
                          className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700"
                          aria-label={`연결된 CSV 캠페인 ${csvCount}개`}
                          title={`연결된 CSV 캠페인 ${csvCount}개${c.csvNames?.length ? `: ${c.csvNames.join(', ')}` : ''}`}
                        >
                          DB {csvCount}
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-400" aria-label="연결된 DB 없음">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => onEdit(c)}
                          className="rounded-md border border-blue-300 bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-100 transition-colors"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => onStatusToggle(c.id)}
                          className="rounded-md border border-gray-300 bg-white px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                          {c.status === "집행 중" ? "종료" : "재개"}
                        </button>
                        <button
                          onClick={() => onDelete(c.id)}
                          className="rounded-md border border-red-300 bg-red-50 px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-100 transition-colors"
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// 캠페인 현황 인라인 메모 셀.
// - 평소: 메모 내용을 2줄 truncate 로 표시. 비어있으면 '+ 메모' placeholder.
// - 클릭: textarea 편집 모드. 저장/취소 + Ctrl+Enter 저장.
function MemoCell({
  c, onSave,
}: {
  c: Campaign
  onSave: (c: Campaign, memo: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState(c.memo ?? '')
  const [saving,  setSaving]  = useState(false)

  const startEdit = () => { setDraft(c.memo ?? ''); setEditing(true) }
  const cancel    = () => { setDraft(c.memo ?? ''); setEditing(false) }
  const save      = async () => {
    const next = draft.trim()
    if (next === (c.memo ?? '').trim()) { setEditing(false); return }
    setSaving(true)
    try {
      await onSave(c, next)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    const memo = (c.memo ?? '').trim()
    return (
      <button
        type="button"
        onClick={startEdit}
        className="block w-full text-left rounded-md px-2 py-1 hover:bg-yellow-50 transition-colors"
        title="클릭하여 메모 편집"
      >
        {memo ? (
          <p className="text-[11px] text-gray-700 line-clamp-2 whitespace-pre-wrap" title={memo}>
            {memo}
          </p>
        ) : (
          <p className="text-[11px] text-gray-300">+ 메모</p>
        )}
      </button>
    )
  }

  return (
    <div className="space-y-1">
      <textarea
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save() }
          if (e.key === 'Escape') { e.preventDefault(); cancel() }
        }}
        placeholder="특이사항·운영 메모"
        className="w-full rounded-md border border-blue-300 px-2 py-1 text-[11px] text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-200 resize-y"
        rows={3}
        maxLength={500}
      />
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-400">{draft.length}/500 · Ctrl+Enter 저장</span>
        <div className="flex items-center gap-1">
          <button
            type="button" onClick={cancel} disabled={saving}
            className="rounded-md px-2 py-0.5 text-[10px] text-gray-500 hover:bg-gray-100 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button" onClick={save} disabled={saving}
            className="rounded-md bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
