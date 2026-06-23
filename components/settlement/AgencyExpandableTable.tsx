"use client"

/**
 * 대행사별 확장 가능 테이블 — DB 영속화된 정산 데이터(AGENCY × MEDIA) 의 행을
 * 대행사 기준으로 묶고, 토글로 매체 단위 자식 행을 펼친다. 자식 행은 인라인 편집.
 *
 * 사용자 요구 (2026-06-23):
 *   - "DB 저장하고 수정하는 것은 하단에 표를 다시 띄우고 거기서 수정"
 *   - "아래 화살표 토글을 대행사별로 눌러서 해당 대행사의 캠페인을 볼 수 있게"
 *   - "상단의 API 의 값과 얼마나 무엇이 달라졌는지 등도 알림으로 확인 가능"
 *
 * 주의: Open API /settlements 의 groupBy 화이트리스트(`DATE/AGENCY/MEDIA/DATA_PROVIDER`)
 * 에 `CAMPAIGN` 이 없어 분해 단위는 매체(MEDIA) 로 대체. 캠페인 단위 수수료 다중
 * 지급처는 별도의 `AgencyFeeSplitsPanel` 이 담당.
 */

import { useMemo, useState } from 'react'
import { findDimension, type SettlementRow } from '@/lib/openApi/settlementsTypes'
import { snapshotRowKey, type SnapshotState } from '@/lib/hooks/useOpenApiSettlementSnapshot'
import { roundWon } from '@/lib/calculationService'

export interface EditableMetricSpec {
  key: string
  label: string
  /** true 면 통화(₩) 포맷, false 면 퍼센트/숫자. 기본 true. */
  currency?: boolean
  /** Open API 응답에 직접 metric 으로 없는 경우, child 행에서 파생 계산 (예: feeRate). */
  derive?: (metrics: Record<string, number>) => number
  /** 편집 시 metrics 에 어떤 키로 저장할지 (derive 가 있으면 별도 키로 저장 + 자동 재계산 표시). */
  storeAs?: string
}

interface AgencyDetailSnapshot {
  doc: SnapshotState['doc']
  effectiveMetrics: (row: { dimension: unknown[]; metrics: Record<string, number> }) => Record<string, number>
  editRow: (rowKey: string, edits: Record<string, number>) => Promise<boolean>
}

interface Props {
  /** AGENCY × MEDIA (또는 AGENCY 단일) 라이브 행. snapshot.doc.rows 있으면 그쪽 우선. */
  detailRows: SettlementRow[]
  /** AGENCY × MEDIA 단위의 DB 스냅샷 — editRow/effectiveMetrics/frozen 사용. */
  detailSnapshot: AgencyDetailSnapshot
  /**
   * 상단 AGENCY 단일 집계 (API 원본 — DB 저장 전). 대행사별 합계와 비교해 차이 배너 표시.
   * 키: agencyId, 값: 비교할 metric 합계.
   */
  apiAgencyAggregate: Map<string, Record<string, number>>
  /** 인라인 편집 대상 metric 정의. */
  editableMetrics: EditableMetricSpec[]
  /** 차이 비교 시 대상 metric 키 (기본 'revenue'). 차이가 |1원| 초과면 배너 표시. */
  diffMetric?: string
  /** 차이 metric 의 사용자 라벨 (배너용). 기본 '매출'. */
  diffMetricLabel?: string
  /** 표 우상단 타이틀. */
  title: string
  /** 표 하단 안내 문구 (선택). */
  footnote?: string
}

function fmtMoney(n: number): string {
  return roundWon(Number.isFinite(n) ? n : 0).toLocaleString('ko-KR')
}
function fmtPct(n: number): string {
  if (!Number.isFinite(n)) return '0'
  // 소수 2자리, 0 이면 정수
  return Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(2)
}

/**
 * detailRows 를 AGENCY 단위로 묶고, 각 대행사의 child(MEDIA) 합계를 effectiveMetrics 머지로 산출.
 */
interface AgencyGroup {
  agencyId: string
  agencyName: string
  children: Array<{
    row: { dimension: unknown[]; metrics: Record<string, number> }
    rowKey: string
    label: string
    metrics: Record<string, number>
  }>
  sum: Record<string, number>
}

export function AgencyExpandableTable(props: Props) {
  const {
    detailRows, detailSnapshot, apiAgencyAggregate,
    editableMetrics,
    diffMetric = 'revenue', diffMetricLabel = '매출',
    title, footnote,
  } = props

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  // 편집 중 임시 값 (per agency-child + metric). blur 시 editRow 호출 + 클리어.
  const [pending, setPending] = useState<Record<string, Record<string, string>>>({})
  const [saving, setSaving] = useState<Set<string>>(new Set())
  const [notice, setNotice] = useState<string | null>(null)

  const frozen = !!detailSnapshot.doc?.frozen

  // 라이브 vs 저장본 — 저장본 있으면 그 dimension/metrics 사용 (capture 후 정합).
  const sourceRows: { dimension: unknown[]; metrics: Record<string, number> }[] = useMemo(() => {
    if (detailSnapshot.doc) {
      return detailSnapshot.doc.rows.map(r => ({ dimension: r.dimension, metrics: r.metrics }))
    }
    return detailRows
  }, [detailRows, detailSnapshot.doc])

  const groups: AgencyGroup[] = useMemo(() => {
    const map = new Map<string, AgencyGroup>()
    for (const r of sourceRows) {
      const ag = findDimension(r as SettlementRow, 'AGENCY')
      const agencyId = ag?.id ?? '-'
      const agencyName = ag?.name ?? ag?.id ?? '미지정'
      const childDim = findDimension(r as SettlementRow, 'MEDIA')
      const label = childDim?.name ?? childDim?.id ?? '(전체)'
      const rowKey = snapshotRowKey(r)
      const merged = detailSnapshot.effectiveMetrics(r)
      const existing = map.get(agencyId)
      const child = { row: r, rowKey, label, metrics: merged }
      if (existing) {
        existing.children.push(child)
      } else {
        map.set(agencyId, { agencyId, agencyName, children: [child], sum: {} })
      }
    }
    // sum = child metrics 합산 (effectiveMetrics 머지 이후).
    for (const g of map.values()) {
      const acc: Record<string, number> = {}
      for (const c of g.children) {
        for (const [k, v] of Object.entries(c.metrics)) acc[k] = (acc[k] ?? 0) + (Number(v) || 0)
      }
      g.sum = acc
    }
    return Array.from(map.values()).sort((a, b) => (b.sum.revenue ?? 0) - (a.sum.revenue ?? 0))
  }, [sourceRows, detailSnapshot])

  // 차이 알림 — 대행사별 (DB sum) vs (API aggregate).
  const diffs = useMemo(() => {
    const out: Array<{ agencyName: string; db: number; api: number; diff: number }> = []
    for (const g of groups) {
      const apiMetrics = apiAgencyAggregate.get(g.agencyId)
      if (!apiMetrics) continue
      const db = g.sum[diffMetric] ?? 0
      const api = apiMetrics[diffMetric] ?? 0
      const diff = roundWon(db - api)
      if (Math.abs(diff) > 1) out.push({ agencyName: g.agencyName, db, api, diff })
    }
    return out
  }, [groups, apiAgencyAggregate, diffMetric])

  function toggleExpand(agencyId: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(agencyId)) next.delete(agencyId)
      else next.add(agencyId)
      return next
    })
  }

  function onCellChange(rowKey: string, metricKey: string, value: string) {
    setPending(prev => ({ ...prev, [rowKey]: { ...(prev[rowKey] ?? {}), [metricKey]: value } }))
  }

  function clearPending(rowKey: string, metricKey: string) {
    setPending(prev => {
      const cur = prev[rowKey]
      if (!cur || cur[metricKey] === undefined) return prev
      const nextRow: Record<string, string> = {}
      for (const k of Object.keys(cur)) if (k !== metricKey) nextRow[k] = cur[k]
      return { ...prev, [rowKey]: nextRow }
    })
  }

  async function commitCell(rowKey: string, metricKey: string, originalValue: number) {
    const raw = pending[rowKey]?.[metricKey]
    if (raw === undefined) return
    const n = Number(raw.replace(/,/g, ''))
    if (!Number.isFinite(n)) {
      setNotice(`'${metricKey}' 는 숫자여야 합니다.`)
      setTimeout(() => setNotice(null), 2500)
      clearPending(rowKey, metricKey)
      return
    }
    if (n === originalValue) {
      clearPending(rowKey, metricKey)
      return
    }
    setSaving(prev => new Set(prev).add(`${rowKey}:${metricKey}`))
    const ok = await detailSnapshot.editRow(rowKey, { [metricKey]: n })
    setSaving(prev => {
      const next = new Set(prev); next.delete(`${rowKey}:${metricKey}`); return next
    })
    if (ok) {
      setNotice(`✓ 저장됨 — ${metricKey}: ${n.toLocaleString('ko-KR')}`)
      setTimeout(() => setNotice(null), 1800)
      clearPending(rowKey, metricKey)
    } else {
      setNotice('저장 실패 — 콘솔 로그 확인')
      setTimeout(() => setNotice(null), 3000)
    }
  }

  if (!detailSnapshot.doc && sourceRows.length === 0) {
    return null
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-gray-100 flex-wrap">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-gray-700">{title}</p>
          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700" title="DB 저장본을 인라인 편집 — 대행사별 합계 자동 재계산">
            DB 편집
          </span>
          {frozen && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
              🔒 frozen — 편집 잠금
            </span>
          )}
        </div>
        {notice && (
          <div className="rounded-md bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 border border-emerald-200">
            {notice}
          </div>
        )}
      </div>

      {diffs.length > 0 && (
        <div className="border-b border-amber-200 bg-amber-50/70 px-5 py-2.5 space-y-1">
          <p className="text-[11px] font-semibold text-amber-800">
            ⚠ 상단 API 값과 차이 — 총 {diffs.length}개 대행사 ({diffMetricLabel} 기준)
          </p>
          <ul className="space-y-0.5 text-[11px] text-amber-900">
            {diffs.slice(0, 8).map(d => (
              <li key={d.agencyName} className="flex items-center justify-between gap-3">
                <span className="font-medium">{d.agencyName}</span>
                <span className="tabular-nums">
                  DB ₩{fmtMoney(d.db)} vs API ₩{fmtMoney(d.api)}
                  <span className={`ml-2 font-semibold ${d.diff > 0 ? 'text-rose-700' : 'text-blue-700'}`}>
                    (차이 {d.diff > 0 ? '+' : ''}₩{fmtMoney(d.diff)})
                  </span>
                </span>
              </li>
            ))}
            {diffs.length > 8 && (
              <li className="text-amber-700">…외 {diffs.length - 8}개</li>
            )}
          </ul>
        </div>
      )}

      {!detailSnapshot.doc && (
        <div className="border-b border-blue-100 bg-blue-50/60 px-5 py-2 text-[11px] text-blue-800">
          💡 먼저 상단 <strong>💾 정산 진행</strong> 으로 DB 저장하면 이 표에서 인라인 편집이 가능합니다.
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-3 py-2.5 w-8"></th>
              <th className="px-3 py-2.5 text-left font-medium text-gray-500">대행사</th>
              {editableMetrics.map(m => (
                <th key={m.key} className="px-4 py-2.5 text-right font-medium text-gray-500" title={m.key}>
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {groups.map(g => {
              const isOpen = expanded.has(g.agencyId)
              const api = apiAgencyAggregate.get(g.agencyId)
              return (
                <RowFragment key={g.agencyId}>
                  <tr
                    className={`hover:bg-gray-50/60 transition-colors ${isOpen ? 'bg-indigo-50/30' : ''}`}
                  >
                    <td className="px-3 py-2.5 text-center">
                      <button
                        type="button"
                        aria-label={isOpen ? '접기' : '펼치기'}
                        onClick={() => toggleExpand(g.agencyId)}
                        className="inline-flex h-5 w-5 items-center justify-center rounded text-gray-500 hover:bg-gray-200"
                      >
                        <span className={`inline-block transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                      </button>
                    </td>
                    <td className="px-3 py-2.5 font-medium text-gray-800">
                      {g.agencyName}
                      <span className="ml-1.5 text-[10px] text-gray-400">{g.children.length}개 매체</span>
                    </td>
                    {editableMetrics.map(m => {
                      const live = m.derive ? m.derive(g.sum) : (g.sum[m.key] ?? 0)
                      const apiVal = api ? (m.derive ? m.derive(api) : (api[m.key] ?? 0)) : null
                      const delta = apiVal !== null ? roundWon(live - apiVal) : 0
                      const showDelta = apiVal !== null && Math.abs(delta) > 1 && m.key === diffMetric
                      return (
                        <td key={m.key} className="px-4 py-2.5 text-right tabular-nums text-gray-800">
                          {m.currency === false ? fmtPct(live) : `₩${fmtMoney(live)}`}
                          {showDelta && (
                            <span className={`ml-1 text-[10px] font-semibold ${delta > 0 ? 'text-rose-600' : 'text-blue-600'}`}>
                              ({delta > 0 ? '+' : ''}{fmtMoney(delta)})
                            </span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                  {isOpen && g.children.map(c => (
                    <tr key={c.rowKey} className="bg-gray-50/40">
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2 pl-8 text-gray-600">
                        <span className="text-gray-400 mr-1">└</span>
                        {c.label}
                      </td>
                      {editableMetrics.map(m => {
                        const storeKey = m.storeAs ?? m.key
                        const original = m.derive ? m.derive(c.metrics) : (c.metrics[m.key] ?? 0)
                        const pendingVal = pending[c.rowKey]?.[storeKey]
                        const displayVal = pendingVal !== undefined
                          ? pendingVal
                          : (m.currency === false ? String(+original.toFixed(2)) : String(Math.round(original)))
                        const isSaving = saving.has(`${c.rowKey}:${storeKey}`)
                        const disabled = frozen || !detailSnapshot.doc || isSaving
                        return (
                          <td key={m.key} className="px-4 py-1.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {m.currency !== false && <span className="text-[10px] text-gray-400">₩</span>}
                              <input
                                type="text"
                                inputMode="numeric"
                                value={displayVal}
                                disabled={disabled}
                                onChange={e => onCellChange(c.rowKey, storeKey, e.target.value)}
                                onBlur={() => commitCell(c.rowKey, storeKey, m.derive ? m.derive(c.metrics) : (c.metrics[storeKey] ?? 0))}
                                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                                className={`w-28 rounded border px-2 py-0.5 text-right tabular-nums focus:outline-none focus:ring-1 ${
                                  disabled
                                    ? 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed'
                                    : pendingVal !== undefined
                                      ? 'border-amber-300 bg-amber-50 focus:ring-amber-400'
                                      : 'border-gray-200 bg-white focus:ring-indigo-400 focus:border-indigo-400'
                                }`}
                                title={disabled ? (frozen ? '🔒 frozen' : '먼저 💾 정산 진행으로 DB 저장 필요') : '값 변경 후 Enter / blur 시 저장'}
                              />
                              {m.currency === false && <span className="text-[10px] text-gray-400">%</span>}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </RowFragment>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
              <td className="px-3 py-2.5"></td>
              <td className="px-3 py-2.5 text-xs text-gray-600">합계</td>
              {editableMetrics.map(m => {
                const totalLive = groups.reduce((s, g) => s + (m.derive ? m.derive(g.sum) : (g.sum[m.key] ?? 0)), 0)
                return (
                  <td key={m.key} className="px-4 py-2.5 text-right tabular-nums text-xs text-gray-800">
                    {m.currency === false ? fmtPct(totalLive) : `₩${fmtMoney(totalLive)}`}
                  </td>
                )
              })}
            </tr>
          </tfoot>
        </table>
      </div>
      {footnote && (
        <div className="border-t border-gray-100 px-5 py-2 text-[11px] text-gray-500">{footnote}</div>
      )}
    </div>
  )
}

// React table 자식 fragment — table 직접 자식 제약상 tbody 안에 두 row 묶음용.
function RowFragment({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
