"use client"

/**
 * 캠페인별 대행수수료 다중 지급처 입력 패널.
 *
 * 사용자 요청 (2026-06-22): "한 캠페인의 수수료 지급처가 여러 개일 수 있어 추가
 * 지급처를 작성하고 해당 금액을 반영." DB 저장 전 추가 지급처 작성 + 금액 반영.
 *
 * 데이터: agency_fee_splits collection (PR #143 인프라).
 * 워크플로우:
 *   1) 자동 산출된 캠페인별 수수료 표(props 로 받음) 표시
 *   2) 행 expand → 지급처 N개 (agencyName + amount + memo) 입력
 *   3) 합계 자동 계산 + 자동 산출액과 차이 표시
 *   4) 저장 → DB upsert. "확정" 토글 → frozen 잠금
 */

import { useState, useMemo } from 'react'
import { useAgencyFeeSplits, type AgencyFeeSplit } from '@/lib/hooks/useAgencyFeeSplits'

interface CampaignFeeSource {
  /** 캠페인 ID. Motiv: 'motiv-{id}', CT+: campaign.id. */
  campaignId: string
  campaignName: string
  agencyName?: string
  /** 자동 산출된 수수료 (baseline). */
  baselineAmount: number
}

interface Props {
  month: string
  /** 자동 산출된 캠페인별 수수료 목록 — 페이지의 ResultRow 에서 추출. */
  campaigns: CampaignFeeSource[]
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '0'
  return Math.round(n).toLocaleString('ko-KR')
}

export function AgencyFeeSplitsPanel({ month, campaigns }: Props) {
  const { byCampaign, loading, error, upsert, remove, confirm, unconfirm } = useAgencyFeeSplits(month)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [edits, setEdits] = useState<Map<string, AgencyFeeSplit[]>>(new Map())
  const [filterText, setFilterText] = useState('')

  const filtered = useMemo(
    () => campaigns.filter(c => !filterText || c.campaignName.toLowerCase().includes(filterText.toLowerCase())),
    [campaigns, filterText],
  )

  function toggle(campaignId: string) {
    const next = new Set(expanded)
    if (next.has(campaignId)) next.delete(campaignId)
    else next.add(campaignId)
    setExpanded(next)
  }

  function currentSplits(c: CampaignFeeSource): AgencyFeeSplit[] {
    const localEdit = edits.get(c.campaignId)
    if (localEdit) return localEdit
    const doc = byCampaign.get(c.campaignId)
    return doc?.splits ?? [{ agencyName: c.agencyName ?? '', amount: c.baselineAmount, memo: '' }]
  }

  function setLocal(campaignId: string, splits: AgencyFeeSplit[]) {
    setEdits(prev => {
      const next = new Map(prev)
      next.set(campaignId, splits)
      return next
    })
  }

  function addRow(c: CampaignFeeSource) {
    const cur = currentSplits(c)
    setLocal(c.campaignId, [...cur, { agencyName: '', amount: 0, memo: '' }])
  }

  function removeRow(c: CampaignFeeSource, idx: number) {
    const cur = currentSplits(c)
    setLocal(c.campaignId, cur.filter((_, i) => i !== idx))
  }

  function updateRow(c: CampaignFeeSource, idx: number, patch: Partial<AgencyFeeSplit>) {
    const cur = currentSplits(c)
    setLocal(c.campaignId, cur.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }

  async function save(c: CampaignFeeSource) {
    const splits = currentSplits(c).filter(s => s.agencyName.trim())
    if (splits.length === 0) {
      if (!confirm_dialog('지급처가 비어있습니다. 기존 분할을 삭제할까요?')) return
      await remove(c.campaignId)
    } else {
      await upsert({
        month,
        campaignId: c.campaignId,
        splits: splits.map(s => ({ ...s, amount: Number(s.amount) || 0 })),
        totalAmount: splits.reduce((s, x) => s + (Number(x.amount) || 0), 0),
        baselineAmount: c.baselineAmount,
      })
    }
    setEdits(prev => {
      const next = new Map(prev)
      next.delete(c.campaignId)
      return next
    })
  }

  function confirm_dialog(msg: string): boolean {
    return typeof window !== 'undefined' && window.confirm(msg)
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-gray-700">캠페인별 수수료 다중 지급처 ({month})</p>
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">수동 입력 · DB 저장</span>
        </div>
        <input
          type="text"
          value={filterText}
          onChange={e => setFilterText(e.target.value)}
          placeholder="캠페인명 검색…"
          className="rounded border border-gray-200 px-2 py-1 text-[11px] w-48 focus:border-emerald-400 focus:outline-none"
        />
      </div>
      {loading ? (
        <div className="px-5 py-10 text-center text-sm text-gray-400 flex items-center justify-center gap-2">
          <svg className="h-4 w-4 animate-spin text-gray-400" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity=".25"/><path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>
          불러오는 중…
        </div>
      ) : error ? (
        <div className="px-5 py-8 text-center text-sm text-rose-600">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-gray-400">표시할 캠페인이 없습니다.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-3 py-2 text-left font-medium text-gray-500 w-6">·</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500">캠페인명</th>
                <th className="px-2 py-2 text-right font-medium text-gray-500" title="자동 산출 수수료 (baselineAmount)">자동 산출</th>
                <th className="px-2 py-2 text-right font-medium text-gray-500">분배 합계</th>
                <th className="px-2 py-2 text-right font-medium text-gray-500">차이</th>
                <th className="px-2 py-2 text-center font-medium text-gray-500 w-24">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(c => {
                const doc = byCampaign.get(c.campaignId)
                const isOpen = expanded.has(c.campaignId)
                const splits = currentSplits(c)
                const sum = splits.reduce((s, x) => s + (Number(x.amount) || 0), 0)
                const diff = sum - c.baselineAmount
                const isFrozen = doc?.frozen ?? false
                const isDirty = edits.has(c.campaignId)
                return (
                  <>
                    <tr key={c.campaignId} className={`hover:bg-gray-50/50 ${isFrozen ? 'bg-emerald-50/30' : ''}`}>
                      <td className="px-3 py-1.5 text-center">
                        <button onClick={() => toggle(c.campaignId)} className="text-gray-500 hover:text-gray-800" aria-label="펼치기">
                          {isOpen ? '▾' : '▸'}
                        </button>
                      </td>
                      <td className="px-3 py-1.5 text-gray-800 truncate max-w-[260px]" title={c.campaignName}>
                        {c.campaignName}
                        {c.agencyName && <span className="ml-1 text-[10px] text-gray-400">· {c.agencyName}</span>}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-gray-700">{fmt(c.baselineAmount)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-gray-900 font-medium">{fmt(sum)}</td>
                      <td className={`px-2 py-1.5 text-right tabular-nums ${diff === 0 ? 'text-gray-400' : diff > 0 ? 'text-amber-600' : 'text-rose-600'}`}>
                        {diff === 0 ? '0' : (diff > 0 ? '+' : '') + fmt(diff)}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        {isFrozen
                          ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-700">🔒 확정</span>
                          : doc
                            ? <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] text-blue-700">저장됨 {doc.splits.length}건</span>
                            : <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">미저장</span>}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={`${c.campaignId}-expand`} className="bg-gray-50/30">
                        <td></td>
                        <td colSpan={5} className="px-3 py-2">
                          <div className="space-y-1">
                            {splits.map((s, i) => (
                              <div key={i} className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={s.agencyName}
                                  onChange={e => updateRow(c, i, { agencyName: e.target.value })}
                                  disabled={isFrozen}
                                  placeholder="대행사명"
                                  className="flex-1 min-w-[120px] rounded border border-gray-200 px-2 py-0.5 text-[11px] focus:border-emerald-400 focus:outline-none disabled:bg-gray-100"
                                />
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={Number.isFinite(s.amount) ? s.amount.toLocaleString('ko-KR') : ''}
                                  onChange={e => updateRow(c, i, { amount: Number(e.target.value.replace(/,/g, '')) || 0 })}
                                  disabled={isFrozen}
                                  placeholder="금액"
                                  className="w-32 rounded border border-gray-200 px-2 py-0.5 text-right tabular-nums text-[11px] focus:border-emerald-400 focus:outline-none disabled:bg-gray-100"
                                />
                                <input
                                  type="text"
                                  value={s.memo ?? ''}
                                  onChange={e => updateRow(c, i, { memo: e.target.value })}
                                  disabled={isFrozen}
                                  placeholder="메모(선택)"
                                  className="flex-1 min-w-[100px] rounded border border-gray-200 px-2 py-0.5 text-[11px] focus:border-emerald-400 focus:outline-none disabled:bg-gray-100"
                                />
                                {!isFrozen && (
                                  <button onClick={() => removeRow(c, i)} className="rounded p-1 text-rose-500 hover:bg-rose-50" title="이 지급처 삭제">×</button>
                                )}
                              </div>
                            ))}
                            <div className="flex items-center justify-between pt-1">
                              <button
                                onClick={() => addRow(c)}
                                disabled={isFrozen}
                                className="rounded border border-gray-200 px-2 py-0.5 text-[10px] text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                              >+ 지급처 추가</button>
                              <div className="flex items-center gap-1.5">
                                {isDirty && !isFrozen && (
                                  <button onClick={() => save(c)} className="rounded bg-emerald-600 px-2 py-0.5 text-[10px] text-white hover:bg-emerald-700">💾 저장</button>
                                )}
                                {doc && !isFrozen && (
                                  <button onClick={() => confirm(c.campaignId)} className="rounded bg-blue-600 px-2 py-0.5 text-[10px] text-white hover:bg-blue-700">✓ 확정</button>
                                )}
                                {isFrozen && (
                                  <button onClick={() => unconfirm(c.campaignId)} className="rounded bg-amber-500 px-2 py-0.5 text-[10px] text-white hover:bg-amber-600">🔓 잠금 해제</button>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="border-t border-gray-100 px-5 py-2.5 text-[11px] text-gray-500">
        한 캠페인의 수수료를 여러 대행사로 분할 지급할 수 있습니다. 차이가 0 이 아니어도 저장 가능(사용자 자율). <strong>확정 후 잠금</strong> 시 수정 불가 — 잠금 해제 후 재편집.
      </div>
    </div>
  )
}
