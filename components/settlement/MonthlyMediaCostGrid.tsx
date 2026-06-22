"use client"

/**
 * 월별 매체 매입 비용 그리드 — 사용자 이미지 패턴.
 *
 * 행: 매체사 (카테고리 CTV/CT/CT+ 별 그룹)
 * 열: 1월~12월 (KRW)
 * 셀: 인라인 number input (blur 시 DB 자동 저장)
 * footer: 월별 합계 + 카테고리 합계
 *
 * 행 추가/삭제/메모. USD 매체(예: 엑셀비드)는 currency='USD' + fxRates 표시.
 */

import { useMemo, useState, useEffect } from 'react'
import { useMonthlyMediaCosts, type MonthlyMediaCostDoc, type MediaCostCategory } from '@/lib/hooks/useMonthlyMediaCosts'

const MONTHS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']
const CATEGORIES: MediaCostCategory[] = ['CTV', 'CT', 'CT+']

function fmt(n: number): string {
  if (!Number.isFinite(n) || n === 0) return ''
  return Math.round(n).toLocaleString('ko-KR')
}
function sumMonth(rows: MonthlyMediaCostDoc[], m: string): number {
  return rows.reduce((s, r) => s + (Number(r.amounts[m]) || 0), 0)
}

interface Props {
  /** 표시 연도. */
  year: number
  onYearChange?: (y: number) => void
}

export function MonthlyMediaCostGrid({ year, onYearChange }: Props) {
  const { data, loading, error, upsert, remove, refresh } = useMonthlyMediaCosts(year)
  const [adding, setAdding] = useState<MediaCostCategory | null>(null)
  const [newName, setNewName] = useState('')
  const [newCurrency, setNewCurrency] = useState<'KRW' | 'USD'>('KRW')

  // 낙관적 로컬 편집 상태 — 셀 blur 시 DB 저장.
  const [localEdits, setLocalEdits] = useState<Map<string, Record<string, number>>>(new Map())
  useEffect(() => { setLocalEdits(new Map()) }, [year, data.length])

  const grouped = useMemo(() => {
    const g = new Map<MediaCostCategory | 'OTHER', MonthlyMediaCostDoc[]>()
    for (const cat of CATEGORIES) g.set(cat, [])
    g.set('OTHER', [])
    for (const r of data) {
      const c = (r.category ?? 'OTHER') as MediaCostCategory | 'OTHER'
      ;(g.get(c) ?? g.get('OTHER'))!.push(r)
    }
    return g
  }, [data])

  function effectiveAmounts(row: MonthlyMediaCostDoc): Record<string, number> {
    const local = localEdits.get(row.mediaName)
    return local ? { ...row.amounts, ...local } : row.amounts
  }

  function setLocal(mediaName: string, month: string, value: string) {
    const n = value === '' ? 0 : Number(value.replace(/,/g, ''))
    if (!Number.isFinite(n)) return
    setLocalEdits(prev => {
      const next = new Map(prev)
      const m = next.get(mediaName) ?? {}
      next.set(mediaName, { ...m, [month]: n })
      return next
    })
  }

  async function flush(row: MonthlyMediaCostDoc) {
    const local = localEdits.get(row.mediaName)
    if (!local) return
    const merged = { ...row.amounts, ...local }
    const ok = await upsert({ ...row, amounts: merged })
    if (ok) {
      setLocalEdits(prev => {
        const next = new Map(prev)
        next.delete(row.mediaName)
        return next
      })
    }
  }

  async function addNew(cat: MediaCostCategory) {
    const name = newName.trim()
    if (!name) return
    await upsert({
      year,
      mediaName: name,
      category: cat,
      amounts: {},
      currency: newCurrency,
    })
    setAdding(null)
    setNewName('')
    setNewCurrency('KRW')
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-gray-700">월별 매체 매입 비용</p>
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">수동 입력 · DB 저장</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onYearChange?.(year - 1)}
            className="rounded border border-gray-200 px-2 py-0.5 text-xs hover:bg-gray-50"
            aria-label="이전 연도"
          >‹</button>
          <span className="text-xs font-semibold text-gray-700 tabular-nums">{year}</span>
          <button
            type="button"
            onClick={() => onYearChange?.(year + 1)}
            className="rounded border border-gray-200 px-2 py-0.5 text-xs hover:bg-gray-50"
            aria-label="다음 연도"
          >›</button>
          <button
            type="button"
            onClick={() => refresh()}
            className="rounded border border-gray-200 px-2 py-0.5 text-xs hover:bg-gray-50"
            title="새로 불러오기"
          >↻</button>
        </div>
      </div>

      {loading ? (
        <div className="px-5 py-10 text-center text-sm text-gray-400 flex items-center justify-center gap-2">
          <svg className="h-4 w-4 animate-spin text-gray-400" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity=".25"/><path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>
          불러오는 중…
        </div>
      ) : error ? (
        <div className="px-5 py-8 text-center text-sm text-rose-600">{error}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left font-medium text-gray-500 min-w-[160px]">구분 / 매체</th>
                {MONTHS.map(m => (
                  <th key={m} className="px-2 py-2 text-right font-medium text-gray-500 min-w-[90px]">{m}월</th>
                ))}
                <th className="px-2 py-2 text-right font-medium text-gray-500 min-w-[100px]">합계</th>
                <th className="px-2 py-2 text-center font-medium text-gray-500 w-10">·</th>
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.map(cat => {
                const rows = grouped.get(cat) ?? []
                return (
                  <CategoryBlock
                    key={cat}
                    cat={cat}
                    rows={rows}
                    effectiveAmounts={effectiveAmounts}
                    setLocal={setLocal}
                    flush={flush}
                    remove={remove}
                    adding={adding === cat}
                    onStartAdd={() => setAdding(cat)}
                    onCancelAdd={() => setAdding(null)}
                    newName={newName}
                    setNewName={setNewName}
                    newCurrency={newCurrency}
                    setNewCurrency={setNewCurrency}
                    onConfirmAdd={() => addNew(cat)}
                  />
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                <td className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-xs text-gray-700">전체 합계</td>
                {MONTHS.map(m => (
                  <td key={m} className="px-2 py-2 text-right tabular-nums text-xs text-gray-800">
                    {fmt(sumMonth(data, m))}
                  </td>
                ))}
                <td className="px-2 py-2 text-right tabular-nums text-xs text-gray-800">
                  {fmt(MONTHS.reduce((s, m) => s + sumMonth(data, m), 0))}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="border-t border-gray-100 px-5 py-2.5 text-[11px] text-gray-500">
        매체비를 셀에 직접 입력하세요. <strong>입력란을 벗어나면 자동 저장</strong>됩니다. USD 매체(예: 엑셀비드)는 currency=&apos;USD&apos; 로 등록 후 fxRates 별도 입력.
      </div>
    </div>
  )
}

function CategoryBlock(props: {
  cat: MediaCostCategory
  rows: MonthlyMediaCostDoc[]
  effectiveAmounts: (row: MonthlyMediaCostDoc) => Record<string, number>
  setLocal: (mediaName: string, month: string, value: string) => void
  flush: (row: MonthlyMediaCostDoc) => void
  remove: (mediaName: string) => Promise<boolean>
  adding: boolean
  onStartAdd: () => void
  onCancelAdd: () => void
  newName: string
  setNewName: (s: string) => void
  newCurrency: 'KRW' | 'USD'
  setNewCurrency: (c: 'KRW' | 'USD') => void
  onConfirmAdd: () => void
}) {
  const { cat, rows, effectiveAmounts, setLocal, flush, remove, adding, onStartAdd, onCancelAdd, newName, setNewName, newCurrency, setNewCurrency, onConfirmAdd } = props
  return (
    <>
      <tr className="bg-gray-100/60">
        <td className="sticky left-0 z-10 bg-gray-100/80 px-3 py-1.5 text-[11px] font-semibold text-gray-700" colSpan={1}>
          {cat} 매입 비용
        </td>
        {MONTHS.map(m => (
          <td key={m} className="px-2 py-1.5 text-right tabular-nums text-[11px] font-semibold text-gray-700">
            {fmt(rows.reduce((s, r) => s + (effectiveAmounts(r)[m] ?? 0), 0))}
          </td>
        ))}
        <td className="px-2 py-1.5 text-right tabular-nums text-[11px] font-semibold text-gray-800">
          {fmt(rows.reduce((s, r) => s + MONTHS.reduce((mm, m) => mm + (effectiveAmounts(r)[m] ?? 0), 0), 0))}
        </td>
        <td className="px-2 py-1.5 text-center">
          <button
            type="button"
            onClick={onStartAdd}
            className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-emerald-700"
            title={`${cat} 매체 추가`}
          >+</button>
        </td>
      </tr>
      {rows.map(row => {
        const amounts = effectiveAmounts(row)
        const rowSum = MONTHS.reduce((s, m) => s + (amounts[m] ?? 0), 0)
        return (
          <tr key={row.mediaName} className="hover:bg-gray-50/50">
            <td className="sticky left-0 z-10 bg-white px-3 py-1 text-gray-800 truncate max-w-[160px]" title={row.mediaName}>
              {row.mediaName}
              {row.currency === 'USD' && <span className="ml-1 text-[10px] text-amber-600">($)</span>}
            </td>
            {MONTHS.map(m => (
              <td key={m} className="px-1 py-0.5">
                <input
                  type="text"
                  inputMode="numeric"
                  value={amounts[m] === 0 ? '' : amounts[m].toLocaleString('ko-KR')}
                  onChange={e => setLocal(row.mediaName, m, e.target.value)}
                  onBlur={() => flush(row)}
                  className="w-full rounded border border-transparent px-1 py-0.5 text-right tabular-nums text-[11px] hover:border-gray-300 focus:border-emerald-400 focus:outline-none"
                  placeholder="0"
                />
              </td>
            ))}
            <td className="px-2 py-1 text-right tabular-nums text-[11px] font-medium text-gray-900">{fmt(rowSum)}</td>
            <td className="px-2 py-1 text-center">
              <button
                type="button"
                onClick={() => { if (confirm(`${row.mediaName} 행을 삭제할까요?`)) void remove(row.mediaName) }}
                className="text-[10px] text-rose-500 hover:text-rose-700"
                title="삭제"
              >×</button>
            </td>
          </tr>
        )
      })}
      {adding && (
        <tr className="bg-emerald-50/40">
          <td className="sticky left-0 z-10 bg-emerald-50/60 px-3 py-1.5">
            <div className="flex items-center gap-1">
              <input
                type="text"
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder={`${cat} 매체명`}
                className="flex-1 rounded border border-emerald-300 px-1.5 py-0.5 text-[11px]"
              />
              <select
                value={newCurrency}
                onChange={e => setNewCurrency(e.target.value as 'KRW' | 'USD')}
                className="rounded border border-emerald-300 px-1 py-0.5 text-[10px]"
              >
                <option value="KRW">KRW</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </td>
          <td colSpan={MONTHS.length + 1} className="px-2 py-1.5 text-[11px] text-gray-500">엔터로 저장 후 셀에 금액 입력</td>
          <td className="px-2 py-1.5 text-center">
            <button onClick={onConfirmAdd} className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] text-white hover:bg-emerald-700">✓</button>
            <button onClick={onCancelAdd} className="ml-1 rounded bg-gray-300 px-1.5 py-0.5 text-[10px] text-white hover:bg-gray-400">✕</button>
          </td>
        </tr>
      )}
    </>
  )
}
