"use client"

import { useState, useEffect } from "react"
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts"
import type { MediaData, ReportSection } from "@/lib/reportTypes"
import { MEDIA_CONFIG } from "@/lib/reportTypes"

interface Props {
  mediaList: MediaData[]
  sections: ReportSection[]
}

function fmt(n: number) { return n.toLocaleString('ko-KR') }
function fmtK(n: number) {
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}억`
  if (n >= 10000) return `${(n / 10000).toFixed(0)}만`
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`
  return String(n)
}
function calcDomain(values: number[], padRatio = 0.35): [number, number] {
  const valid = values.filter(v => isFinite(v) && v > 0)
  if (valid.length === 0) return [0, 1]
  const min = Math.min(...valid), max = Math.max(...valid)
  const pad = (max - min) * padRatio || max * 0.3
  return [
    parseFloat(Math.max(0, min - pad).toFixed(2)),
    parseFloat((max + pad).toFixed(2)),
  ]
}

function generateInsights(data: MediaData[]): string[] {
  if (!data.length) return []
  const best = data.reduce((a, b) => a.summary.ctr > b.summary.ctr ? a : b)
  const totalCost = data.reduce((acc, m) => acc + m.summary.cost, 0)
  return data.map(m => {
    const cfg = MEDIA_CONFIG[m.media]
    const share = totalCost > 0 ? Math.round(m.summary.cost / totalCost * 100) : 0
    const isTop = m.media === best.media
    const isBottom = data.length > 1 && m.media === data.reduce((a, b) => a.summary.ctr < b.summary.ctr ? a : b).media
    if (isTop) return `${cfg.label}: CTR ${m.summary.ctr.toFixed(2)}%, CPC ${fmt(m.summary.cpc)}원 — 전체 예산의 ${share}%를 소진하며 캠페인 내 최고 클릭 효율을 기록했습니다. 현재 소재·타겟팅 조합이 유효하므로 예산 비중을 점진적으로 확대하여 스케일업을 도모하는 것을 권장합니다.`
    if (isBottom) return `${cfg.label}: CTR ${m.summary.ctr.toFixed(2)}%, CPC ${fmt(m.summary.cpc)}원 — 전체 예산의 ${share}%를 소진했으나 상대적으로 낮은 CTR을 보이고 있습니다. 게재 지면·타겟 오디언스·입찰 전략을 재검토하고 소재 교체를 통한 효율 개선이 필요합니다.`
    return `${cfg.label}: CTR ${m.summary.ctr.toFixed(2)}%, CPC ${fmt(m.summary.cpc)}원 — 전체 예산의 ${share}%를 소진하며 안정적인 성과를 유지 중입니다. 소재 다양성 강화 및 성과 상위 세그먼트 집중 배분을 권장합니다.`
  })
}
function generateSuggestions(data: MediaData[]): string[] {
  if (!data.length) return []
  const best = data.reduce((a, b) => a.summary.ctr > b.summary.ctr ? a : b)
  const worst = data.length > 1 ? data.reduce((a, b) => a.summary.ctr < b.summary.ctr ? a : b) : null
  const list = [
    `${MEDIA_CONFIG[best.media].label} 예산 비중 확대 (10~20% 추가 배분) — CTR 최고 효율 채널로, 점진적 입찰가 인상과 병행 시 동일 예산 대비 클릭 수를 15~25% 증대할 수 있습니다.`,
    `소재 피로도 관리 — 2~3주 주기로 신규 소재를 순환 투입하거나 A/B 테스트를 통해 성과 상위 소재를 정기적으로 발굴하십시오.`,
    `성과 상위 연령·성별 세그먼트 집중 배분 — CTR 분석 결과를 토대로 효율이 높은 타겟 구간에 예산을 집중하면 전체 캠페인 ROI를 개선할 수 있습니다.`,
  ]
  if (worst) list.push(`${MEDIA_CONFIG[worst.media].label} 집행 전략 재검토 — 낮은 CTR을 보이고 있어 타겟팅·지면·크리에이티브를 전면 재검토한 뒤 소규모 테스트 집행으로 효율 개선 가능성을 검증하십시오.`)
  return list
}

// ── 편집용 인라인 입력 컴포넌트 ──────────────────────────────
function EditCell({ value, onChange, prefix = '', suffix = '' }: {
  value: number; onChange: (v: number) => void; prefix?: string; suffix?: string
}) {
  return (
    <div className="flex items-center gap-0.5">
      {prefix && <span className="text-gray-400 text-xs">{prefix}</span>}
      <input
        type="number"
        className="w-20 rounded border border-blue-200 bg-white px-1 py-0.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-400"
        defaultValue={value}
        onBlur={e => onChange(parseFloat(e.target.value) || 0)}
      />
      {suffix && <span className="text-gray-400 text-xs">{suffix}</span>}
    </div>
  )
}

export default function ReportViewer({ mediaList, sections }: Props) {
  const [editMode, setEditMode] = useState(false)
  const [editableData, setEditableData] = useState<MediaData[]>(() => JSON.parse(JSON.stringify(mediaList)))
  const [insightLines, setInsightLines] = useState(() => generateInsights(mediaList))
  const [suggestionLines, setSuggestionLines] = useState(() => generateSuggestions(mediaList))

  useEffect(() => {
    const d = JSON.parse(JSON.stringify(mediaList))
    setEditableData(d)
    setInsightLines(generateInsights(d))
    setSuggestionLines(generateSuggestions(d))
  }, [mediaList])

  if (!editableData.length) return null
  const data = editableData

  // ── 집계 ──────────────────────────────────────────────────
  const total = data.reduce((acc, m) => ({
    impressions: acc.impressions + m.summary.impressions,
    clicks: acc.clicks + m.summary.clicks,
    cost: acc.cost + m.summary.cost,
  }), { impressions: 0, clicks: 0, cost: 0 })
  const totalCtr = total.impressions > 0 ? (total.clicks / total.impressions) * 100 : 0
  const totalCpc = total.clicks > 0 ? total.cost / total.clicks : 0

  const mediaCompData = data.map(m => ({
    name: MEDIA_CONFIG[m.media].label,
    노출비중: total.impressions > 0 ? Math.round(m.summary.impressions / total.impressions * 100) : 0,
    클릭비중: total.clicks > 0 ? Math.round(m.summary.clicks / total.clicks * 100) : 0,
    color: MEDIA_CONFIG[m.media].color,
  }))

  const weekSet = new Set<string>()
  data.forEach(m => m.weekly.forEach(w => weekSet.add(w.week)))
  const weeks = Array.from(weekSet).sort()
  const weeklyData = weeks.map(week => {
    const row: Record<string, number | string> = { week }
    data.forEach(m => {
      const f = m.weekly.find(w => w.week === week)
      row[`${MEDIA_CONFIG[m.media].label}_소진`] = f?.cost ?? 0
      row[`${MEDIA_CONFIG[m.media].label}_CTR`] = f?.ctr ?? 0
    })
    return row
  })
  const ctrDomain = calcDomain(data.flatMap(m => m.weekly.map(w => w.ctr)).filter(v => v > 0), 0.4)

  // ── 데이터 업데이트 함수 ────────────────────────────────────
  function upSummary(mi: number, field: keyof MediaData['summary'], val: number) {
    setEditableData(prev => { const n = JSON.parse(JSON.stringify(prev)); n[mi].summary[field] = val; return n })
  }
  function upWeekly(mi: number, wi: number, field: 'cost' | 'ctr', val: number) {
    setEditableData(prev => { const n = JSON.parse(JSON.stringify(prev)); if (n[mi]?.weekly[wi]) n[mi].weekly[wi][field] = val; return n })
  }
  function upDemo(mi: number, di: number, field: 'male_ctr' | 'female_ctr', val: number) {
    setEditableData(prev => { const n = JSON.parse(JSON.stringify(prev)); if (n[mi]?.demographic[di]) n[mi].demographic[di][field] = val; return n })
  }
  function upCreative(mi: number, ci: number, field: 'ctr' | 'clicks' | 'impressions', val: number) {
    setEditableData(prev => { const n = JSON.parse(JSON.stringify(prev)); if (n[mi]?.creatives[ci]) n[mi].creatives[ci][field] = val; return n })
  }

  // ── 공통 편집 테이블 스타일 ─────────────────────────────────
  const thCls = "px-2 py-1.5 text-left text-[10px] font-semibold text-gray-500 bg-gray-50 border-b border-gray-100 whitespace-nowrap"
  const tdCls = "px-2 py-1.5 text-xs text-gray-700 border-b border-gray-50"

  return (
    <div className="space-y-6" id="report-content">

      {/* 수정 모드 토글 */}
      <div className="flex justify-end gap-2 print:hidden">
        {editMode ? (
          <>
            <button
              onClick={() => { setEditableData(JSON.parse(JSON.stringify(mediaList))); setInsightLines(generateInsights(mediaList)); setSuggestionLines(generateSuggestions(mediaList)); setEditMode(false) }}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
            >원본으로 되돌리기</button>
            <button onClick={() => setEditMode(false)} className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700">
              ✓ 수정 완료
            </button>
          </>
        ) : (
          <button onClick={() => setEditMode(true)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50">
            ✏️ 내역 수정
          </button>
        )}
      </div>

      {/* ── 1. 전체 요약 KPI ─────────────────────────────────── */}
      {sections.includes('summary_kpi') && (
        <section>
          <h2 className="mb-3 text-base font-bold text-gray-900">전체 요약 KPI</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              { label: '총 노출수', value: fmt(total.impressions), unit: '회' },
              { label: '총 클릭수', value: fmt(total.clicks), unit: '회' },
              { label: '평균 CTR', value: totalCtr.toFixed(2), unit: '%' },
              { label: '총 소진금액', value: fmt(total.cost), unit: '원' },
              { label: '평균 CPC', value: fmt(Math.round(totalCpc)), unit: '원' },
            ].map(item => (
              <div key={item.label} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                <p className="text-xs text-gray-400">{item.label}</p>
                <p className="mt-1 text-xl font-bold text-gray-900">
                  {item.value}<span className="ml-1 text-xs font-normal text-gray-400">{item.unit}</span>
                </p>
              </div>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            {data.map((m, mi) => {
              const cfg = MEDIA_CONFIG[m.media]
              const fields = [
                { key: 'impressions' as const, label: '노출수', unit: '회' },
                { key: 'clicks' as const, label: '클릭수', unit: '회' },
                { key: 'ctr' as const, label: 'CTR', unit: '%' },
                { key: 'cost' as const, label: '소진금액', unit: '원' },
                { key: 'cpc' as const, label: 'CPC', unit: '원' },
              ] as const
              return (
                <div key={m.media} className="rounded-xl border p-4" style={{ backgroundColor: cfg.bgColor, borderColor: cfg.borderColor }}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cfg.color }} />
                    <span className="text-xs font-semibold text-gray-700">{cfg.label}</span>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    {fields.map(({ key, label, unit }) => (
                      <div key={key} className="flex justify-between items-center gap-2">
                        <span className="text-gray-400">{label}</span>
                        {editMode
                          ? <EditCell value={m.summary[key]} onChange={v => upSummary(mi, key, v)} suffix={unit} />
                          : <span className="font-semibold text-gray-800">{key === 'ctr' ? `${m.summary.ctr.toFixed(2)}%` : `${fmt(Math.round(m.summary[key]))}${unit}`}</span>
                        }
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ── 2. 주차별 성과 추이 ──────────────────────────────── */}
      {sections.includes('weekly_trend') && weeklyData.length > 0 && (
        <section>
          <h2 className="mb-3 text-base font-bold text-gray-900">주차별 성과 추이</h2>
          <div className="space-y-4">

            {/* 소진금액 막대 */}
            <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-gray-800">주차별 소진금액 (원)</p>
              <p className="mt-0.5 mb-4 text-xs text-gray-400">매체별 주차 소진 금액 — 막대 높이로 집행 볼륨 비교</p>
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={weeklyData} barCategoryGap="30%" barGap={3}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtK} width={52} />
                  <Tooltip formatter={(v: unknown, name: unknown) => [`${fmt(v as number)}원`, (name as string).replace('_소진', '')]} />
                  <Legend formatter={v => v.replace('_소진', '')} iconType="square" iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                  {data.map(m => (
                    <Bar key={m.media} dataKey={`${MEDIA_CONFIG[m.media].label}_소진`} name={`${MEDIA_CONFIG[m.media].label}_소진`} fill={MEDIA_CONFIG[m.media].color} radius={[3, 3, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>

              {/* 데이터 편집 테이블 */}
              {editMode && (
                <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-3">
                  <p className="mb-2 text-[11px] font-semibold text-blue-700">📝 소진금액 데이터 편집</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr>
                          <th className={thCls}>주차</th>
                          {data.map(m => <th key={m.media} className={thCls}>{MEDIA_CONFIG[m.media].label} 소진(원)</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {weeks.map((week) => (
                          <tr key={week}>
                            <td className={`${tdCls} font-medium`}>{week}</td>
                            {data.map((m, mi) => {
                              const row = m.weekly.find(w => w.week === week)
                              return (
                                <td key={m.media} className={tdCls}>
                                  <EditCell value={row?.cost ?? 0} onChange={v => upWeekly(mi, m.weekly.findIndex(w => w.week === week), 'cost', v)} />
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* CTR 꺾은선 */}
            <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-gray-800">주차별 CTR 추이 (%)</p>
              <p className="mt-0.5 mb-4 text-xs text-gray-400">Y축은 실제 데이터 범위에 맞게 자동 조정</p>
              <ResponsiveContainer width="100%" height={210}>
                <LineChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} domain={ctrDomain} width={48} />
                  <Tooltip formatter={(v: unknown, name: unknown) => [`${(v as number).toFixed(2)}%`, (name as string).replace('_CTR', '')]} />
                  <Legend formatter={v => `${v.replace('_CTR', '')} CTR`} iconType="line" iconSize={16} wrapperStyle={{ fontSize: 11 }} />
                  {data.map(m => (
                    <Line key={m.media} type="monotone" dataKey={`${MEDIA_CONFIG[m.media].label}_CTR`} name={`${MEDIA_CONFIG[m.media].label}_CTR`} stroke={MEDIA_CONFIG[m.media].color} strokeWidth={2.5} dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 6 }} />
                  ))}
                </LineChart>
              </ResponsiveContainer>

              {editMode && (
                <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-3">
                  <p className="mb-2 text-[11px] font-semibold text-blue-700">📝 CTR 데이터 편집</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr>
                          <th className={thCls}>주차</th>
                          {data.map(m => <th key={m.media} className={thCls}>{MEDIA_CONFIG[m.media].label} CTR(%)</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {weeks.map(week => (
                          <tr key={week}>
                            <td className={`${tdCls} font-medium`}>{week}</td>
                            {data.map((m, mi) => {
                              const row = m.weekly.find(w => w.week === week)
                              return (
                                <td key={m.media} className={tdCls}>
                                  <EditCell value={row?.ctr ?? 0} onChange={v => upWeekly(mi, m.weekly.findIndex(w => w.week === week), 'ctr', v)} suffix="%" />
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── 3. 매체별 비중 ──────────────────────────────────── */}
      {sections.includes('media_comparison') && mediaCompData.length > 0 && (
        <section>
          <h2 className="mb-3 text-base font-bold text-gray-900">매체별 비중 비교</h2>
          <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {[
                { key: '노출비중' as const, label: '노출 비중 (%)', sub: '전체 노출 중 각 매체 점유율' },
                { key: '클릭비중' as const, label: '클릭 비중 (%)', sub: '전체 클릭 중 각 매체 점유율' },
              ].map(({ key, label, sub }) => (
                <div key={key}>
                  <p className="text-sm font-semibold text-gray-700">{label}</p>
                  <p className="mb-2 text-xs text-gray-400">{sub}</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={mediaCompData} dataKey={key} nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine>
                        {mediaCompData.map(e => <Cell key={e.name} fill={e.color} />)}
                      </Pie>
                      <Tooltip formatter={(v: unknown) => [`${v}%`, '']} />
                      <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── 4. 성별/연령별 성과 ─────────────────────────────── */}
      {sections.includes('demographic') && (
        <section>
          <h2 className="mb-3 text-base font-bold text-gray-900">성별/연령별 성과</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {data.filter(m => m.demographic.length > 0).map((m, mi) => {
              const cfg = MEDIA_CONFIG[m.media]
              const domain = calcDomain(m.demographic.flatMap(d => [d.male_ctr, d.female_ctr]).filter(v => v > 0), 0.5)
              return (
                <div key={m.media} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                  <p className="text-sm font-semibold" style={{ color: cfg.color }}>{cfg.label} — 연령/성별 CTR (%)</p>
                  <p className="mb-3 mt-0.5 text-xs text-gray-400">Y축 범위 데이터 기준 자동 조정</p>
                  <ResponsiveContainer width="100%" height={230}>
                    <BarChart data={m.demographic} barGap={2}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                      <XAxis dataKey="age" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} domain={domain} width={48} />
                      <Tooltip formatter={(v: unknown) => [`${(v as number).toFixed(2)}%`, '']} />
                      <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="male_ctr" name="남성 CTR" fill="#3B82F6" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="female_ctr" name="여성 CTR" fill="#F43F5E" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>

                  {editMode && (
                    <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-3">
                      <p className="mb-2 text-[11px] font-semibold text-blue-700">📝 연령/성별 데이터 편집</p>
                      <table className="w-full text-xs">
                        <thead>
                          <tr>
                            <th className={thCls}>연령대</th>
                            <th className={thCls}>남성 CTR(%)</th>
                            <th className={thCls}>여성 CTR(%)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {m.demographic.map((d, di) => (
                            <tr key={di}>
                              <td className={`${tdCls} font-medium`}>{d.age}</td>
                              <td className={tdCls}><EditCell value={d.male_ctr} onChange={v => upDemo(mi, di, 'male_ctr', v)} suffix="%" /></td>
                              <td className={tdCls}><EditCell value={d.female_ctr} onChange={v => upDemo(mi, di, 'female_ctr', v)} suffix="%" /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ── 5. 소재별 성과 ──────────────────────────────────── */}
      {sections.includes('creative') && (
        <section>
          <h2 className="mb-3 text-base font-bold text-gray-900">소재별 성과</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {data.filter(m => m.creatives.length > 0).map((m, mi) => {
              const cfg = MEDIA_CONFIG[m.media]
              const maxCtr = Math.max(...m.creatives.map(c => c.ctr).filter(v => v > 0), 1)
              return (
                <div key={m.media} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                  <p className="text-sm font-semibold" style={{ color: cfg.color }}>{cfg.label} — 소재별 CTR (%)</p>
                  <p className="mb-3 mt-0.5 text-xs text-gray-400">클릭수 기준 상위 10개 소재</p>
                  <ResponsiveContainer width="100%" height={Math.max(200, m.creatives.length * 34)}>
                    <BarChart data={m.creatives} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} domain={[0, parseFloat((maxCtr * 1.35).toFixed(2))]} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={130} />
                      <Tooltip formatter={(v: unknown) => [`${(v as number).toFixed(2)}%`, 'CTR']} />
                      <Bar dataKey="ctr" name="CTR" fill={cfg.color} radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>

                  {editMode && (
                    <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-3">
                      <p className="mb-2 text-[11px] font-semibold text-blue-700">📝 소재 데이터 편집</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr>
                              <th className={thCls}>소재명</th>
                              <th className={thCls}>CTR(%)</th>
                              <th className={thCls}>클릭수</th>
                              <th className={thCls}>노출수</th>
                            </tr>
                          </thead>
                          <tbody>
                            {m.creatives.map((c, ci) => (
                              <tr key={ci}>
                                <td className={`${tdCls} max-w-[120px] truncate`} title={c.name}>{c.name}</td>
                                <td className={tdCls}><EditCell value={c.ctr} onChange={v => upCreative(mi, ci, 'ctr', v)} suffix="%" /></td>
                                <td className={tdCls}><EditCell value={c.clicks} onChange={v => upCreative(mi, ci, 'clicks', v)} /></td>
                                <td className={tdCls}><EditCell value={c.impressions} onChange={v => upCreative(mi, ci, 'impressions', v)} /></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ── 6. 종합 인사이트 ─────────────────────────────────── */}
      {sections.includes('insights') && (
        <section>
          <h2 className="mb-3 text-base font-bold text-gray-900">종합 인사이트</h2>
          <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <h3 className="mb-3 border-b border-gray-100 pb-2 text-sm font-bold text-gray-700">📊 캠페인 인사이트</h3>
                <ul className="space-y-3">
                  {insightLines.map((text, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />
                      {editMode
                        ? <textarea className="w-full resize-none rounded border border-blue-200 p-2 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400" rows={3} value={text} onChange={e => setInsightLines(prev => prev.map((l, li) => li === i ? e.target.value : l))} />
                        : <span className="text-sm leading-relaxed text-gray-600">{text}</span>
                      }
                    </li>
                  ))}
                </ul>
                {editMode && <button onClick={() => setInsightLines(p => [...p, '새 인사이트를 입력하세요.'])} className="mt-2 text-xs text-blue-500 hover:text-blue-700">+ 항목 추가</button>}
              </div>
              <div>
                <h3 className="mb-3 border-b border-gray-100 pb-2 text-sm font-bold text-gray-700">🚀 다음 단계 제안</h3>
                <ul className="space-y-3">
                  {suggestionLines.map((text, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <svg className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                      {editMode
                        ? <textarea className="w-full resize-none rounded border border-blue-200 p-2 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400" rows={3} value={text} onChange={e => setSuggestionLines(prev => prev.map((l, li) => li === i ? e.target.value : l))} />
                        : <span className="text-sm leading-relaxed text-gray-600">{text}</span>
                      }
                    </li>
                  ))}
                </ul>
                {editMode && <button onClick={() => setSuggestionLines(p => [...p, '새 제안을 입력하세요.'])} className="mt-2 text-xs text-blue-500 hover:text-blue-700">+ 항목 추가</button>}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
