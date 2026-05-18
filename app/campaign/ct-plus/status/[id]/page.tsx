"use client"
import React, { useMemo, useState, useCallback, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
// daily/weekly 그래프 제거 (사용자 요청) — 소재 탭만 BarChart 사용.
import {
  BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from "recharts"
import { useMasterData } from "@/lib/hooks/useMasterData"
import { useRawData } from "@/lib/hooks/useRawData"
import { applyMarkupToRows } from "@/lib/markupService"
import { getCampaignTotals, getCampaignProgress, getMediaTotals, getCampaignDashboardNetAmount, getMediaDashboardNetAmount, type Campaign, type SubCampaign } from "@/lib/campaignTypes"
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

// 광고 플랫폼 narrative 섹션 헤더 — 단계 번호 + 제목 + 짧은 안내.
function SectionLabel({ step, title, hint }: { step: string; title: string; hint?: string }) {
  return (
    <div className="flex items-baseline gap-2 px-1">
      <span className="text-[10px] font-bold text-gray-300 tabular-nums tracking-widest">{step}</span>
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      {hint && <span className="text-[10px] text-gray-400 ml-1 truncate">{hint}</span>}
    </div>
  )
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
  // 세부 캠페인 필터 — subCampaign.id 저장. mediaFilter 변경 시 reset.
  // 모든 탭(요약/일별/주간/소재/RAW)에 반영 — filteredRows 단계에서 적용.
  const [subCampaignFilter, setSubCampaignFilter] = useFilterPersistence<string>(`ct-plus-detail:${id}:subCampaign`, "")
  // 사용자 결정 — 요약 탭의 기간 필터(전체/최근7일/최근30일) 폐지.
  // 캠페인 단위 상세에서는 캠페인 startDate~endDate 전체가 의미 있는 범위.
  const [creativeQuery, setCreativeQuery] = useFilterPersistence<string>(`ct-plus-detail:${id}:creativeQuery`, "")
  const [saving, setSaving] = useState(false)
  const [toast,  setToast]  = useState<string|null>(null)
  const [edits, setEdits]   = useState<Map<string,Partial<RawRow>>>(new Map())
  const [editMode, setEditMode] = useState(false)
  const [showThresholds, setShowThresholds] = useState(false)
  const { thresholds, update: updateThresholds } = useKpiThresholds()

  const campaign = useMemo(()=>campaigns.find(c=>c.id===id)??null,[campaigns,id])

  // subCampaign 매핑 — id → { name, csvNamesLower, media }. 모든 탭의 필터/표시에 사용.
  const subCampaignMap = useMemo(() => {
    const m = new Map<string, { name: string; csvNamesLower: string[]; media: string }>()
    if (!campaign) return m
    for (const mb of campaign.mediaBudgets) {
      for (const sc of (mb.subCampaigns ?? [])) {
        m.set(sc.id, {
          name: sc.name,
          csvNamesLower: (sc.csvCampaignNames ?? []).map(n => n.trim().toLowerCase()),
          media: mb.media,
        })
      }
    }
    return m
  }, [campaign])

  const campRows = useMemo(()=>{
    if(!campaign) return []
    return applyMarkupToRows(rawRows,campaigns).filter(r=>r.matchedCampaignId===campaign.id)
  },[rawRows,campaigns,campaign])
  // 선택된 매체 + 소재 검색 + 세부 캠페인으로 필터링된 행 — 모든 탭의 기본 데이터셋.
  const filteredRows = useMemo(()=>{
    let rs = mediaFilter ? campRows.filter(r=>r.media===mediaFilter) : campRows
    if(creativeQuery.trim()){
      const q = creativeQuery.trim().toLowerCase()
      rs = rs.filter(r => (r.creativeName ?? "").toLowerCase().includes(q))
    }
    // 세부 캠페인 필터 — 선택된 subCampaign 의 csvCampaignNames 와 매체가 일치하는 행만
    if (subCampaignFilter) {
      const sc = subCampaignMap.get(subCampaignFilter)
      if (sc) {
        const set = new Set(sc.csvNamesLower)
        rs = rs.filter(r => r.media === sc.media && set.has(r.campaignName.trim().toLowerCase()))
      }
    }
    return rs
  },[campRows,mediaFilter,creativeQuery,subCampaignFilter,subCampaignMap])
  // 캠페인 로딩 후 첫 매체로 초기화
  useEffect(()=>{
    if(!campaign) return
    const firstMedia = campaign.mediaBudgets[0]?.media
    if(firstMedia && !mediaFilter) setMediaFilter(firstMedia)
  },[campaign, mediaFilter])

  // 매체가 바뀌면 세부 캠페인 필터 reset — 매체 불일치 상태 방지.
  useEffect(() => {
    if (!subCampaignFilter) return
    const sc = subCampaignMap.get(subCampaignFilter)
    if (!sc || (mediaFilter && sc.media !== mediaFilter)) setSubCampaignFilter("")
  }, [mediaFilter, subCampaignFilter, subCampaignMap, setSubCampaignFilter])

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

  // 대시보드 입력 = 세부 캠페인 단위에서만 받음 (사용자 결정).
  // 자동 저장(onChange), 합계는 매체/캠페인 단위로 자동 산출.
  // mediaFilter / subCampaignFilter 에 따라 표시되는 합계가 동적으로 좁혀짐.
  const dashAmtAggregate = useMemo(() => {
    if (!campaign) return 0
    if (subCampaignFilter) {
      for (const mb of campaign.mediaBudgets) {
        const sc = mb.subCampaigns?.find(s => s.id === subCampaignFilter)
        if (sc) return sc.dashboardNetAmount ?? 0
      }
      return 0
    }
    if (mediaFilter) {
      const mb = campaign.mediaBudgets.find(m => m.media === mediaFilter)
      return mb ? getMediaDashboardNetAmount(mb) : 0
    }
    return getCampaignDashboardNetAmount(campaign)
  }, [campaign, mediaFilter, subCampaignFilter])

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
    // 사용자 결정 — KPI 목표가 매체 단위에서 세부 캠페인으로 이전됨 (PR #102).
    // 따라서 매체별 KPI 행은 sub-camp 의 budget 가중 평균(CTR/VTR/%) 또는
    // sub-camp 의 합산 예산 가중 평균(CPC/CPM/원) 으로 산출.
    // 세부 캠페인 필터 활성 시에는 해당 sub 한 건만 표시.
    const rows: KpiRow[] = []

    // weighted average over sub-campaigns with target defined.
    // %-단위(CTR/VTR) → budget 가중. 원-단위(CPC/CPM) → budget 가중. budget 없으면 단순 평균.
    function aggregateTarget(subs: SubCampaign[], pick: (s: SubCampaign) => number | null | undefined) {
      let totalW = 0, weighted = 0, count = 0, simple = 0
      for (const sc of subs) {
        const v = pick(sc)
        if (v == null) continue
        const w = sc.budget ?? 0
        if (w > 0) { weighted += v * w; totalW += w }
        simple += v; count += 1
      }
      if (totalW > 0) return weighted / totalW
      if (count > 0) return simple / count
      return null
    }

    const targetMbs = mediaFilter
      ? campaign.mediaBudgets.filter(mb => mb.media === mediaFilter)
      : campaign.mediaBudgets

    if (!mediaFilter && !subCampaignFilter) {
      rows.push(
        { media: null, label: 'Budget',     target: totals.totalBudget || null, actual: totalA.spend,        unit: '원' },
        { media: null, label: 'Impression', target: null,                       actual: totalA.impressions,  unit: '' },
        { media: null, label: 'Click',      target: null,                       actual: totalA.clicks,       unit: '' },
      )
    }

    const aggByMedia = new Map<string, ReturnType<typeof aggRows>>()
    for (const mb of targetMbs) {
      aggByMedia.set(mb.media, aggRows(filteredRows.filter(r => r.media === mb.media)))
    }

    for (const mb of targetMbs) {
      const a = aggByMedia.get(mb.media)
      if (!a) continue
      const subs = (mb.subCampaigns ?? []).filter(
        s => !subCampaignFilter || s.id === subCampaignFilter,
      )
      if (subs.length === 0) continue
      const mt = getMediaTotals(mb)
      const budgetTarget = subs.reduce((s, sc) => s + (sc.budget ?? 0), 0)
      if (budgetTarget > 0) {
        rows.push({ media: mb.media, label: 'Budget', target: budgetTarget, actual: a.spend, unit: '원' })
      } else if (mt.totalBudget > 0) {
        rows.push({ media: mb.media, label: 'Budget', target: mt.totalBudget, actual: a.spend, unit: '원' })
      }
      if (mediaFilter || subCampaignFilter) {
        rows.push({ media: mb.media, label: 'Impression', target: null, actual: a.impressions, unit: '' })
        rows.push({ media: mb.media, label: 'Click',      target: null, actual: a.clicks,      unit: '' })
      }
      const ctr = aggregateTarget(subs, s => s.ctrTarget)
      const vtr = aggregateTarget(subs, s => s.vtrTarget)
      const cpc = aggregateTarget(subs, s => s.cpcTarget)
      const cpm = aggregateTarget(subs, s => s.cpmTarget)
      if (ctr != null) rows.push({ media: mb.media, label: 'CTR', target: +ctr.toFixed(3), actual: a.ctr, unit: '%' })
      if (vtr != null) rows.push({ media: mb.media, label: 'VTR', target: +vtr.toFixed(3), actual: a.vtr, unit: '%' })
      if (cpc != null) rows.push({ media: mb.media, label: 'CPC', target: Math.round(cpc), actual: a.cpc, unit: '원', lowerBetter: true })
      if (cpm != null) rows.push({ media: mb.media, label: 'CPM', target: Math.round(cpm), actual: a.cpm, unit: '원', lowerBetter: true })
    }
    return rows
  }, [campaign, totals, totalA, filteredRows, mediaFilter, subCampaignFilter])

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

  // 세부 설정한 캠페인 (subCampaign) 별 분리 집계
  // 사용자 요청 — '세부 설정한 캠페인도 세부내역에서 분리 확인 가능하게'.
  // 모달에서 mediaBudget.subCampaigns[].csvCampaignNames 로 매핑된 raw row 들을 묶어 집계.
  const subCampaignRows = useMemo(() => {
    if (!campaign) return []
    type Out = {
      media: string
      subId: string
      subName: string
      budget: number
      feeRate?: number
      cpcTarget?: number
      ctrTarget?: number
      vtrTarget?: number
      isVideo?: boolean
      matchedCsvNames: string[]
      rows: RawRow[]
    }
    const out: Out[] = []
    for (const mb of campaign.mediaBudgets) {
      // 매체 필터 적용 — 선택된 매체만 보여줌 (사용자 요청).
      if (mediaFilter && mb.media !== mediaFilter) continue
      for (const sc of (mb.subCampaigns ?? [])) {
        const lowered = new Set(
          (sc.csvCampaignNames ?? []).map(n => n.trim().toLowerCase())
        )
        if (lowered.size === 0) {
          out.push({
            media: mb.media, subId: sc.id, subName: sc.name,
            budget: sc.budget ?? 0,
            feeRate: sc.totalFeeRate, cpcTarget: sc.cpcTarget,
            ctrTarget: sc.ctrTarget, vtrTarget: sc.vtrTarget, isVideo: sc.isVideo,
            matchedCsvNames: [], rows: [],
          })
          continue
        }
        const rows = filteredRows.filter(r =>
          r.media === mb.media && lowered.has(r.campaignName.trim().toLowerCase())
        )
        out.push({
          media: mb.media, subId: sc.id, subName: sc.name,
          budget: sc.budget ?? 0,
          feeRate: sc.totalFeeRate, cpcTarget: sc.cpcTarget,
          ctrTarget: sc.ctrTarget, vtrTarget: sc.vtrTarget, isVideo: sc.isVideo,
          matchedCsvNames: sc.csvCampaignNames ?? [], rows,
        })
      }
    }
    return out
  }, [campaign, filteredRows, mediaFilter])

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

  // mediaNames / dailyByMedia 제거 — 일별 매체 LineChart 가 함께 제거됨.

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

      {/* KPI 스트립 — 사용자 요청 — '눈에 더 띄게 + 매체/세부캠페인 선택 시 그 값으로 갱신'.
          totalA 는 이미 filteredRows 기반(매체/세부/날짜 필터 자동 반영).
          세팅금액은 매체 / 세부캠페인 필터에 따라 동적 계산. */}
      {(() => {
        let settingCost = totals.totalSettingCost
        let label = '세팅금액'
        if (subCampaignFilter) {
          for (const mb of campaign.mediaBudgets) {
            const sc = mb.subCampaigns?.find(s => s.id === subCampaignFilter)
            if (sc) { settingCost = sc.budget ?? 0; label = '세부 예산'; break }
          }
        } else if (mediaFilter) {
          const mb = campaign.mediaBudgets.find(m => m.media === mediaFilter)
          if (mb) { settingCost = getMediaTotals(mb).totalSettingCost; label = `${mediaFilter} 세팅금액` }
        }
        const items: { label: string; v: string; tone: 'primary' | 'accent' | 'good' | 'muted' | 'default' }[] = [
          { label, v: `₩${fmtAbbr(settingCost)}`, tone: 'primary' },
          { label: '집행금액', v: `₩${fmtAbbr(totalA.spend)}`, tone: 'accent' },
          { label: '소진율', v: settingCost > 0 ? `${(totalA.spend/settingCost*100).toFixed(1)}%` : '-', tone: 'muted' },
          { label: '노출', v: fmt(totalA.impressions), tone: 'default' },
          { label: '조회', v: fmt(totalA.views), tone: 'default' },
          { label: '클릭', v: fmt(totalA.clicks), tone: 'default' },
          { label: 'CTR', v: `${totalA.ctr}%`, tone: totalA.ctr > 1 ? 'good' : 'default' },
          { label: 'VTR', v: `${totalA.vtr}%`, tone: 'default' },
          { label: 'CPM', v: `₩${fmt(totalA.cpm)}`, tone: 'muted' },
          { label: 'CPC', v: `₩${fmt(totalA.cpc)}`, tone: 'muted' },
          { label: 'CPV', v: totalA.cpv > 0 ? `₩${fmt(totalA.cpv)}` : '-', tone: 'muted' },
        ]
        const toneClass = (t: typeof items[number]['tone']) => {
          if (t === 'primary') return { box: 'bg-slate-50 border-slate-200', label: 'text-slate-500', value: 'text-slate-900' }
          if (t === 'accent')  return { box: 'bg-blue-50 border-blue-200',   label: 'text-blue-600',  value: 'text-blue-700' }
          if (t === 'good')    return { box: 'bg-emerald-50 border-emerald-200', label: 'text-emerald-600', value: 'text-emerald-700' }
          if (t === 'muted')   return { box: 'bg-gray-50 border-gray-200',   label: 'text-gray-500',  value: 'text-gray-700' }
          return { box: 'bg-white border-gray-200', label: 'text-gray-500', value: 'text-gray-900' }
        }
        return (
          <div className="bg-gradient-to-b from-white to-gray-50/60 border-b border-gray-200 px-6 py-3.5">
            <div className="flex gap-2 overflow-x-auto">
              {items.map(({ label, v, tone }) => {
                const cls = toneClass(tone)
                return (
                  <div
                    key={label}
                    className={`flex-shrink-0 rounded-xl border px-3 py-2 min-w-[88px] ${cls.box} transition-shadow hover:shadow-sm`}
                  >
                    <div className={`text-[10px] font-medium uppercase tracking-wider ${cls.label}`}>{label}</div>
                    <div className={`text-sm font-bold tabular-nums mt-1 ${cls.value}`}>{v}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

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

        {/* 필터 바 — 사용자 결정: 기간 필터 제거. 세부 캠페인 chip + 소재 검색만 유지. */}
        <FilterBar label="필터">
          {(() => {
            if (!campaign) return null
            const opts = campaign.mediaBudgets
              .filter(mb => !mediaFilter || mb.media === mediaFilter)
              .flatMap(mb => (mb.subCampaigns ?? []).map(sc => ({
                value: sc.id,
                label: sc.name,
                color: mColor(mb.media),
              })))
            if (opts.length === 0) return null
            return (
              <FilterChipGroup<string>
                label="세부 캠페인"
                variant="separate"
                options={opts}
                value={subCampaignFilter}
                onChange={setSubCampaignFilter}
              />
            )
          })()}
          {(tab==="creative" || tab==="raw") && (
            <FilterSearch
              value={creativeQuery}
              onChange={setCreativeQuery}
              placeholder="소재명 검색"
            />
          )}
          <FilterReset
            visible={creativeQuery !== "" || subCampaignFilter !== ""}
            onClick={() => { setCreativeQuery(""); setSubCampaignFilter("") }}
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
            <div className="space-y-5">
              {/* ─────────────────────────────────────────────────────────────
                광고 플랫폼 표준 흐름 (사용자 요청 — '광고 플랫폼으로써 가져야
                하는 흐름에 맞게 데이터 위치 조정'):
                  ① 예산 · 페이싱   → 거시 진단: 얼마나 썼고 vs 계획
                  ② 목표 달성도     → 분석 진단: 목표 대비 실적
                  ③ 캠페인 구조     → 드릴다운: 매체 → 캠페인 → 세부 캠페인
                각 단계마다 작은 섹션 헤더로 narrative 명시.
              ────────────────────────────────────────────────────────────────*/}

              {/* ① 예산 · 페이싱 */}
              <SectionLabel step="01" title="예산 · 페이싱" hint="세팅금액 대비 현재 소진 상태 — raw 데이터와 광고주 대시보드 입력 비교" />

              {/* 대시보드 소진 비교 — 세부 캠페인 단위 입력으로 재구성 (사용자 결정).
                  · 상단 3카드: 세팅금액 / raw 소진 / 대시보드 합계 (mediaFilter·subCampaignFilter 반영)
                  · 하단 list: 각 세부 캠페인 행에 입력 — 자동 저장 + 합계 자동 갱신 */}
              {(() => {
                const settingCost = totals.totalSettingCost
                const rawSpend = totalA.spend
                const dashAmt = dashAmtAggregate
                const rawRate = settingCost > 0 ? +(rawSpend / settingCost * 100).toFixed(1) : 0
                const dashRate = settingCost > 0 ? +(dashAmt / settingCost * 100).toFixed(1) : 0
                const diff = +(dashRate - rawRate).toFixed(1)
                const rsStyle = spendRateStyle(rawRate)
                const dsStyle = spendRateStyle(dashRate)
                return (
                  <div className="rounded-2xl bg-gradient-to-br from-emerald-50/80 via-white to-white border border-emerald-100 p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white text-[10px] font-bold">₩</span>
                        <h3 className="text-xs font-semibold text-gray-800">대시보드 소진 비교</h3>
                      </div>
                      <span className="text-[10px] text-gray-400">세부 캠페인별 입력 · 자동 합산</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-xl bg-white border border-slate-200 px-3 py-2.5">
                        <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">세팅금액</p>
                        <p className="mt-1 text-base font-bold tabular-nums text-slate-800 leading-tight">₩{fmt(settingCost)}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">기준 예산</p>
                      </div>
                      <div className="rounded-xl bg-gradient-to-br from-blue-50 to-blue-50/50 border border-blue-200 px-3 py-2.5">
                        <p className="text-[10px] font-medium text-blue-500 uppercase tracking-wider">raw 소진 (CSV)</p>
                        <p className="mt-1 text-base font-bold tabular-nums text-blue-700 leading-tight">₩{fmt(rawSpend)}</p>
                        <div className="mt-0.5 flex items-center gap-1">
                          <span className={`text-[10px] font-semibold ${rsStyle.text}`}>{rawRate}%</span>
                          <div className="flex-1 h-1 rounded-full bg-blue-100 overflow-hidden">
                            <div className={`h-full ${rsStyle.bar}`} style={{ width: `${Math.min(rawRate, 100)}%` }} />
                          </div>
                        </div>
                      </div>
                      <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-50/50 border border-emerald-200 px-3 py-2.5">
                        <p className="text-[10px] font-medium text-emerald-600 uppercase tracking-wider">대시보드 합계</p>
                        <p className="mt-1 text-base font-bold tabular-nums text-emerald-700 leading-tight">₩{fmt(dashAmt)}</p>
                        <div className="mt-0.5 flex items-center gap-1">
                          <span className={`text-[10px] font-semibold ${dsStyle.text}`}>{dashRate}%</span>
                          <div className="flex-1 h-1 rounded-full bg-emerald-100 overflow-hidden">
                            <div className={`h-full ${dsStyle.bar}`} style={{ width: `${Math.min(dashRate, 100)}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>
                    {dashAmt > 0 && Math.abs(diff) >= 5 && (
                      <div className={`mt-3 rounded-lg px-3 py-1.5 text-[11px] flex items-center justify-between ${
                        diff > 0 ? 'bg-emerald-100/60 text-emerald-800' : 'bg-rose-100/60 text-rose-800'
                      }`}>
                        <span className="font-semibold">{diff > 0 ? '↗ 대시보드 > raw' : '↘ raw > 대시보드'}</span>
                        <span className="tabular-nums opacity-80">{Math.abs(diff).toFixed(1)}%p · ₩{fmt(Math.abs(dashAmt - rawSpend))}</span>
                      </div>
                    )}
                    {/* 세부 캠페인별 입력 list — 하위 단에서 입력으로 수정 (사용자 결정). */}
                    <SubDashboardInputs
                      campaign={campaign}
                      mediaFilter={mediaFilter}
                      subCampaignFilter={subCampaignFilter}
                      onUpdate={upsertCampaign}
                    />
                  </div>
                )
              })()}

              {/* ② 목표 달성도 */}
              <SectionLabel step="02" title="목표 달성도" hint="매체별 KPI 목표 대비 실제 실적의 달성률 — 경고 임계값 초과 시 빨강 표시" />

              {/* KPI 달성률 */}
              {showThresholds && (
                <KpiThresholdSettings thresholds={thresholds} onChange={updateThresholds} />
              )}
              {kpiRows.length>0&&(() => {
                // KPI 매체별 그룹핑 — 카드 그리드 형태로 모던 재디자인 (사용자 요청).
                const byMedia = new Map<string, typeof kpiRows>()
                for (const r of kpiRows) {
                  const k = r.media ?? '__total__'
                  const arr = byMedia.get(k) ?? []
                  arr.push(r)
                  byMedia.set(k, arr)
                }
                const groupOrder = [...byMedia.keys()]
                return (
                  <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/40 via-white to-white p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-white text-[10px] font-bold">✓</span>
                        <h3 className="text-xs font-semibold text-gray-800">KPI 목표 대비 실적 달성률</h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowThresholds(v => !v)}
                        className={`text-[10px] font-medium rounded-full px-2.5 py-0.5 transition-colors ${
                          showThresholds ? 'bg-blue-600 text-white' : 'bg-white border border-blue-200 text-blue-600 hover:bg-blue-50'
                        }`}
                      >경고 임계값 {showThresholds ? '닫기' : '설정'}</button>
                    </div>
                    <div className="space-y-3">
                      {groupOrder.map(k => {
                        const rows = byMedia.get(k) ?? []
                        const isTotal = k === '__total__'
                        const mediaColor = isTotal ? '#64748b' : mColor(k)
                        return (
                          <div key={k} className="rounded-xl bg-white border border-gray-100 p-3">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="inline-block w-1 h-4 rounded-full" style={{ backgroundColor: mediaColor }} />
                              <span className="text-[11px] font-semibold" style={{ color: mediaColor }}>
                                {isTotal ? '전체' : k}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                              {rows.map((r, i) => {
                                const hasTarget = r.target !== null && r.target !== 0
                                const rate = hasTarget ? (r.lowerBetter
                                  ? +(r.target!/r.actual*100).toFixed(1)
                                  : +(r.actual/r.target!*100).toFixed(1)) : null
                                const good = rate !== null && rate >= 100
                                const barW = rate !== null ? Math.min(rate, 100) : 0
                                let diffLabel: string | null = null
                                if (hasTarget) {
                                  if (r.unit === "%") {
                                    const dp = +(r.actual - r.target!).toFixed(2)
                                    diffLabel = `${dp>=0?"+":""}${dp.toFixed(2)}%p`
                                  } else if (r.unit === "원") {
                                    if (r.lowerBetter) {
                                      const saved = Math.round(r.target! - r.actual)
                                      diffLabel = saved >= 0 ? `₩${fmt(saved)} 절감` : `₩${fmt(Math.abs(saved))} 초과`
                                    } else {
                                      const diff = Math.round(r.actual - r.target!)
                                      diffLabel = diff >= 0 ? `₩${fmt(diff)} 초과` : `₩${fmt(Math.abs(diff))} 잔여`
                                    }
                                  } else {
                                    const diff = Math.round(r.actual - r.target!)
                                    diffLabel = `${diff>=0?"+":""}${fmt(diff)}`
                                  }
                                }
                                let warn: KpiWarning | null = null
                                if (r.label === 'Budget' && hasTarget) {
                                  const sr = +(r.actual / r.target! * 100).toFixed(1)
                                  warn = checkBudgetWarning(sr, progress, thresholds)
                                } else if ((r.label === 'CTR' || r.label === 'VTR') && hasTarget) {
                                  warn = checkRateWarning(r.label, r.target!, r.actual, thresholds)
                                } else if ((r.label === 'CPC' || r.label === 'CPM') && hasTarget) {
                                  warn = checkCostWarning(r.label, r.target!, r.actual, thresholds)
                                }
                                const tileBg = warn
                                  ? 'bg-red-50 border-red-200'
                                  : good
                                  ? 'bg-emerald-50/40 border-emerald-200'
                                  : 'bg-gray-50 border-gray-200'
                                const rateColor = warn ? 'text-red-600' : good ? 'text-emerald-600' : 'text-orange-500'
                                const barColor = warn ? 'bg-red-400' : good ? 'bg-emerald-400' : 'bg-orange-400'
                                return (
                                  <div key={i} className={`rounded-lg border ${tileBg} p-2 transition-colors`}>
                                    <div className="flex items-center justify-between">
                                      <span className="text-[10px] font-semibold text-gray-700">{r.label}</span>
                                      {warn && <span className="text-[9px] font-bold text-red-600" title={warn.message}>⚠</span>}
                                    </div>
                                    <p className="mt-1 text-sm font-bold tabular-nums text-gray-900 leading-tight">
                                      {fmt(Math.round(r.actual))}<span className="text-[10px] text-gray-400 ml-0.5">{r.unit}</span>
                                    </p>
                                    <p className="text-[10px] text-gray-400 tabular-nums">
                                      목표 {hasTarget ? `${fmt(Math.round(r.target!))}${r.unit}` : '-'}
                                    </p>
                                    <div className="mt-1.5 flex items-center gap-1">
                                      <span className={`text-[10px] font-bold ${rateColor}`}>{rate !== null ? `${rate}%` : '-'}</span>
                                      <div className="flex-1 h-1 rounded-full bg-white/80 overflow-hidden">
                                        <div className={`h-full ${barColor}`} style={{ width: `${barW}%` }} />
                                      </div>
                                    </div>
                                    {diffLabel && (
                                      <p className={`mt-0.5 text-[9px] font-medium tabular-nums ${warn ? 'text-red-500' : good ? 'text-emerald-600' : 'text-orange-500'}`}>
                                        {warn ? warn.message : diffLabel}
                                      </p>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}
              {/* ③ 캠페인 구조 — 매체 → 캠페인 → 세부 캠페인 드릴다운 */}
              <SectionLabel step="03" title="캠페인 구조" hint="매체 단위 집계부터 세부 캠페인 드릴다운까지 — 매체 필터로 좁혀서 조회" />

              {/* 매체×캠페인 집계 테이블 — 드릴다운 1단계 */}
              <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
                <div className="px-4 py-2.5 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100 flex items-center gap-2">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-700 text-white text-[10px] font-bold">∑</span>
                  <h3 className="text-xs font-semibold text-gray-800">매체 × 캠페인별 집계</h3>
                  <span className="ml-auto text-[10px] text-gray-400">Level 1 · 매체 단위</span>
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

              {/* 세부 설정 캠페인 — 드릴다운 2단계. 매체 필터 적용됨 (사용자 요청). */}
              {subCampaignRows.length > 0 && (
                <div className="ml-3 rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50/40 via-white to-white overflow-hidden shadow-sm relative">
                  {/* 좌측 hierarchy 라인 — 부모(매체×캠페인)와 시각적 연결 */}
                  <div className="absolute -left-3 top-0 h-full w-3 flex items-start pt-4">
                    <div className="w-full h-px bg-violet-200" />
                  </div>
                  <div className="px-4 py-2.5 border-b border-violet-100 flex items-center gap-2">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-violet-500 text-white text-[10px] font-bold">↳</span>
                    <div>
                      <h3 className="text-xs font-semibold text-gray-800">세부 설정 캠페인 <span className="text-violet-600">({subCampaignRows.length})</span></h3>
                      <p className="text-[10px] text-gray-400 leading-tight">모달에서 매체 하위로 등록한 세부 캠페인 단위 집계 — CSV 캠페인명 매핑 기반</p>
                    </div>
                    <span className="ml-auto text-[10px] text-violet-500">Level 2 · 드릴다운{mediaFilter ? ` · ${mediaFilter} 필터` : ""}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className={thCls}>매체</th>
                          <th className={thCls}>세부캠페인</th>
                          <th className={thRCls}>예산</th>
                          <th className={thRCls}>순금액</th>
                          <th className={thRCls}>소진율</th>
                          <th className={thRCls}>노출</th>
                          <th className={thRCls}>클릭</th>
                          <th className={thRCls}>CTR</th>
                          <th className={thRCls}>CPC</th>
                          <th className={thRCls}>CPM</th>
                          <th className={thCls}>매핑</th>
                        </tr>
                      </thead>
                      <tbody>
                        {subCampaignRows.map(sc => {
                          const a = aggRows(sc.rows)
                          const rate = sc.budget > 0 ? +(a.netAmount / sc.budget * 100).toFixed(1) : 0
                          const rs = spendRateStyle(rate)
                          const unmapped = sc.matchedCsvNames.length === 0
                          return (
                            <tr key={`${sc.media}|${sc.subId}`} className="border-b border-gray-100 hover:bg-violet-50/30">
                              <td className={tdCls}>
                                <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: mColor(sc.media) + '22', color: mColor(sc.media) }}>{sc.media}</span>
                              </td>
                              <td className={`${tdCls} font-semibold text-gray-800`}>
                                {sc.subName}
                                {sc.isVideo && <span className="ml-1 text-[9px] font-medium text-purple-600">[VIDEO]</span>}
                                {sc.feeRate != null && <span className="ml-1 text-[9px] text-gray-500">수수료 {sc.feeRate}%</span>}
                              </td>
                              <td className={tdRCls}>{sc.budget > 0 ? fmt(sc.budget) : '-'}</td>
                              <td className={`${tdRCls} font-medium text-blue-700`}>{fmt(Math.round(a.netAmount))}</td>
                              <td className={`${tdRCls} font-bold ${rs.text}`}>{sc.budget > 0 ? `${rate}%` : '-'}</td>
                              <td className={tdRCls}>{fmt(a.impressions)}</td>
                              <td className={tdRCls}>{fmt(a.clicks)}</td>
                              <td className={tdRCls}>{a.ctr}%</td>
                              <td className={tdRCls}>{a.cpc > 0 ? fmt(a.cpc) : '-'}</td>
                              <td className={tdRCls}>{a.cpm > 0 ? fmt(a.cpm) : '-'}</td>
                              <td className={`px-3 py-2 text-[10px] ${unmapped ? 'text-orange-600' : 'text-gray-500'} max-w-[200px] truncate`} title={sc.matchedCsvNames.join(', ')}>
                                {unmapped ? '⚠ CSV 매핑 없음' : `${sc.matchedCsvNames.length}개 · ${sc.rows.length}행`}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
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

              {/* 일별 테이블 — 사용자 요청 'daily/weekly 그래프 제거', 표만 유지 */}
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
              {/* 주간 그래프 제거 (사용자 요청) — 표만 유지 */}
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
                      <th className={thCls}>세부캠페인</th>
                      <th className={thCls}>캠페인명</th><th className={thCls}>소재</th>
                      <th className={thRCls}>노출</th><th className={thRCls}>조회</th>
                      <th className={thRCls}>클릭</th><th className={thRCls}>집행금액</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-50">
                      {filteredRows.map((r,i)=>{
                        const changed=edits.has(rowKey(r))
                        // 이 행이 속한 subCampaign 추론 — (media, campaignName) 매칭.
                        // RAW 편집에서도 세부 캠페인 식별 가능하게 (사용자 요청).
                        const subName = (() => {
                          const cn = r.campaignName.trim().toLowerCase()
                          for (const [, sc] of subCampaignMap) {
                            if (sc.media === r.media && sc.csvNamesLower.includes(cn)) return sc.name
                          }
                          return null
                        })()
                        return(
                          <tr key={i} className={changed?"bg-yellow-50":"hover:bg-gray-50"}>
                            <td className={`${tdCls} font-mono text-gray-600`}>{r.date}</td>
                            <td className={`${tdCls} font-medium`} style={{ borderLeft: `3px solid ${mColor(r.media)}`, color: mColor(r.media) }}>{r.media}</td>
                            <td className={`${tdCls} max-w-[120px] truncate`} title={subName ?? "(미매핑)"}>
                              {subName
                                ? <span className="inline-flex items-center rounded-full bg-violet-50 text-violet-700 px-1.5 py-0.5 text-[10px] font-medium border border-violet-100">{subName}</span>
                                : <span className="text-gray-300 text-[10px]">미매핑</span>}
                            </td>
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

// 세부 캠페인별 대시보드 금액 입력 list.
// 사용자 결정 — 입력은 세부 캠페인 단위에서만 가능. onChange 시 자동 저장.
// mediaFilter / subCampaignFilter 적용하여 표시되는 행 좁힘.
function SubDashboardInputs({
  campaign,
  mediaFilter,
  subCampaignFilter,
  onUpdate,
}: {
  campaign: Campaign
  mediaFilter: string
  subCampaignFilter: string
  onUpdate: (c: Campaign) => void
}) {
  // 컨트롤드 input: 로컬 draft 로 빠른 typing 반영 + onChange 시 부모 state 즉시 저장.
  // 부모 campaign 가 다른 source 로 갱신되면 useEffect 로 sync.
  type DraftMap = Record<string, string>
  const initial = React.useMemo<DraftMap>(() => {
    const m: DraftMap = {}
    for (const mb of campaign.mediaBudgets) {
      for (const sc of (mb.subCampaigns ?? [])) {
        m[sc.id] = sc.dashboardNetAmount != null ? String(sc.dashboardNetAmount) : ''
      }
    }
    return m
  }, [campaign])
  const [draft, setDraft] = useState<DraftMap>(initial)
  React.useEffect(() => { setDraft(initial) }, [initial])

  const visibleRows = useMemo(() => {
    const rows: { mb: typeof campaign.mediaBudgets[number]; sc: SubCampaign }[] = []
    for (const mb of campaign.mediaBudgets) {
      if (mediaFilter && mb.media !== mediaFilter) continue
      for (const sc of (mb.subCampaigns ?? [])) {
        if (subCampaignFilter && sc.id !== subCampaignFilter) continue
        rows.push({ mb, sc })
      }
    }
    return rows
  }, [campaign, mediaFilter, subCampaignFilter])

  if (visibleRows.length === 0) {
    return (
      <p className="mt-3 text-[11px] text-gray-400 italic">
        세부 캠페인이 없습니다. 모달에서 매체 하위로 캠페인을 등록하세요.
      </p>
    )
  }

  function handleChange(scId: string, v: string) {
    setDraft(prev => ({ ...prev, [scId]: v }))
    const num = parseFloat(v)
    const nextValue = Number.isFinite(num) && num > 0 ? num : undefined
    const nextCampaign: Campaign = {
      ...campaign,
      mediaBudgets: campaign.mediaBudgets.map(mb => ({
        ...mb,
        subCampaigns: (mb.subCampaigns ?? []).map(sc =>
          sc.id === scId ? { ...sc, dashboardNetAmount: nextValue } : sc,
        ),
      })),
    }
    onUpdate(nextCampaign)
  }

  return (
    <div className="mt-3 rounded-xl border border-emerald-100 bg-white/60">
      <div className="px-3 py-2 border-b border-emerald-100 flex items-center gap-2">
        <span className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider">세부 캠페인별 대시보드 입력</span>
        <span className="text-[10px] text-gray-400">입력 즉시 자동 저장 · 합계 자동 갱신</span>
      </div>
      <ul className="divide-y divide-emerald-50">
        {visibleRows.map(({ mb, sc }) => (
          <li key={sc.id} className="px-3 py-2 flex items-center gap-2">
            <span
              className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium flex-shrink-0"
              style={{ backgroundColor: mColor(mb.media) + '22', color: mColor(mb.media) }}
            >
              {mb.media}
            </span>
            <span className="flex-1 min-w-0 text-xs font-medium text-gray-700 truncate" title={sc.name}>
              {sc.name || <span className="text-gray-300 italic">(이름 없음)</span>}
            </span>
            <span className="text-[10px] text-gray-400 tabular-nums flex-shrink-0">
              예산 ₩{fmt(sc.budget ?? 0)}
            </span>
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <span className="text-xs font-semibold text-emerald-700">₩</span>
              <input
                type="number"
                min="0"
                value={draft[sc.id] ?? ''}
                onChange={e => handleChange(sc.id, e.target.value)}
                placeholder="0"
                className="w-32 rounded border border-emerald-200 bg-white px-2 py-1 text-xs text-right tabular-nums font-semibold text-emerald-700 focus:outline-none focus:ring-1 focus:ring-emerald-400 placeholder:text-emerald-300"
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
