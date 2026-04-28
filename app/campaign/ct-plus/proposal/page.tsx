"use client"

import { useState } from "react"
import * as XLSX from "xlsx"
import { DMP_TARGETS, AVAILABLE_MEDIA } from "@/lib/campaignTypes"

type Tab = 'dmp' | 'rate'

interface DmpProposalRow {
  dmpName: string
  description: string
  targetAudience: string
  estimatedReach: string
  cpm: string
  notes: string
}

interface RateProposalRow {
  media: string
  format: string  // CPM / CPC / CPV
  rate: number
  notes: string
}

const DMP_DESCRIPTIONS: Record<string, string> = {
  SKP:        'SK Planet 통합 데이터 — 커머스·라이프스타일 행동',
  TG360:      '포털·앱 통합 행동 + 인구학적',
  LOTTE:      '롯데멤버스 — 오프라인 소비 + 멤버십',
  WIFI:       '와이파이 접속 기반 위치 빈도',
  KB:         'KB금융 — 금융 행동 + 자산',
  HyperLocal: '특정 지역 반복 방문 (반경 N km)',
}

export default function CampaignProposalPage() {
  const [tab, setTab] = useState<Tab>('dmp')

  // ── 공통 메타 ──────────────────────────────────────
  const [advertiser, setAdvertiser] = useState('')
  const [campaignName, setCampaignName] = useState('')
  const [period, setPeriod] = useState('')
  const [budget, setBudget] = useState<number | ''>('')

  // ── DMP 제안 ─────────────────────────────────────
  const [dmpRows, setDmpRows] = useState<DmpProposalRow[]>(
    DMP_TARGETS.map(d => ({
      dmpName: d,
      description: DMP_DESCRIPTIONS[d] ?? '',
      targetAudience: '',
      estimatedReach: '',
      cpm: '',
      notes: '',
    }))
  )

  // ── 단가 제안 ─────────────────────────────────────
  const [rateRows, setRateRows] = useState<RateProposalRow[]>(
    AVAILABLE_MEDIA.map(m => ({ media: m, format: 'CPM', rate: 0, notes: '' }))
  )

  function updateDmp(idx: number, field: keyof DmpProposalRow, value: string) {
    setDmpRows(rows => rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)))
  }
  function updateRate(idx: number, field: keyof RateProposalRow, value: string | number) {
    setRateRows(rows => rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)))
  }

  function downloadExcel() {
    const wb = XLSX.utils.book_new()
    const meta = [
      ['광고주', advertiser],
      ['캠페인명', campaignName],
      ['기간', period],
      ['예산', budget],
      ['생성일시', new Date().toISOString()],
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['항목', '값'], ...meta]), '캠페인 정보')

    const dmpData = dmpRows.map(r => ({
      DMP: r.dmpName,
      설명: r.description,
      '타겟 오디언스': r.targetAudience,
      '예상 도달': r.estimatedReach,
      CPM: r.cpm,
      비고: r.notes,
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dmpData), 'DMP 타겟팅 제안')

    const rateData = rateRows.map(r => ({
      매체: r.media,
      과금: r.format,
      단가: r.rate,
      비고: r.notes,
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rateData), '단가 제안')

    const fname = `캠페인제안_${(advertiser || '광고주')}_${(campaignName || '캠페인')}_${new Date().toISOString().slice(0, 10)}.xlsx`
    XLSX.writeFile(wb, fname.replace(/[\\/:*?"<>|]/g, '_'))
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-gray-900">캠페인 제안</h1>
            <p className="text-xs text-gray-400 mt-0.5">DMP 타겟팅·매체 단가 제안서 작성 + Excel 출력</p>
          </div>
          <button
            onClick={downloadExcel}
            className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
          >
            제안서 Excel 다운로드
          </button>
        </div>
      </header>

      <main className="p-6 space-y-4">
        {/* 공통 메타 */}
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-800">캠페인 정보</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-gray-700">광고주</label>
              <input value={advertiser} onChange={e => setAdvertiser(e.target.value)}
                className="rounded-md border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder="예: ㈜OO 브랜드" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-gray-700">캠페인명</label>
              <input value={campaignName} onChange={e => setCampaignName(e.target.value)}
                className="rounded-md border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder="예: 2026 4월 봄 시즌" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-gray-700">기간</label>
              <input value={period} onChange={e => setPeriod(e.target.value)}
                className="rounded-md border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder="예: 2026-04-01 ~ 2026-04-30" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-gray-700">예산 (원)</label>
              <input type="number" value={budget} onChange={e => setBudget(e.target.value === '' ? '' : Number(e.target.value))}
                className="rounded-md border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder="예: 10000000" />
            </div>
          </div>
        </section>

        {/* 탭 */}
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1 w-fit">
          {[
            { value: 'dmp',  label: 'DMP 타겟팅 제안' },
            { value: 'rate', label: '단가 제안' },
          ].map(t => (
            <button
              key={t.value}
              onClick={() => setTab(t.value as Tab)}
              className={`rounded-md px-4 py-1.5 text-xs font-medium transition-colors ${
                tab === t.value ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'dmp' && (
          <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <h2 className="border-b border-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-800">DMP 타겟팅 제안</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-blue-50 text-blue-900">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold w-24">DMP</th>
                    <th className="px-3 py-2 text-left font-semibold">설명</th>
                    <th className="px-3 py-2 text-left font-semibold">타겟 오디언스</th>
                    <th className="px-3 py-2 text-left font-semibold">예상 도달</th>
                    <th className="px-3 py-2 text-left font-semibold w-24">CPM</th>
                    <th className="px-3 py-2 text-left font-semibold">비고</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {dmpRows.map((r, i) => (
                    <tr key={r.dmpName} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-semibold text-gray-800">{r.dmpName}</td>
                      <td className="px-3 py-2 text-gray-600">{r.description}</td>
                      <td className="px-3 py-2"><input value={r.targetAudience} onChange={e => updateDmp(i, 'targetAudience', e.target.value)}
                        className="w-full rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                        placeholder="예: 20~30대 여성, 뷰티 관심" /></td>
                      <td className="px-3 py-2"><input value={r.estimatedReach} onChange={e => updateDmp(i, 'estimatedReach', e.target.value)}
                        className="w-full rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                        placeholder="예: 2백만 UU" /></td>
                      <td className="px-3 py-2"><input value={r.cpm} onChange={e => updateDmp(i, 'cpm', e.target.value)}
                        className="w-full rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                        placeholder="예: 8,000원" /></td>
                      <td className="px-3 py-2"><input value={r.notes} onChange={e => updateDmp(i, 'notes', e.target.value)}
                        className="w-full rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === 'rate' && (
          <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <h2 className="border-b border-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-800">매체 단가 제안</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-emerald-50 text-emerald-900">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold w-32">매체</th>
                    <th className="px-3 py-2 text-left font-semibold w-24">과금 방식</th>
                    <th className="px-3 py-2 text-right font-semibold w-32">단가 (원)</th>
                    <th className="px-3 py-2 text-left font-semibold">비고</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rateRows.map((r, i) => (
                    <tr key={r.media} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-semibold text-gray-800">{r.media}</td>
                      <td className="px-3 py-2">
                        <select value={r.format} onChange={e => updateRate(i, 'format', e.target.value)}
                          className="w-full rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400">
                          {['CPM', 'CPC', 'CPV', 'CPI'].map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input type="number" value={r.rate || ''} onChange={e => updateRate(i, 'rate', Number(e.target.value) || 0)}
                          className="w-full rounded border border-gray-200 px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-400"
                          placeholder="예: 8000" />
                      </td>
                      <td className="px-3 py-2"><input value={r.notes} onChange={e => updateRate(i, 'notes', e.target.value)}
                        className="w-full rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
