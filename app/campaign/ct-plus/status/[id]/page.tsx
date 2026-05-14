"use client"
import React, { useMemo, useState, useCallback, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid, Cell,
} from "recharts"
import { useMasterData } from "@/lib/hooks/useMasterData"
import { useRawData } from "@/lib/hooks/useRawData"
import { applyMarkupToRows } from "@/lib/markupService"
import { getCampaignTotals, getCampaignProgress, getMediaTotals } from "@/lib/campaignTypes"
import { fmt, spendRateStyle } from "@/app/campaign/ct-plus/components/ct-plus/statusUtils"
import type { RawRow } from "@/lib/rawDataParser"
import { mColor } from "@/lib/mediaColors"
import { useKpiThresholds, checkBudgetWarning, checkRateWarning, checkCostWarning, type KpiWarning } from "@/lib/kpiThresholds"
import { useFilterPersistence } from "@/lib/hooks/useFilterPersistence"
import { FilterBar, FilterChipGroup, FilterSearch, FilterReset } from "@/components/atoms/filters"
import { KpiThresholdSettings } from "@/components/molecules/KpiThresholdSettings"

const CREATIVE_COLORS = ["#3b82f6","#8b5cf6","#10b981","#f59e0b","#ef4444","#06b6d4","#ec4899","#84cc16"]

// 금액 표기 — 단위 약어(만/억) 사용 안 함, 천 단위 콤마만.
function fmtAbbr(n: number): string {
  return fmt(n)
}

type Tab = "summary" | "daily" | "weekly" | "creative" | "raw"

function aggRows(rows: RawRow[]) {
  const imp = rows.reduce((s,r)=>s+(r.impressions??0),0)
  const clk = rows.reduce((s,r)=>s+(r.clicks??0),0)
  const vws = rows.reduce((s,r)=>s+(r.views??0),0)
  const spd = rows.reduce((s,r)=>s+(r.executionAmount??0),0)
  const net = rows.reduce((s,r)=>s+(r.netAmount??0),0)
  return {
    impressions:imp, clicks:clk, views:vws, spend:spd, netAmount:net,
    ctr: imp>0 ? +(clk/imp*100).toFixed(2) : 0,
    vtr: imp>0 ? +(vws/imp*100).toFixed(3) : 0,
    cpm: imp>0 ? Math.round(spd/imp*1000) : 0,
    cpc: clk>0 ? Math.round(spd/clk) : 0,
    cpv: vws>0 ? Math.round(spd/vws) : 0,
  }
}

function rowKey(r: RawRow) { return `${r.date}|${r.media}|${r.campaignName}|${r.creativeName}|${r.dmpName}` }

export default function CampaignDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = typeof params?.id === "string" ? params.id : ""
  const { campaigns, operators, agencies, advertisers, upsertCampaign } = useMasterData()
  const { batches, allRows: rawRows, updateBatch } = useRawData()
  const [tab, setTab] = useFilterPersistence<Tab>(`ct-plus-detail:${id}:tab`, "summary")
  const [mediaFilter, setMediaFilter] = useFilterPersistence<string>(`ct-plus-detail:${id}:media`, "")
  // 기간·검색 필터 (모든 기능 탭 공통). sessionStorage 영속화.
  type DateRange = "all"|"7d"|"30d"
  const [dateRange, setDateRange] = useFilterPersistence<DateRange>(`ct-plus-detail:${id}:dateRange`, "all")
  const [creativeQuery, setCreativeQuery] = useFilterPersistence<string>(`ct-plus-detail:${id}:creativeQuery`, "")
  const [saving, setSaving] = useState(false)
  const [toast,  setToast]  = useState<string|null>(null)
  const [edits, setEdits]   = useState<Map<string,Partial<RawRow>>>(new Map())
  const [editMode, setEditMode] = useState(false)
  const [showThresholds, setShowThresholds] = useState(false)
  const { thresholds, update: updateThresholds } = useKpiThresholds()

  const campaign = useMemo(()=>campaigns.find(c=>c.id===id)??null,[campaigns,id])
  const campRows = useMemo(()=>{
    if(!campaign) return []
    return applyMarkupToRows(rawRows,campaigns).filter(r=>r.matchedCampaignId===campaign.id)
  },[rawRows,campaigns,campaign])
  // 선택된 매체 + 기간 + 소재 검색으로 필터링된 행 — 모든 탭의 기본 데이터셋.
  // 기간: 'all' = 전체, '7d'/'30d' = 최근 N일 (raw 의 최대 date 기준)
  const filteredRows = useMemo(()=>{
    let rs = mediaFilter ? campRows.filter(r=>r.media===mediaFilter) : campRows
    if(dateRange!=="all" && rs.length>0){
      const dates = rs.map(r=>r.date).filter(Boolean).sort()
      const latest = dates[dates.length-1]
      if(latest){
        const days = dateRange==="7d" ? 7 : 30
        const cutoff = new Date(latest)
        cutoff.setDate(cutoff.getDate() - days + 1)
        const cutoffStr = cutoff.toISOString().slice(0,10)
        rs = rs.filter(r => r.date >= cutoffStr)
      }
    }
    if(creativeQuery.trim()){
      const q = creativeQuery.trim().toLowerCase()
      rs = rs.filter(r => (r.creativeName ?? "").toLowerCase().includes(q))
    }
    return rs
  },[campRows,mediaFilter,dateRange,creativeQuery])
  // 캠페인 로딩 후 첫 매체로 초기화
  useEffect(()=>{
    if(!campaign) return
    const firstMedia = campaign.mediaBudgets[0]?.media
    if(firstMedia && !mediaFilter) setMediaFilter(firstMedia)
  },[campaign, mediaFilter])

  // RAW 편집
  const getVal = useCallback(<K extends keyof RawRow>(r:RawRow,key:K):RawRow[K]=>{
    const k=rowKey(r)
    return ((edits.get(k) as Record<string,unknown>)?.[key as string]??r[key]) as RawRow[K]
  },[edits])
  function setField(r:RawRow,key:keyof RawRow,val:unknown){
    const k=rowKey(r)
    setEdits(prev=>{const next=new Map(prev);next.set(k,{...(next.get(k)??{}),[key]:val});return next})
  }
  async function handleSave(){
    if(!campaign||edits.size===0){setEditMode(false);return}
    setSaving(true)
    try{
      const csvNames=campaign.csvNames??[]
      const affected=new Set<string>()
      for(const b of batches){
        for(const row of b.rows){
          if(csvNames.includes(row.campaignName)&&edits.has(rowKey(row))){affected.add(b.id);break}
        }
      }
      for(const bId of affected){
        const b=batches.find(x=>x.id===bId)!
        await updateBatch({...b,rows:b.rows.map(row=>{
          const k=rowKey(row)
          return edits.has(k)?{...row,...edits.get(k)!}:row
        })})
      }
      setEdits(new Map());setEditMode(false)
      setToast("저장되었습니다.");setTimeout(()=>setToast(null),2500)
    }finally{setSaving(false)}
  }

  // 집계
  const totals   = campaign ? getCampaignTotals(campaign) : null
  const progress = campaign ? getCampaignProgress(campaign.startDate, campaign.endDate) : 0
  const totalA   = useMemo(()=>aggRows(filteredRows),[filteredRows])

  // 대시보드 소진 비교 — 모달 / DetailPanel 의 기능을 본 페이지로 이식.
  // 사용자 결정 — '클릭시 모달이 아닌 세부 내역으로 가되 대시보드 금액 비교 등의 기능이 세부 내역에서 확인 가능'.
  const [dashboardInput, setDashboardInput] = useState<string>(
    campaign?.dashboardNetAmount != null ? String(campaign.dashboardNetAmount) : ""
  )
  useEffect(() => {
    setDashboardInput(campaign?.dashboardNetAmount != null ? String(campaign.dashboardNetAmount) : "")
  }, [campaign?.id, campaign?.dashboardNetAmount])

  const rawSpendRate = totals && totals.totalSettingCost>0
    ? +(totalA.spend/totals.totalSettingCost*100).toFixed(1) : 0
  const sc = spendRateStyle(rawSpendRate)

  // KPI 달성률 — 매체별로 분리. 이전엔 매체 평균 목표 vs 캠페인 합계 실적이라
  // 매체 간 차이를 가릴 수 없었음 → 매체별 행으로 재구성.
  type KpiRow = {
    media: string | null   // null = 전체 합계 (Budget/Impression/Click)
    label: string
    target: number | null
    actual: number
    unit: string
    lowerBetter?: boolean
  }
  const kpiRows = useMemo<KpiRow[]>(() => {
    if (!campaign || !totals) return []
    // mediaFilter 가 있으면 해당 매체만, 없으면 전체 매체 + 전체합계 행 노출
    const targetMbs = mediaFilter
      ? campaign.mediaBudgets.filter(mb => mb.media === mediaFilter)
      : campaign.mediaBudgets
    const rows: KpiRow[] = []
    // 전체합계 행 — 매체 미선택 시에만 표시 (선택 시엔 해당 매체 행만 보이는 게 자연스러움)
    if (!mediaFilter) {
      rows.push(
        { media: null, label: 'Budget',     target: totals.totalBudget || null, actual: totalA.spend,        unit: '원' },
        { media: null, label: 'Impression', target: null,                       actual: totalA.impressions,  unit: '' },
        { media: null, label: 'Click',      target: null,                       actual: totalA.clicks,       unit: '' },
      )
    }
    // 매체별 raw 집계 — 대상 매체만
    const aggByMedia = new Map<string, ReturnType<typeof aggRows>>()
    for (const mb of targetMbs) {
      aggByMedia.set(mb.media, aggRows(filteredRows.filter(r => r.media === mb.media)))
    }
    for (const mb of targetMbs) {
      const a = aggByMedia.get(mb.media)
      if (!a) continue
      // Budget target = 부킹 금액(totalBudget) — 마크업 차감 전. 실제 세팅 예산이 아닌 광고주 청구 기준.
      const mt = getMediaTotals(mb)
      if (mt.totalBudget > 0) {
        rows.push({ media: mb.media, label: 'Budget', target: mt.totalBudget, actual: a.spend, unit: '원' })
      }
      // 매체 선택 시 Impression/Click 도 매체 단위로 보강
      if (mediaFilter) {
        rows.push({ media: mb.media, label: 'Impression', target: null, actual: a.impressions, unit: '' })
        rows.push({ media: mb.media, label: 'Click',      target: null, actual: a.clicks,      unit: '' })
      }
      if (mb.ctrTarget != null) rows.push({ media: mb.media, label: 'CTR', target: +mb.ctrTarget.toFixed(3), actual: a.ctr, unit: '%' })
      if (mb.vtrTarget != null) rows.push({ media: mb.media, label: 'VTR', target: +mb.vtrTarget.toFixed(3), actual: a.vtr, unit: '%' })
      if (mb.cpcTarget != null) rows.push({ media: mb.media, label: 'CPC', target: Math.round(mb.cpcTarget), actual: a.cpc, unit: '원', lowerBetter: true })
      if (mb.cpmTarget != null) rows.push({ media: mb.media, label: 'CPM', target: Math.round(mb.cpmTarget), actual: a.cpm, unit: '원', lowerBetter: true })
    }
    return rows
  }, [campaign, totals, totalA, filteredRows, mediaFilter])

  // 요약 행 (선택 매체 내 캠페인별)
  const summaryRows = useMemo(()=>{
    if(!campaign) return []
    const map=new Map<string,RawRow[]>()
    for(const r of filteredRows){
      const key=`${r.media}||${r.campaignName}`
      const arr=map.get(key)??[];arr.push(r);map.set(key,arr)
    }
    return [...map.entries()].map(([key,rows])=>{
      const [media,campName]=key.split("||")
      const mb=campaign.mediaBudgets.find(m=>m.media===media)
      const budget=mb?getMediaTotals(mb).totalSettingCost:0
      const a=aggRows(rows)
      return {media,campName,budget,...a,spendRate:budget>0?+(a.spend/budget*100).toFixed(1):0}
    }).sort((a,b)=>a.media.localeCompare(b.media))
  },[filteredRows,campaign])

  // 소재별
  const creativeRows = useMemo(()=>{
    const map=new Map<string,RawRow[]>()
    for(const r of filteredRows){
      const key=`${r.creativeName}||${r.media}`
      const arr=map.get(key)??[];arr.push(r);map.set(key,arr)
    }
    return [...map.entries()].map(([key,rows])=>{
      const [creative,media]=key.split("||")
      return {creative,media,...aggRows(rows)}
    }).sort((a,b)=>b.spend-a.spend)
  },[filteredRows])

  // 일별
  const dailyData = useMemo(()=>{
    const map=new Map<string,{date:string;impressions:number;clicks:number;views:number;spend:number;netAmount:number}>()
    for(const r of filteredRows){
      if(!r.date)continue
      const cur=map.get(r.date)??{date:r.date,impressions:0,clicks:0,views:0,spend:0,netAmount:0}
      cur.impressions+=r.impressions??0;cur.clicks+=r.clicks??0;cur.views+=r.views??0
      cur.spend+=r.executionAmount??0;cur.netAmount+=r.netAmount??0
      map.set(r.date,cur)
    }
    let cumSpend=0
    return [...map.values()].sort((a,b)=>a.date.localeCompare(b.date)).map(d=>{
      cumSpend+=d.spend
      return {...d,dateLabel:d.date.slice(5),ctr:d.impressions>0?+(d.clicks/d.impressions*100).toFixed(2):0,cumSpend}
    })
  },[filteredRows])

  // 단일 캠페인 매체별 전일/당일 비교 (daily 페이지에서 이동) — 같은 캠페인의 매체 단위 비교
  const availableDates = useMemo(() => {
    const ds = [...new Set(filteredRows.map(r => r.date).filter(Boolean))].sort()
    return ds
  }, [filteredRows])
  const [compareDate, setCompareDate] = useState<string>("")
  // 가용 가장 최근 일자로 자동 세팅
  useEffect(() => {
    if (compareDate) return
    if (availableDates.length === 0) return
    setCompareDate(availableDates[availableDates.length - 1])
  }, [availableDates, compareDate])
  const dailyComparison = useMemo(() => {
    if (!compareDate) return { rows: [] as Array<{ media: string; prev: number; today: number; delta: number; deltaRate: number }>, prevDate: '' }
    const cur = new Date(compareDate); cur.setDate(cur.getDate() - 1)
    const prevDate = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`
    const map = new Map<string, { prev: number; today: number }>()
    for (const r of filteredRows) {
      const m = map.get(r.media) ?? { prev: 0, today: 0 }
      if (r.date === compareDate) m.today += r.netAmount ?? 0
      else if (r.date === prevDate) m.prev += r.netAmount ?? 0
      map.set(r.media, m)
    }
    const rows = [...map.entries()]
      .filter(([, v]) => v.prev > 0 || v.today > 0)
      .map(([media, v]) => {
        const delta = v.today - v.prev
        const deltaRate = v.prev > 0 ? (delta / v.prev) * 100 : (v.today > 0 ? 100 : 0)
        return { media, prev: Math.round(v.prev), today: Math.round(v.today), delta, deltaRate }
      })
      .sort((a, b) => b.today - a.today)
    return { rows, prevDate }
  }, [filteredRows, compareDate])
  function fmtDelta(n: number) {
    const sign = n > 0 ? "+" : ""
    const cls  = n > 0 ? "text-blue-600" : n < 0 ? "text-red-500" : "text-gray-400"
    return { text: `${sign}${fmt(Math.round(n))}`, cls }
  }

  const mediaNames=useMemo(()=>[...new Set(filteredRows.map(r=>r.media))].sort(),[filteredRows])
  const dailyByMedia=useMemo(()=>{
    const map=new Map<string,Record<string,number>>()
    for(const r of filteredRows){
      if(!r.date)continue
      const cur=map.get(r.date)??{}
      cur[r.media]=(cur[r.media]??0)+(r.netAmount??0)
      map.set(r.date,cur)
    }
    return [...map.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([date,vals])=>({date:date.slice(5),...vals}))
  },[filteredRows])

  // 주간
  const weeklyData=useMemo(()=>{
    const map=new Map<string,{week:string;impressions:number;clicks:number;spend:number;netAmount:number}>()
    for(const d of dailyData){
      const dt=new Date(d.date);const day=dt.getDay()
      const diff=dt.getDate()-day+(day===0?-6:1)
      const mon=new Date(dt.setDate(diff))
      const week=`${mon.getFullYear()}-${String(mon.getMonth()+1).padStart(2,"0")}-${String(mon.getDate()).padStart(2,"0")}`
      const cur=map.get(week)??{week,impressions:0,clicks:0,spend:0,netAmount:0}
      cur.impressions+=d.impressions;cur.clicks+=d.clicks;cur.spend+=d.spend;cur.netAmount+=d.netAmount
      map.set(week,cur)
    }
    return [...map.values()].sort((a,b)=>a.week.localeCompare(b.week)).map(w=>({
      ...w,weekLabel:w.week.slice(5),
      ctr:w.impressions>0?+(w.clicks/w.impressions*100).toFixed(2):0,
    }))
  },[dailyData])

  if(!campaign||!totals){
    return(<div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center"><p className="text-sm text-gray-500">캠페인을 찾을 수 없습니다.</p>
        <button onClick={()=>router.back()} className="mt-3 text-xs text-blue-600 hover:underline">돌아가기</button>
      </div></div>)
  }

  const opName=operators.find(o=>o.id===campaign.managerId)?.name??"-"
  const agN=agencies.find(a=>a.id===campaign.agencyId)?.name??"-"
  const advN=advertisers.find(a=>a.id===campaign.advertiserId)?.name??"-"

  const TABS:{key:Tab;label:string}[]=[
    {key:"summary",label:"요약"},
    {key:"daily",label:"일별"},
    {key:"weekly",label:"주간"},
    {key:"creative",label:"소재"},
    {key:"raw",label:"RAW 편집"},
  ]
  // 1차 매체 탭 — campaign.mediaBudgets 의 매체 목록
  const MEDIA_TABS = campaign.mediaBudgets.map(mb=>mb.media)

  const thCls="px-3 py-2 text-left text-[11px] font-semibold text-gray-500 whitespace-nowrap"
  const thRCls="px-3 py-2 text-right text-[11px] font-semibold text-gray-500 whitespace-nowrap"
  const tdCls="px-3 py-2 text-xs text-gray-600 whitespace-nowrap"
  const tdRCls="px-3 py-2 text-xs text-right tabular-nums whitespace-nowrap"

  return(
    <div className="min-h-screen bg-gray-50">
      {toast&&(<div className="fixed top-4 right-4 bg-green-500 text-white text-sm px-4 py-2 rounded-lg shadow z-50">{toast}</div>)}
      {/* 헤더 */}
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-start gap-3">
          <button onClick={()=>router.push("/campaign/ct-plus/status")}
            className="mt-0.5 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition-colors flex-shrink-0">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              {campaign.campaignType&&(<span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-purple-100 text-purple-700">{campaign.campaignType}</span>)}
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${campaign.status==="집행 중"?"bg-blue-100 text-blue-700":"bg-gray-100 text-gray-500"}`}>{campaign.status}</span>
              <span className="text-[10px] text-gray-400">{campaign.startDate.slice(2)} ~ {campaign.endDate.slice(2)}</span>
            </div>
            <h1 className="text-base font-semibold text-gray-900">{campaign.campaignName}</h1>
            <p className="text-xs text-gray-500 mt-0.5">{advN} · {agN} · 담당: {opName}</p>
          </div>
          <div className="flex-shrink-0 text-right">
            <div className={`text-sm font-bold ${sc.text}`}>{rawSpendRate}%</div>
            <div className="text-[10px] text-gray-400">소진율</div>
            <div className="text-[10px] text-blue-500 mt-0.5">진행률 {progress}%</div>
          </div>
        </div>
      </header>

      {/* KPI 스트립 */}
      <div className="bg-white border-b border-gray-100 px-6 py-3">
        <div className="flex gap-6 overflow-x-auto">
          {[
            {label:"세팅금액",v:fmtAbbr(totals.totalSettingCost)+"원",c:""},
            {label:"집행금액",v:fmtAbbr(totalA.spend)+"원",c:"text-blue-600"},
            {label:"노출",v:fmt(totalA.impressions),c:""},
            {label:"조회",v:fmt(totalA.views),c:""},
            {label:"클릭",v:fmt(totalA.clicks),c:""},
            {label:"CTR",v:`${totalA.ctr}%`,c:totalA.ctr>1?"text-green-600":""},
            {label:"VTR",v:`${totalA.vtr}%`,c:""},
            {label:"CPM",v:`${fmt(totalA.cpm)}원`,c:""},
            {label:"CPC",v:`${fmt(totalA.cpc)}원`,c:""},
            {label:"CPV",v:totalA.cpv>0?`${fmt(totalA.cpv)}원`:"-",c:""},
          ].map(({label,v,c})=>(
            <div key={label} className="flex-shrink-0 text-center">
              <div className="text-[10px] text-gray-400">{label}</div>
              <div className={`text-xs font-semibold mt-0.5 ${c||"text-gray-800"}`}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <main className="p-4 max-w-6xl mx-auto space-y-3">
        {/* 1차 — 매체 탭 */}
        {MEDIA_TABS.length>0 && (
          <FilterBar label="매체">
            <FilterChipGroup<string>
              variant="separate"
              options={MEDIA_TABS.map(m => ({ value: m, label: m, color: mColor(m) }))}
              value={mediaFilter}
              onChange={setMediaFilter}
            />
          </FilterBar>
        )}

        {/* 2차 — 기능 탭 */}
        <div className="flex gap-0.5 border-b border-gray-200 bg-white rounded-t-xl px-2">
          {TABS.map(t=>(
            <button key={t.key} onClick={()=>setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${tab===t.key?"border-blue-500 text-blue-600":"border-transparent text-gray-500 hover:text-gray-700"}`}
            >{t.label}</button>
          ))}
        </div>

        {/* 필터 바 — 기능 탭별로 표시 항목 다름 */}
        <FilterBar label="필터">
          <FilterChipGroup<DateRange>
            label="기간"
            options={[
              { value: "all", label: "전체" },
              { value: "7d",  label: "최근 7일" },
              { value: "30d", label: "최근 30일" },
            ]}
            value={dateRange}
            onChange={setDateRange}
          />
          {(tab==="creative" || tab==="raw") && (
            <FilterSearch
              value={creativeQuery}
              onChange={setCreativeQuery}
              placeholder="소재명 검색"
            />
          )}
          <FilterReset
            visible={dateRange !== "all" || creativeQuery !== ""}
            onClick={() => { setDateRange("all"); setCreativeQuery("") }}
          />
        </FilterBar>

        {filteredRows.length===0&&tab!=="raw"?(
          <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
            <p className="text-sm text-gray-400">연결된 실적 데이터가 없습니다.</p>
            <p className="text-xs text-gray-300 mt-1">데이터 업로드에서 CSV를 업로드하면 자동 연결됩니다.</p>
          </div>
        ):(<>

          {/* ===== 요약 탭 ===== */}
          {tab==="summary"&&(
            <div className="space-y-3">
              {/* 대시보드 소진 비교 — 모달 기능을 본 페이지로 이식 (사용자 요청) */}
              {(() => {
                const settingCost = totals.totalSettingCost
                const rawSpend = totalA.spend
                const dashAmt = parseFloat(dashboardInput) || 0
                const rawRate = settingCost > 0 ? +(rawSpend / settingCost * 100).toFixed(1) : 0
                const dashRate = settingCost > 0 ? +(dashAmt / settingCost * 100).toFixed(1) : 0
                const diff = +(dashRate - rawRate).toFixed(1)
                const rsStyle = spendRateStyle(rawRate)
                const dsStyle = spendRateStyle(dashRate)
                return (
                  <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                    <div className="px-4 py-2.5 bg-emerald-50 border-b border-emerald-100">
                      <h3 className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide">대시보드 소진 비교</h3>
                      <p className="text-[10px] text-gray-500 mt-0.5">광고주 대시보드 직접 입력 금액 vs raw 데이터 기반 소진 — 차이가 크면 검증 필요</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4">
                      <div className="rounded-lg border border-gray-200 p-3">
                        <p className="text-[10px] text-gray-500 uppercase">세팅금액</p>
                        <p className="mt-1 text-sm font-bold tabular-nums text-gray-900">₩{fmt(settingCost)}</p>
                      </div>
                      <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3">
                        <p className="text-[10px] text-blue-700 uppercase">raw 소진 (CSV)</p>
                        <p className="mt-1 text-sm font-bold tabular-nums text-blue-700">₩{fmt(rawSpend)}</p>
                        <p className={`text-[10px] mt-0.5 ${rsStyle.text}`}>{rawRate}%</p>
                      </div>
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
                        <p className="text-[10px] text-emerald-700 uppercase">대시보드 입력</p>
                        <div className="mt-1 flex items-center gap-1">
                          <span className="text-sm font-bold text-emerald-700">₩</span>
                          <input
                            type="number" min="0"
                            value={dashboardInput}
                            onChange={e => {
                              const v = e.target.value
                              setDashboardInput(v)
                              const num = parseFloat(v)
                              if (campaign) {
                                upsertCampaign({
                                  ...campaign,
                                  dashboardNetAmount: Number.isFinite(num) && num > 0 ? num : undefined,
                                })
                              }
                            }}
                            placeholder="0"
                            className="flex-1 min-w-0 rounded border border-emerald-200 px-2 py-0.5 text-sm font-bold tabular-nums text-emerald-700 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                          />
                        </div>
                        <p className={`text-[10px] mt-0.5 ${dsStyle.text}`}>{dashRate}%</p>
                      </div>
                    </div>
                    {dashAmt > 0 && Math.abs(diff) >= 5 && (
                      <div className={`mx-4 mb-4 rounded-lg px-3 py-2 text-xs ${
                        diff > 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}>
                        <span className="font-semibold">{diff > 0 ? '대시보드 입력이 raw 보다 큼' : 'raw 가 대시보드 입력보다 큼'}</span>
                        <span className="ml-2 opacity-80">차이 {Math.abs(diff).toFixed(1)}%p · ₩{fmt(Math.abs(dashAmt - rawSpend))}</span>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* KPI 달성률 */}
              {showThresholds && (
                <KpiThresholdSettings thresholds={thresholds} onChange={updateThresholds} />
              )}
              {kpiRows.length>0&&(
                <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                  <div className="px-4 py-2.5 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
                    <h3 className="text-[11px] font-semibold text-blue-700 uppercase tracking-wide">KPI 목표 대비 실적 달성률</h3>
                    <button
                      type="button"
                      onClick={() => setShowThresholds(v => !v)}
                      className={`text-[10px] font-medium rounded px-2 py-0.5 transition-colors ${
                        showThresholds ? 'bg-blue-600 text-white' : 'text-blue-600 hover:bg-blue-100'
                      }`}
                    >경고 임계값 {showThresholds ? '닫기' : '설정'}</button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 border-b border-gray-100"><tr>
                        <th className={thCls}>매체</th>
                        <th className={thCls}>구분</th>
                        <th className={thRCls}>목표</th>
                        <th className={thRCls}>실적</th>
                        <th className={thRCls}>달성률</th>
                        <th className={thRCls}>효율 차이</th>
                        <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-500 w-40">달성률 현황</th>
                      </tr></thead>
                      <tbody className="divide-y divide-gray-50">
                        {kpiRows.map((r,i)=>{
                          const hasTarget=r.target!==null&&r.target!==0
                          const rate=hasTarget?(r.lowerBetter
                            ?+(r.target!/r.actual*100).toFixed(1)
                            :+(r.actual/r.target!*100).toFixed(1)):null
                          const good=rate!==null&&rate>=100
                          const barW=rate!==null?Math.min(rate,100):0
                          // 효율 차이 — 단위와 lowerBetter 에 따라 분기
                          //   %  지표(CTR/VTR): %p 차이
                          //   원 지표(CPC/CPM/Budget): 금액 차이 + 절감/초과/잔여 라벨
                          let diffLabel: string | null = null
                          if (hasTarget) {
                            if (r.unit === "%") {
                              const dp = +(r.actual - r.target!).toFixed(2)
                              diffLabel = `${dp>=0?"+":""}${dp.toFixed(2)}%p`
                            } else if (r.unit === "원") {
                              if (r.lowerBetter) {
                                // CPC/CPM: 적게 쓸수록 좋음
                                const saved = Math.round(r.target! - r.actual)
                                diffLabel = saved >= 0
                                  ? `₩${fmt(saved)} 절감`
                                  : `₩${fmt(Math.abs(saved))} 초과`
                              } else {
                                // Budget: 소진 관점 — 100% 달성 이상부터는 초과 소진
                                const diff = Math.round(r.actual - r.target!)
                                diffLabel = diff >= 0
                                  ? `₩${fmt(diff)} 초과`
                                  : `₩${fmt(Math.abs(diff))} 잔여`
                              }
                            } else {
                              const diff = Math.round(r.actual - r.target!)
                              diffLabel = `${diff>=0?"+":""}${fmt(diff)}`
                            }
                          }
                          // 사용자 임계값 기반 경고 판정
                          let warn: KpiWarning | null = null
                          if (r.label === 'Budget' && hasTarget) {
                            const sr = +(r.actual / r.target! * 100).toFixed(1)
                            // 진행률 — Budget(전체합계 행) 은 캠페인 progress, 매체별 행은 같은 progress (전체 동일)
                            warn = checkBudgetWarning(sr, progress, thresholds)
                          } else if (r.label === 'CTR' || r.label === 'VTR') {
                            if (hasTarget) warn = checkRateWarning(r.label, r.target!, r.actual, thresholds)
                          } else if (r.label === 'CPC' || r.label === 'CPM') {
                            if (hasTarget) warn = checkCostWarning(r.label, r.target!, r.actual, thresholds)
                          }
                          const rowBg = warn ? 'bg-red-50/40 hover:bg-red-50' : 'hover:bg-gray-50'
                          return(
                            <tr key={i} className={rowBg}>
                              <td className={tdCls} style={r.media ? { borderLeft: `3px solid ${mColor(r.media)}` } : undefined}>
                                {r.media
                                  ? <span className="font-medium" style={{ color: mColor(r.media) }}>{r.media}</span>
                                  : <span className="text-gray-400">전체</span>}
                              </td>
                              <td className={`${tdCls} font-semibold text-gray-800 w-24`}>
                                {r.label}
                                {warn && <span className="ml-1 text-[9px] font-semibold text-red-600" title={warn.message}>⚠</span>}
                              </td>
                              <td className={tdRCls}>{hasTarget?`${fmt(Math.round(r.target!))}${r.unit}`:"-"}</td>
                              <td className={`${tdRCls} font-medium text-blue-700`}>{fmt(Math.round(r.actual))}{r.unit}</td>
                              <td className={`${tdRCls} font-bold ${good?"text-green-600":"text-orange-500"}`}>
                                {rate!==null?`${rate}%`:"-"}
                              </td>
                              <td className={`${tdRCls} font-semibold ${warn ? 'text-red-600' : good?"text-green-600":"text-orange-500"}`}>
                                {warn ? warn.message : (diffLabel ?? "-")}
                              </td>
                              <td className="px-3 py-2">
                                {rate!==null&&(
                                  <div className="h-2 w-full rounded-full bg-gray-100">
                                    <div className={`h-full rounded-full transition-all ${good?"bg-green-400":"bg-orange-400"}`} style={{width:`${barW}%`}}/>
                                  </div>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {/* 매체×캠페인 집계 테이블 */}
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                  <h3 className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">매체 × 캠페인별 집계</h3>
                </div>
                <div className="overflow-x-auto"><table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-100"><tr>
                    <th className={thCls}>매체</th><th className={thCls}>캠페인</th>
                    <th className={thRCls}>세팅금액</th><th className={thRCls}>집행금액</th><th className={thRCls}>소진율</th>
                    <th className={thRCls}>노출</th><th className={thRCls}>조회</th><th className={thRCls}>클릭</th>
                    <th className={thRCls}>VTR</th><th className={thRCls}>CTR</th><th className={thRCls}>CPM</th><th className={thRCls}>CPC</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {summaryRows.map((r,i)=>{
                      const sc2=spendRateStyle(r.spendRate)
                      return(
                        <tr key={i} className="hover:bg-gray-50">
                          <td className={`${tdCls} font-medium`} style={{ borderLeft: `3px solid ${mColor(r.media)}`, color: mColor(r.media) }}>{r.media}</td>
                          <td className={`${tdCls} max-w-[180px] truncate`} title={r.campName}>{r.campName}</td>
                          <td className={tdRCls}>{fmtAbbr(r.budget)}</td>
                          <td className={`${tdRCls} font-medium text-blue-700`}>{fmtAbbr(r.spend)}</td>
                          <td className={`${tdRCls} font-semibold ${sc2.text}`}>{r.spendRate}%</td>
                          <td className={tdRCls}>{fmt(r.impressions)}</td><td className={tdRCls}>{fmt(r.views)}</td><td className={tdRCls}>{fmt(r.clicks)}</td>
                          <td className={tdRCls}>{r.vtr}%</td><td className={`${tdRCls} text-purple-600 font-medium`}>{r.ctr}%</td>
                          <td className={tdRCls}>{fmt(r.cpm)}</td><td className={tdRCls}>{fmt(r.cpc)}</td>
                        </tr>
                      )
                    })}
                    {summaryRows.length>1&&(()=>{
                      return(<tr className="bg-blue-50 font-semibold">
                        <td className={tdCls} colSpan={2}>합계</td>
                        <td className={tdRCls}>{fmtAbbr(totals.totalSettingCost)}</td>
                        <td className={`${tdRCls} text-blue-700`}>{fmtAbbr(totalA.spend)}</td>
                        <td className={`${tdRCls} ${sc.text}`}>{rawSpendRate}%</td>
                        <td className={tdRCls}>{fmt(totalA.impressions)}</td><td className={tdRCls}>{fmt(totalA.views)}</td><td className={tdRCls}>{fmt(totalA.clicks)}</td>
                        <td className={tdRCls}>{totalA.vtr}%</td><td className={`${tdRCls} text-purple-600`}>{totalA.ctr}%</td>
                        <td className={tdRCls}>{fmt(totalA.cpm)}</td><td className={tdRCls}>{fmt(totalA.cpc)}</td>
                      </tr>)
                    })()}
                  </tbody>
                </table></div>
              </div>
            </div>
          )}

          {/* ===== 일별 탭 ===== */}
          {tab==="daily"&&(
            <div className="space-y-3">
              {/* 전일/당일 비교 (daily 페이지에서 이동) — 이 캠페인의 매체 단위 */}
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div>
                    <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">전일 / 당일 비교</h3>
                    <p className="text-[11px] text-gray-400 mt-0.5">이 캠페인의 매체별 순금액 변화</p>
                  </div>
                  <input
                    type="date"
                    value={compareDate}
                    min={availableDates[0] || undefined}
                    max={availableDates[availableDates.length - 1] || undefined}
                    onChange={e => setCompareDate(e.target.value)}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                {dailyComparison.rows.length === 0 ? (
                  <p className="text-xs text-gray-400 py-4 text-center">
                    {compareDate ? '선택한 날짜에 데이터가 없습니다' : '날짜를 선택하세요'}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">매체</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-500">
                            전일 <span className="text-gray-300">({dailyComparison.prevDate.slice(5)})</span>
                          </th>
                          <th className="px-3 py-2 text-right font-medium text-gray-500">
                            당일 <span className="text-gray-300">({compareDate.slice(5)})</span>
                          </th>
                          <th className="px-3 py-2 text-right font-medium text-gray-500">증감액</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-500">증감율</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {dailyComparison.rows.map(row => {
                          const d = fmtDelta(row.delta)
                          const r = fmtDelta(row.deltaRate)
                          return (
                            <tr key={row.media} className="hover:bg-gray-50">
                              <td className="px-3 py-2.5 font-medium" style={{ borderLeft: `3px solid ${mColor(row.media)}`, color: mColor(row.media) }}>{row.media}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">
                                {row.prev > 0 ? fmt(row.prev) : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums font-medium text-blue-700">
                                {row.today > 0 ? fmt(row.today) : <span className="text-gray-300">—</span>}
                              </td>
                              <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${d.cls}`}>{d.text}</td>
                              <td className={`px-3 py-2.5 text-right tabular-nums ${r.cls}`}>
                                {row.prev > 0 || row.today > 0 ? `${r.text}%` : <span className="text-gray-300">—</span>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                        <tr>
                          <td className="px-3 py-2.5 font-semibold text-gray-900">합계</td>
                          <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-gray-700">
                            {fmt(dailyComparison.rows.reduce((s, r) => s + r.prev, 0))}
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-blue-700">
                            {fmt(dailyComparison.rows.reduce((s, r) => s + r.today, 0))}
                          </td>
                          {(() => {
                            const totalDelta = dailyComparison.rows.reduce((s, r) => s + r.delta, 0)
                            const d = fmtDelta(totalDelta)
                            return (<td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${d.cls}`}>{d.text}</td>)
                          })()}
                          <td className="px-3 py-2.5 text-right text-gray-400">—</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>

              {/* 매체별 순금액 LineChart */}
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">일별 순금액 추이 (매체별)</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={dailyByMedia} margin={{top:4,right:8,left:0,bottom:4}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                    <XAxis dataKey="date" tick={{fontSize:9,fill:"#9ca3af"}}/>
                    <YAxis tickFormatter={fmtAbbr} tick={{fontSize:9,fill:"#9ca3af"}} width={44}/>
                    <Tooltip formatter={(v:unknown)=>[fmt(v as number)+"원",""]} contentStyle={{fontSize:10,borderRadius:6}}/>
                    <Legend iconType="circle" iconSize={7} wrapperStyle={{fontSize:10}}/>
                    {mediaNames.map(m=>(<Line key={m} type="monotone" dataKey={m} name={m} stroke={mColor(m)} strokeWidth={2} dot={dailyByMedia.length<=31} connectNulls/>))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {/* 누적 집행금액 */}
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">누적 집행금액 vs 세팅금액</h3>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={dailyData} margin={{top:4,right:8,left:0,bottom:4}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                    <XAxis dataKey="dateLabel" tick={{fontSize:9,fill:"#9ca3af"}}/>
                    <YAxis tickFormatter={fmtAbbr} tick={{fontSize:9,fill:"#9ca3af"}} width={44}/>
                    <Tooltip formatter={(v:unknown)=>[fmt(v as number)+"원",""]} contentStyle={{fontSize:10,borderRadius:6}}/>
                    <Legend iconType="circle" iconSize={7} wrapperStyle={{fontSize:10}}/>
                    <Line type="monotone" dataKey="cumSpend" name="누적 집행금액" stroke="#3b82f6" strokeWidth={2} dot={false}/>
                    {totals.totalSettingCost>0&&(
                      <Line type="monotone" dataKey={()=>totals.totalSettingCost} name="세팅금액" stroke="#e5e7eb" strokeWidth={1} strokeDasharray="4 4" dot={false}/>
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {/* 일별 CTR */}
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">일별 CTR (%)</h3>
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={dailyData} margin={{top:4,right:8,left:0,bottom:4}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                    <XAxis dataKey="dateLabel" tick={{fontSize:9,fill:"#9ca3af"}}/>
                    <YAxis tickFormatter={(v:number)=>`${v}%`} tick={{fontSize:9,fill:"#9ca3af"}} width={36}/>
                    <Tooltip formatter={(v:unknown)=>[`${v}%`,"CTR"]} contentStyle={{fontSize:10,borderRadius:6}}/>
                    <Bar dataKey="ctr" fill="#a78bfa" radius={[2,2,0,0]} name="CTR"/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* 일별 테이블 */}
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50"><h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">일별 상세</h3></div>
                <div className="overflow-x-auto"><table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-100"><tr>
                    <th className={thCls}>날짜</th><th className={thRCls}>노출</th><th className={thRCls}>조회</th><th className={thRCls}>클릭</th>
                    <th className={thRCls}>CTR</th><th className={thRCls}>집행금액</th><th className={thRCls}>누적</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {dailyData.map(d=>(
                      <tr key={d.date} className="hover:bg-gray-50">
                        <td className={`${tdCls} font-mono text-gray-700`}>{d.date}</td>
                        <td className={tdRCls}>{fmt(d.impressions)}</td><td className={tdRCls}>{fmt(d.views)}</td><td className={tdRCls}>{fmt(d.clicks)}</td>
                        <td className={`${tdRCls} text-purple-600 font-medium`}>{d.ctr}%</td>
                        <td className={`${tdRCls} text-blue-700 font-medium`}>{fmtAbbr(d.spend)}</td>
                        <td className={`${tdRCls} text-gray-500`}>{fmtAbbr(d.cumSpend)}</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 font-semibold">
                      <td className={tdCls}>합계</td>
                      <td className={tdRCls}>{fmt(totalA.impressions)}</td><td className={tdRCls}>{fmt(totalA.views)}</td><td className={tdRCls}>{fmt(totalA.clicks)}</td>
                      <td className={`${tdRCls} text-purple-600`}>{totalA.ctr}%</td>
                      <td className={`${tdRCls} text-blue-700`}>{fmtAbbr(totalA.spend)}</td>
                      <td className={tdRCls}>-</td>
                    </tr>
                  </tbody>
                </table></div>
              </div>
            </div>
          )}

          {/* ===== 주간 탭 ===== */}
          {tab==="weekly"&&(
            <div className="space-y-3">
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">주간별 순금액</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={weeklyData} margin={{top:4,right:8,left:0,bottom:4}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                    <XAxis dataKey="weekLabel" tick={{fontSize:10,fill:"#9ca3af"}}/>
                    <YAxis tickFormatter={fmtAbbr} tick={{fontSize:9,fill:"#9ca3af"}} width={44}/>
                    <Tooltip formatter={(v:unknown)=>[fmt(v as number)+"원",""]} contentStyle={{fontSize:10,borderRadius:6}}/>
                    <Bar dataKey="netAmount" fill="#3b82f6" radius={[3,3,0,0]} name="순금액"/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <table className="w-full text-xs"><thead className="bg-gray-50 border-b border-gray-100"><tr>
                  <th className={thCls}>주차</th><th className={thRCls}>노출</th><th className={thRCls}>클릭</th>
                  <th className={thRCls}>CTR</th><th className={thRCls}>집행금액</th><th className={thRCls}>순금액</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {weeklyData.map(w=>(
                    <tr key={w.week} className="hover:bg-gray-50">
                      <td className={`${tdCls} font-medium text-gray-700`}>{w.week}</td>
                      <td className={tdRCls}>{fmt(w.impressions)}</td><td className={tdRCls}>{fmt(w.clicks)}</td>
                      <td className={`${tdRCls} text-purple-600 font-medium`}>{w.ctr}%</td>
                      <td className={`${tdRCls} text-blue-700 font-medium`}>{fmtAbbr(w.spend)}</td>
                      <td className={tdRCls}>{fmtAbbr(w.netAmount)}</td>
                    </tr>
                  ))}
                </tbody></table>
              </div>
            </div>
          )}

          {/* ===== 소재별 탭 ===== */}
          {tab==="creative"&&(
            <div className="space-y-3">
              {/* 소재별 집행금액 BarChart */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">소재별 집행금액</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={creativeRows.slice(0,10)} layout="vertical" margin={{top:4,right:20,left:4,bottom:4}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false}/>
                      <XAxis type="number" tickFormatter={fmtAbbr} tick={{fontSize:9,fill:"#9ca3af"}}/>
                      <YAxis type="category" dataKey="creative" tick={{fontSize:9,fill:"#6b7280"}} width={70}
                        tickFormatter={(v:string)=>v.length>10?v.slice(0,10)+"…":v}/>
                      <Tooltip formatter={(v:unknown)=>[fmt(v as number)+"원","집행금액"]} contentStyle={{fontSize:10,borderRadius:6}}/>
                      <Bar dataKey="spend" radius={[0,3,3,0]} name="집행금액">
                        {creativeRows.slice(0,10).map((_,i)=>(<Cell key={i} fill={CREATIVE_COLORS[i%CREATIVE_COLORS.length]}/>))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">소재별 CTR (%)</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={[...creativeRows].sort((a,b)=>b.ctr-a.ctr).slice(0,10)} layout="vertical" margin={{top:4,right:20,left:4,bottom:4}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false}/>
                      <XAxis type="number" tickFormatter={(v:number)=>`${v}%`} tick={{fontSize:9,fill:"#9ca3af"}}/>
                      <YAxis type="category" dataKey="creative" tick={{fontSize:9,fill:"#6b7280"}} width={70}
                        tickFormatter={(v:string)=>v.length>10?v.slice(0,10)+"…":v}/>
                      <Tooltip formatter={(v:unknown)=>[`${v}%`,"CTR"]} contentStyle={{fontSize:10,borderRadius:6}}/>
                      <Bar dataKey="ctr" fill="#a78bfa" radius={[0,3,3,0]} name="CTR"/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              {/* 소재별 테이블 */}
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100"><h3 className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">소재별 상세</h3></div>
                <div className="overflow-x-auto"><table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-100"><tr>
                    <th className={thCls}>소재</th><th className={thCls}>매체</th>
                    <th className={thRCls}>노출</th><th className={thRCls}>조회</th><th className={thRCls}>클릭</th>
                    <th className={thRCls}>VTR</th><th className={thRCls}>CTR</th><th className={thRCls}>CPM</th><th className={thRCls}>CPC</th>
                    <th className={thRCls}>집행금액</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {creativeRows.map((r,i)=>(
                      <tr key={i} className="hover:bg-gray-50">
                        <td className={`${tdCls} font-medium text-gray-800 max-w-[160px] truncate`} title={r.creative}>{r.creative||"(없음)"}</td>
                        <td className={`${tdCls} font-medium`} style={{ borderLeft: `3px solid ${mColor(r.media)}`, color: mColor(r.media) }}>{r.media}</td>
                        <td className={tdRCls}>{fmt(r.impressions)}</td><td className={tdRCls}>{fmt(r.views)}</td><td className={tdRCls}>{fmt(r.clicks)}</td>
                        <td className={tdRCls}>{r.vtr}%</td><td className={`${tdRCls} text-purple-600 font-medium`}>{r.ctr}%</td>
                        <td className={tdRCls}>{fmt(r.cpm)}</td><td className={tdRCls}>{fmt(r.cpc)}</td>
                        <td className={`${tdRCls} text-blue-700 font-medium`}>{fmtAbbr(r.spend)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </div>
            </div>
          )}

          {/* ===== RAW 편집 탭 ===== */}
          {tab==="raw"&&(
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">{filteredRows.length}행 · 노출/조회/클릭/집행금액 직접 수정 가능</p>
                <div className="flex gap-2">
                  {editMode?(
                    <>
                      <button onClick={()=>{setEdits(new Map());setEditMode(false)}}
                        className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
                        취소
                      </button>
                      <button onClick={handleSave} disabled={saving}
                        className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60">
                        {saving?"저장 중...":`저장 (${edits.size}건 수정)`}
                      </button>
                    </>
                  ):(
                    <button onClick={()=>setEditMode(true)}
                      className="rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100">
                      편집 모드
                    </button>
                  )}
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b border-gray-100 sticky top-0"><tr>
                      <th className={thCls}>날짜</th><th className={thCls}>매체</th>
                      <th className={thCls}>캠페인명</th><th className={thCls}>소재</th>
                      <th className={thRCls}>노출</th><th className={thRCls}>조회</th>
                      <th className={thRCls}>클릭</th><th className={thRCls}>집행금액</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-50">
                      {filteredRows.map((r,i)=>{
                        const changed=edits.has(rowKey(r))
                        return(
                          <tr key={i} className={changed?"bg-yellow-50":"hover:bg-gray-50"}>
                            <td className={`${tdCls} font-mono text-gray-600`}>{r.date}</td>
                            <td className={`${tdCls} font-medium`} style={{ borderLeft: `3px solid ${mColor(r.media)}`, color: mColor(r.media) }}>{r.media}</td>
                            <td className={`${tdCls} max-w-[140px] truncate`} title={r.campaignName}>{r.campaignName}</td>
                            <td className={`${tdCls} max-w-[100px] truncate`} title={r.creativeName}>{r.creativeName}</td>
                            {(["impressions","views","clicks"] as const).map(key=>(
                              <td key={key} className="px-1 py-1">
                                {editMode?(
                                  <input type="number" min="0" value={String(getVal(r,key)??"")}
                                    onChange={e=>setField(r,key,parseInt(e.target.value)||0)}
                                    className="w-20 rounded border border-gray-300 px-1.5 py-0.5 text-xs text-right tabular-nums focus:border-blue-400 focus:outline-none"/>
                                ):(
                                  <span className={`block text-right tabular-nums ${changed?"text-yellow-700 font-medium":"text-gray-600"}`}>{fmt(Number(getVal(r,key)??0))}</span>
                                )}
                              </td>
                            ))}
                            <td className="px-1 py-1">
                              {editMode?(
                                <input type="number" min="0" step="0.01" value={String(getVal(r,"executionAmount")??"")}
                                  onChange={e=>setField(r,"executionAmount",parseFloat(e.target.value)||0)}
                                  className="w-24 rounded border border-gray-300 px-1.5 py-0.5 text-xs text-right tabular-nums focus:border-blue-400 focus:outline-none"/>
                              ):(
                                <span className={`block text-right tabular-nums ${changed?"text-yellow-700 font-medium":"text-blue-700"}`}>{fmtAbbr(Number(getVal(r,"executionAmount")??0))}</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>)}
      </main>
    </div>
  )
}
