"use client"

import { useState, useEffect } from "react"
import {
  LineChart, Line, BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts"
import MediaUploadCard from "@/components/ct-plus/MediaUploadCard"
import { parseCtvExcelFile } from "@/lib/excelParser"
import { CTV_REPORT_SECTIONS, MEDIA_CONFIG } from "@/lib/reportTypes"
import type { MediaType, CtvMediaData, CtvReportSection } from "@/lib/reportTypes"

const MEDIA_TYPES: MediaType[] = ["google", "naver", "kakao", "meta"]
const HISTORY_KEY = "ct-ctv-final-history"
const MAX_HISTORY = 5

interface SavedReport {
  id: string
  name: string
  createdAt: string
  mediaLabels: string[]
  mediaList: CtvMediaData[]
  sections: CtvReportSection[]
}

function fmt(n: number) { return n.toLocaleString("ko-KR") }
function fmtK(n: number) {
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}억`
  if (n >= 10000) return `${(n / 10000).toFixed(0)}만`
  return String(n)
}

// ── 종합 인사이트 생성 (RAW_APP reportService 패턴 반영) ──────────────────
function generateCtvInsights(data: CtvMediaData[]): string[] {
  if (!data.length) return []
  const bestVtr  = data.reduce((a, b) => a.summary.vtr > b.summary.vtr ? a : b)
  const worstVtr = data.length > 1 ? data.reduce((a, b) => a.summary.vtr < b.summary.vtr ? a : b) : null
  const totalCost = data.reduce((s, m) => s + m.summary.cost, 0)

  return data.map(m => {
    const cfg   = MEDIA_CONFIG[m.media]
    const share = totalCost > 0 ? Math.round(m.summary.cost / totalCost * 100) : 0
    const isTop = m.media === bestVtr.media
    const isBot = worstVtr && m.media === worstVtr.media

    if (isTop)
      return `${cfg.label}: VTR ${m.summary.vtr.toFixed(1)}%, CPV ${fmt(m.summary.cpv)}원 — 전체 예산의 ${share}%를 소진하며 최고 완료 재생률을 기록했습니다. 현재 소재·타겟팅 조합이 유효하므로 예산 비중 확대를 권장합니다.`
    if (isBot)
      return `${cfg.label}: VTR ${m.summary.vtr.toFixed(1)}%, CPV ${fmt(m.summary.cpv)}원 — 상대적으로 낮은 VTR을 보이고 있습니다. 소재 길이·도입부·타겟 오디언스를 재검토하고 A/B 테스트를 통한 개선이 필요합니다.`
    return `${cfg.label}: VTR ${m.summary.vtr.toFixed(1)}%, CPV ${fmt(m.summary.cpv)}원 — 전체 예산의 ${share}%를 소진하며 안정적인 성과를 유지했습니다.`
  })
}

// ── CTV 리포트 뷰어 ────────────────────────────────────────────────────────
function CtvReportViewer({ mediaList, sections }: { mediaList: CtvMediaData[]; sections: CtvReportSection[] }) {
  const totalImp = mediaList.reduce((s, m) => s + m.summary.impressions, 0)
  const totalCv  = mediaList.reduce((s, m) => s + m.summary.completedViews, 0)
  const totalCost = mediaList.reduce((s, m) => s + m.summary.cost, 0)
  const totalVtr = totalImp > 0 ? (totalCv / totalImp) * 100 : 0
  const totalCpv = totalCv > 0 ? totalCost / totalCv : 0
  const insights = generateCtvInsights(mediaList)

  // 주차별 집계 (전체 합산)
  const weekMap = new Map<string, { imp: number; cv: number; cost: number }>()
  for (const m of mediaList) {
    for (const w of m.weekly) {
      const existing = weekMap.get(w.week) ?? { imp: 0, cv: 0, cost: 0 }
      existing.imp  += w.impressions
      existing.cv   += w.completedViews
      existing.cost += w.cost
      weekMap.set(w.week, existing)
    }
  }
  const weeklyData = Array.from(weekMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, d]) => ({
      week: week.replace(/^\d{4}-/, ""),
      impressions: d.imp,
      completedViews: d.cv,
      vtr: d.imp > 0 ? Math.round((d.cv / d.imp) * 1000) / 10 : 0,
    }))

  const PIE_COLORS = ["#4285F4", "#03C75A", "#FAE100", "#0866FF", "#8B5CF6"]

  return (
    <div className="space-y-6">
      {/* ── 요약 KPI ── */}
      {sections.includes("summary_kpi") && (
        <section className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 px-5 py-3.5">
            <h3 className="text-sm font-semibold text-gray-800">전체 요약 KPI</h3>
          </div>
          <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-5">
            {[
              { label: "총 노출수",     value: fmt(totalImp),    sub: `${mediaList.length}개 매체 합산` },
              { label: "완료 재생수",   value: fmt(totalCv),     sub: "VTR 기준" },
              { label: "평균 VTR",      value: `${totalVtr.toFixed(1)}%`, sub: "완료재생/노출" },
              { label: "총 소진금액",   value: `${fmtK(totalCost)}원`, sub: "VAT 포함" },
              { label: "CPV",           value: `${fmt(Math.round(totalCpv))}원`, sub: "완료재생당 비용" },
            ].map(kpi => (
              <div key={kpi.label} className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3.5 text-center">
                <p className="text-[11px] text-gray-400 font-medium">{kpi.label}</p>
                <p className="mt-1.5 text-xl font-bold text-gray-900">{kpi.value}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{kpi.sub}</p>
              </div>
            ))}
          </div>
          {/* 매체별 KPI 표 */}
          <div className="overflow-x-auto border-t border-gray-100">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500">
                  <th className="px-4 py-2.5 text-left font-medium">매체</th>
                  <th className="px-4 py-2.5 text-right font-medium">노출수</th>
                  <th className="px-4 py-2.5 text-right font-medium">완료재생수</th>
                  <th className="px-4 py-2.5 text-right font-medium">VTR</th>
                  <th className="px-4 py-2.5 text-right font-medium">소진금액</th>
                  <th className="px-4 py-2.5 text-right font-medium">CPV</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {mediaList.map(m => (
                  <tr key={m.media} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <span
                        className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold"
                        style={{ backgroundColor: MEDIA_CONFIG[m.media].bgColor, color: MEDIA_CONFIG[m.media].color }}
                      >
                        {MEDIA_CONFIG[m.media].label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{fmt(m.summary.impressions)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{fmt(m.summary.completedViews)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium text-gray-800">{m.summary.vtr.toFixed(1)}%</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{fmt(m.summary.cost)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{fmt(m.summary.cpv)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── 주차별 성과 추이 ── */}
      {sections.includes("weekly_trend") && weeklyData.length > 0 && (
        <section className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 px-5 py-3.5">
            <h3 className="text-sm font-semibold text-gray-800">주차별 성과 추이</h3>
          </div>
          <div className="p-5 space-y-6">
            <div>
              <p className="mb-2 text-xs font-medium text-gray-500">완료재생수 추이</p>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={weeklyData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <YAxis tickFormatter={fmtK} tick={{ fontSize: 11, fill: "#94a3b8" }} width={48} />
                  <Tooltip
                    formatter={(v: unknown) => [fmt(Number(v)), "완료재생수"]}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                  />
                  <Line type="monotone" dataKey="completedViews" stroke="#7C3AED" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-gray-500">VTR 추이 (%)</p>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={weeklyData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: "#94a3b8" }} width={40} />
                  <Tooltip
                    formatter={(v: unknown) => [`${Number(v).toFixed(1)}%`, "VTR"]}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                  />
                  <Line type="monotone" dataKey="vtr" stroke="#0EA5E9" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      )}

      {/* ── 매체별 비중 비교 ── */}
      {sections.includes("media_comparison") && mediaList.length > 1 && (
        <section className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 px-5 py-3.5">
            <h3 className="text-sm font-semibold text-gray-800">매체별 비중 비교</h3>
          </div>
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
            {[
              { key: "completedViews" as const, label: "완료재생수 비중" },
              { key: "cost" as const,           label: "소진금액 비중" },
            ].map(({ key, label }) => {
              const pieData = mediaList.map((m, i) => ({
                name: MEDIA_CONFIG[m.media].label,
                value: m.summary[key],
                color: PIE_COLORS[i % PIE_COLORS.length],
              }))
              return (
                <div key={key}>
                  <p className="mb-2 text-xs font-medium text-gray-500">{label}</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="40%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={75}
                        dataKey="value"
                        label={({ name, percent }: { name?: string; percent?: number }) =>
                          `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`
                        }
                        labelLine={false}
                      >
                        {pieData.map((d, i) => (
                          <Cell key={i} fill={d.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v: unknown) => [fmt(Number(v)), label]}
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                      />
                      <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ── 소재별 성과 ── */}
      {sections.includes("creative") && (
        <section className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 px-5 py-3.5">
            <h3 className="text-sm font-semibold text-gray-800">소재별 성과</h3>
          </div>
          {mediaList.map(m => {
            if (m.creatives.length === 0) return null
            const maxCv = Math.max(...m.creatives.map(c => c.completedViews), 1)
            return (
              <div key={m.media} className="border-t border-gray-50 first:border-t-0">
                <div className="px-5 py-2.5 bg-gray-50">
                  <span
                    className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                    style={{ backgroundColor: MEDIA_CONFIG[m.media].bgColor, color: MEDIA_CONFIG[m.media].color }}
                  >
                    {MEDIA_CONFIG[m.media].label}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-50 text-xs text-gray-500">
                        <th className="px-4 py-2 text-left font-medium">소재명</th>
                        <th className="px-4 py-2 text-right font-medium">노출수</th>
                        <th className="px-4 py-2 text-right font-medium">완료재생수</th>
                        <th className="px-4 py-2 font-medium w-36">비중</th>
                        <th className="px-4 py-2 text-right font-medium">VTR</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {m.creatives.map((c, i) => (
                        <tr key={i} className="hover:bg-gray-50/50">
                          <td className="max-w-[200px] truncate px-4 py-2 text-gray-700">{c.name}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-gray-500">{fmt(c.impressions)}</td>
                          <td className="px-4 py-2 text-right tabular-nums font-medium text-gray-800">{fmt(c.completedViews)}</td>
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 flex-1 rounded-full bg-gray-100">
                                <div
                                  className="h-1.5 rounded-full bg-purple-500"
                                  style={{ width: `${maxCv > 0 ? (c.completedViews / maxCv) * 100 : 0}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums text-gray-600">{c.vtr.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </section>
      )}

      {/* ── 종합 인사이트 ── */}
      {sections.includes("insights") && insights.length > 0 && (
        <section className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 px-5 py-3.5">
            <h3 className="text-sm font-semibold text-gray-800">종합 인사이트</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {insights.map((text, i) => (
              <div key={i} className="flex gap-3 px-5 py-4">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-purple-100 text-[10px] font-bold text-purple-600">
                  {i + 1}
                </span>
                <p className="text-sm text-gray-700 leading-relaxed">{text}</p>
              </div>
            ))}
            <div className="px-5 py-4 bg-amber-50">
              <p className="text-xs font-semibold text-amber-700 mb-2">다음 캠페인 제안</p>
              <ul className="space-y-1.5 text-xs text-amber-800">
                <li>• VTR 최고 채널 예산 비중 확대 (10~20% 추가 배분)</li>
                <li>• 소재 도입부 첫 3초 최적화 — 시청 완료율 직결 요소</li>
                <li>• 성과 상위 소재는 2주 주기로 교체하여 피로도 관리</li>
                <li>• CTV 전환: TV 시청 환경 최적화 소재(16:9, 자막 포함) 별도 제작 권장</li>
              </ul>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

// ── 메인 페이지 ────────────────────────────────────────────────────────────
export default function CtCtvFinalPage() {
  const [files, setFiles] = useState<Partial<Record<MediaType, File>>>({})
  const [mediaDataList, setMediaDataList] = useState<CtvMediaData[]>([])
  const [selectedSections, setSelectedSections] = useState<CtvReportSection[]>(
    CTV_REPORT_SECTIONS.map(s => s.id)
  )
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<SavedReport[]>([])
  const [historyOpen, setHistoryOpen] = useState(true)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY)
      if (raw) setHistory(JSON.parse(raw))
    } catch {}
  }, [])

  function saveToHistory(mediaList: CtvMediaData[], sections: CtvReportSection[]) {
    const entry: SavedReport = {
      id: Date.now().toString(),
      name: "CT/CTV 종료 리포트",
      createdAt: new Date().toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" }),
      mediaLabels: mediaList.map(m => MEDIA_CONFIG[m.media].label),
      mediaList,
      sections,
    }
    setHistory(prev => {
      const next = [entry, ...prev].slice(0, MAX_HISTORY)
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  function loadFromHistory(saved: SavedReport) {
    setMediaDataList(saved.mediaList)
    setSelectedSections(saved.sections)
    setStep(3)
  }

  function deleteHistory(id: string) {
    setHistory(prev => {
      const next = prev.filter(h => h.id !== id)
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  function toggleSection(id: CtvReportSection) {
    setSelectedSections(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    )
  }

  async function handleGenerate() {
    setLoading(true)
    try {
      const results: CtvMediaData[] = []
      for (const media of MEDIA_TYPES) {
        const file = files[media]
        if (file) results.push(await parseCtvExcelFile(file, media))
      }
      setMediaDataList(results)
      saveToHistory(results, selectedSections)
      setStep(3)
    } catch (e) {
      alert("파일 파싱 중 오류가 발생했습니다. 파일 형식을 확인해주세요.")
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const uploadedCount = Object.keys(files).length

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="border-b border-gray-200 bg-white px-6 py-4 print:hidden">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-gray-900">종료 리포트</h1>
            <p className="text-xs text-gray-400 mt-0.5">캠페인 리포트 · CT/CTV · 종료 리포트</p>
          </div>
          <div className="flex items-center gap-1.5">
            {([1, 2, 3] as const).map(s => (
              <div key={s} className="flex items-center gap-1.5">
                <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition-colors ${step === s ? "bg-purple-600 text-white" : step > s ? "bg-green-500 text-white" : "bg-gray-100 text-gray-400"}`}>
                  {step > s ? "✓" : s}
                </div>
                <span className={`hidden text-xs sm:inline ${step === s ? "font-medium text-gray-700" : "text-gray-400"}`}>
                  {s === 1 ? "파일 업로드" : s === 2 ? "항목 선택" : "리포트 확인"}
                </span>
                {s < 3 && <span className="text-xs text-gray-200">›</span>}
              </div>
            ))}
          </div>
        </div>
      </header>

      <main className="p-6 space-y-6">

        {/* ── STEP 1: 파일 업로드 ── */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-sm font-semibold text-gray-800 mb-0.5">RAW 파일 업로드</h2>
              <p className="text-xs text-gray-400 mb-4">
                매체별 동영상/CTV RAW 파일(.xlsx/.xls/.csv)을 업로드해주세요.
                완료조회수 컬럼이 포함된 파일을 사용하면 VTR이 자동 계산됩니다.
              </p>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {MEDIA_TYPES.map(media => (
                  <MediaUploadCard
                    key={media}
                    media={media}
                    fileName={files[media]?.name}
                    onFileSelect={file => setFiles(prev => ({ ...prev, [media]: file }))}
                    onRemove={() => setFiles(prev => { const n = { ...prev }; delete n[media]; return n })}
                  />
                ))}
              </div>
              {uploadedCount > 0 && (
                <div className="mt-4 flex items-center justify-between rounded-xl border border-purple-100 bg-purple-50 px-4 py-3">
                  <p className="text-sm text-purple-700">
                    <strong>{uploadedCount}개</strong> 매체 업로드 완료
                    {" "}({MEDIA_TYPES.filter(m => files[m]).map(m => MEDIA_CONFIG[m].label).join(", ")})
                  </p>
                  <button onClick={() => setStep(2)} className="rounded-lg bg-purple-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-purple-700">
                    다음 →
                  </button>
                </div>
              )}
            </div>

            {/* 이전 리포트 이력 */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <button
                onClick={() => setHistoryOpen(v => !v)}
                className="flex w-full items-center justify-between px-5 py-3.5 bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-700">🕘 이전에 생성한 리포트</span>
                  {history.length > 0 && (
                    <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                      {history.length}개
                    </span>
                  )}
                </div>
                <svg className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${historyOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {historyOpen && (
                history.length === 0 ? (
                  <div className="px-5 py-8 text-center text-sm text-gray-400">
                    아직 생성된 리포트가 없습니다.
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {history.map(h => (
                      <li key={h.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50">
                        <button onClick={() => loadFromHistory(h)} className="flex flex-1 items-center gap-3 text-left">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-50 text-lg">🎬</div>
                          <div>
                            <p className="text-sm font-medium text-gray-800">{h.name}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {h.mediaLabels.join(" · ")}
                              <span className="mx-1.5 text-gray-200">|</span>
                              {h.createdAt}
                            </p>
                          </div>
                        </button>
                        <button
                          onClick={() => deleteHistory(h.id)}
                          className="rounded p-1 text-gray-500 hover:bg-red-50 hover:text-red-400 transition-colors"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              )}
            </div>
          </div>
        )}

        {/* ── STEP 2: 항목 선택 ── */}
        {step === 2 && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">리포트 항목 선택</h2>
                <p className="text-xs text-gray-400 mt-0.5">포함할 섹션을 선택해주세요.</p>
              </div>
              <button onClick={() => setStep(1)} className="text-xs text-gray-400 hover:text-gray-600">← 파일 다시 선택</button>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {CTV_REPORT_SECTIONS.map(section => {
                const selected = selectedSections.includes(section.id)
                return (
                  <label key={section.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-all ${selected ? "border-purple-300 bg-purple-50" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                    <input type="checkbox" checked={selected} onChange={() => toggleSection(section.id)} className="mt-0.5 h-4 w-4 rounded accent-purple-600" />
                    <div>
                      <p className={`text-sm font-medium ${selected ? "text-purple-800" : "text-gray-700"}`}>{section.label}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{section.description}</p>
                    </div>
                  </label>
                )
              })}
            </div>
            <div className="mt-5 flex items-center justify-between">
              <p className="text-xs text-gray-400">{selectedSections.length}개 항목 선택됨</p>
              <div className="flex gap-2">
                <button onClick={() => setSelectedSections(CTV_REPORT_SECTIONS.map(s => s.id))} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">전체 선택</button>
                <button onClick={handleGenerate} disabled={selectedSections.length === 0 || loading} className="rounded-lg bg-purple-600 px-5 py-1.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50">
                  {loading ? "생성 중..." : "리포트 생성 →"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 3: 리포트 ── */}
        {step === 3 && (
          <div>
            <div className="mb-5 flex items-center justify-between print:hidden">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">CT/CTV 종료 리포트</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {mediaDataList.map(m => MEDIA_CONFIG[m.media].label).join(" · ")}
                  {" · "}{selectedSections.length}개 섹션
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStep(2)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">← 항목 수정</button>
                <button onClick={() => window.print()} className="rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700">🖨️ 인쇄 / PDF</button>
              </div>
            </div>
            <CtvReportViewer mediaList={mediaDataList} sections={selectedSections} />
          </div>
        )}

      </main>
    </div>
  )
}
