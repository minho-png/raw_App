"use client"
import React, { useMemo, useState, useCallback } from "react"
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

const MEDIA_COLORS: Record<string, string> = {
  "네이버 GFA": "#03C75A", "카카오모멘트": "#FEE500",
  "Google": "#4285F4", "META": "#1877F2",
}
const CREATIVE_COLORS = ["#3b82f6","#8b5cf6","#10b981","#f59e0b","#ef4444","#06b6d4","#ec4899","#84cc16"]
function mColor(m: string) { return MEDIA_COLORS[m] ?? "#94a3b8" }

function fmtAbbr(n: number): string {
  if (n >= 100_000_000) return `${(n/100_000_000).toFixed(1)}억`
  if (n >= 10_000) return `${(n/10_000).toFixed(0)}만`
  return fmt(n)
}

type Tab = "summary" | "daily" | "weekly" | "creative" | "media" | "raw"

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
  const { campaigns, operators, agencies, advertisers } = useMasterData()
  const { batches, allRows: rawRows, updateBatch } = useRawData()
  const [tab, setTab] = useState<Tab>("summary")
  const [saving, setSaving] = useState(false)
  const [toast,  setToast]  = useState<string|null>(null)
  const [edits, setEdits]   = useState<Map<string,Partial<RawRow>>>(new Map())
  const [editMode, setEditMode] = useState(false)

  const campaign = useMemo(()=>campaigns.find(c=>c.id===id)??null,[campaigns,id])
  const campRows = useMemo(()=>{
    if(!campaign) return []
    return applyMarkupToRows(rawRows,campaigns).filter(r=>r.matchedCampaignId===campaign.id)
  },[rawRows,campaigns,campaign])

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
  const totalA   = useMemo(()=>aggRows(campRows),[campRows])

  const rawSpendRate = totals && totals.totalSettingCost>0
    ? +(totalA.spend/totals.totalSettingCost*100).toFixed(1) : 0
  const sc = spendRateStyle(rawSpendRate)

  // KPI 달성률 (목표 있는 매체만)
  const kpiRows = useMemo(()=>{
    if(!campaign||!totals) return []
    const rows: {label:string;target:number|null;actual:number;unit:string;lowerBetter?:boolean}[] = [
      {label:"Budget",    target:totals.totalBudget||null, actual:totalA.spend, unit:"원"},
      {label:"Impression",target:null,                     actual:totalA.impressions, unit:""},
      {label:"Click",     target:null,                     actual:totalA.clicks, unit:""},
    ]
    // 매체별 KPI 목표 병합
    const ctrTargets = campaign.mediaBudgets.map(mb=>mb.ctrTarget).filter((v):v is number=>v!=null)
    const cpcTargets = campaign.mediaBudgets.map(mb=>mb.cpcTarget).filter((v):v is number=>v!=null)
    const cpmTargets = campaign.mediaBudgets.map(mb=>mb.cpmTarget).filter((v):v is number=>v!=null)
    const vtrTargets = campaign.mediaBudgets.map(mb=>mb.vtrTarget).filter((v):v is number=>v!=null)
    if(ctrTargets.length>0) rows.push({label:"CTR",target:+(ctrTargets.reduce((a,b)=>a+b,0)/ctrTargets.length).toFixed(3),actual:totalA.ctr,unit:"%"})
    if(vtrTargets.length>0) rows.push({label:"VTR",target:+(vtrTargets.reduce((a,b)=>a+b,0)/vtrTargets.length).toFixed(3),actual:totalA.vtr,unit:"%"})
    if(cpcTargets.length>0) rows.push({label:"CPC",target:Math.round(cpcTargets.reduce((a,b)=>a+b,0)/cpcTargets.length),actual:totalA.cpc,unit:"원",lowerBetter:true})
    if(cpmTargets.length>0) rows.push({label:"CPM",target:Math.round(cpmTargets.reduce((a,b)=>a+b,0)/cpmTargets.length),actual:totalA.cpm,unit:"원",lowerBetter:true})
    return rows
  },[campaign,totals,totalA])

  // 요약 행 (매체×칄페인)
  const summaryRows = useMemo(()=>{
    if(!campaign) return []
    const map=new Map<string,RawRow[]>()
    for(const r of campRows){
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
  },[campRows,campaign])

  // 소재별
  const creativeRows = useMemo(()=>{
    const map=new Map<string,RawRow[]>()
    for(const r of campRows){
      const key=`${r.creativeName}||${r.media}`
      const arr=map.get(key)??[];arr.push(r);map.set(key,arr)
    }
    return [...map.entries()].map(([key,rows])=>{
      const [creative,media]=key.split("||")
      return {creative,media,...aggRows(rows)}
    }).sort((a,b)=>b.spend-a.spend)
  },[campRows])

  // 매체별
  const mediaData = useMemo(()=>{
    const map=new Map<string,RawRow[]>()
    for(const r of campRows){const arr=map.get(r.media)??[];arr.push(r);map.set(r.media,arr)}
    return [...map.entries()].map(([media,rows])=>({media,activeDays:new Set(rows.map(r=>r.date)).size,...aggRows(rows)}))
  },[campRows])

  // 일별
  const dailyData = useMemo(()=>{
    const map=new Map<string,{date:string;impressions:number;clicks:number;views:number;spend:number;netAmount:number}>()
    for(const r of campRows){
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
  },[campRows])

  const mediaNames=useMemo(()=>[...new Set(campRows.map(r=>r.media))].sort(),[campRows])
  const dailyByMedia=useMemo(()=>{
    const map=new Map<string,Record<string,number>>()
    for(const r of campRows){
      if(!r.date)continue
      const cur=map.get(r.date)??{}
      cur[r.media]=(cur[r.media]??0)+(r.netAmount??0)
      map.set(r.date,cur)
    }
    return [...map.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([date,vals])=>({date:date.slice(5),...vals}))
  },[campRows])

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
      <div className="text-center"><p className="text-sm text-gray-500">칄페인을 찾을 수 없습니다.</p>
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
    {key:"creative",label:"소재별"},
    {key:"media",label:"매체별"},
    {key:"raw",label:"RAW 편집"},
  ]

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
        <div className="flex gap-0.5 border-b border-gray-200 bg-white rounded-t-xl px-2">
          {TABS.map(t=>(
            <button key={t.key} onClick={()=>setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${tab===t.key?"border-blue-500 text-blue-600":"border-transparent text-gray-500 hover:text-gray-700"}`}
            >{t.label}</button>
          ))}
        </div>

        {campRows.length===0&&tab!=="raw"?(
          <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
            <p className="text-sm text-gray-400">연결된 실적 데이터가 없습니다.</p>
            <p className="text-xs text-gray-300 mt-1">데이터 업로드에서 CSV를 업로드하면 자동 연결됩니다.</p>
          </div>
        ):(<>

          {/* ===== 요약 탭 ===== */}
          {tab==="summary"&&(
            <div className="space-y-3">
              {/* KPI 달성률 */}
              {kpiRows.length>0&&(
                <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                  <div className="px-4 py-2.5 bg-blue-50 border-b border-blue-100">
                    <h3 className="text-[11px] font-semibold text-blue-700 uppercase tracking-wide">KPI 목표 대비 실적 달성률</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 border-b border-gray-100"><tr>
                        <th className={thCls}>구분</th>
                        <th className={thRCls}>목표</th>
                        <th className={thRCls}>실적</th>
                        <th className={thRCls}>달성률</th>
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
                          return(
                            <tr key={i} className="hover:bg-gray-50">
                              <td className={`${tdCls} font-semibold text-gray-800 w-24`}>{r.label}</td>
                              <td className={tdRCls}>{hasTarget?`${fmt(Math.round(r.target!))}${r.unit}`:"-"}</td>
                              <td className={`${tdRCls} font-medium text-blue-700`}>{fmt(Math.round(r.actual))}{r.unit}</td>
                              <td className={`${tdRCls} font-bold ${good?"text-green-600":"text-orange-500"}`}>
                                {rate!==null?`${rate}%`:"-"}
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
              {/* 매체×칄페인 집계 테이블 */}
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                  <h3 className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">매체 × 칄페인별 집계</h3>
                </div>
                <div className="overflow-x-auto"><table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-100"><tr>
                    <th className={thCls}>매체</th><th className={thCls}>칄페인</th>
                    <th className={thRCls}>세팅금액</th><th className={thRCls}>집행금액</th><th className={thRCls}>소진율</th>
                    <th className={thRCls}>노출</th><th className={thRCls}>조회</th><th className={thRCls}>클릭</th>
                    <th className={thRCls}>VTR</th><th className={thRCls}>CTR</th><th className={thRCls}>CPM</th><th className={thRCls}>CPC</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {summaryRows.map((r,i)=>{
                      const sc2=spendRateStyle(r.spendRate)
                      return(
                        <tr key={i} className="hover:bg-gray-50">
                          <td className={`${tdCls} font-medium text-gray-800`}>{r.media}</td>
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
                        <td className={tdCls}>{r.media}</td>
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

          {/* ===== 매체별 탭 ===== */}
          {tab==="media"&&(
            <div className="space-y-3">
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">매체별 집행금액 vs 순금액</h3>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={mediaData} margin={{top:4,right:8,left:0,bottom:4}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                    <XAxis dataKey="media" tick={{fontSize:10,fill:"#9ca3af"}}/>
                    <YAxis tickFormatter={fmtAbbr} tick={{fontSize:9,fill:"#9ca3af"}} width={44}/>
                    <Tooltip formatter={(v:unknown)=>[fmt(v as number)+"원",""]} contentStyle={{fontSize:10,borderRadius:6}}/>
                    <Bar dataKey="spend" name="집행금액" fill="#93c5fd" radius={[3,3,0,0]}/>
                    <Bar dataKey="netAmount" name="순금액" fill="#3b82f6" radius={[3,3,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <table className="w-full text-xs"><thead className="bg-gray-50 border-b border-gray-100"><tr>
                  <th className={thCls}>매체</th><th className={thRCls}>집행일</th>
                  <th className={thRCls}>노출</th><th className={thRCls}>조회</th><th className={thRCls}>클릭</th>
                  <th className={thRCls}>VTR</th><th className={thRCls}>CTR</th><th className={thRCls}>CPM</th><th className={thRCls}>CPC</th>
                  <th className={thRCls}>순금액</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {mediaData.map(m=>(
                    <tr key={m.media} className="hover:bg-gray-50">
                      <td className={`${tdCls} font-medium text-gray-800`}>{m.media}</td>
                      <td className={tdRCls}>{m.activeDays}일</td>
                      <td className={tdRCls}>{fmt(m.impressions)}</td><td className={tdRCls}>{fmt(m.views)}</td><td className={tdRCls}>{fmt(m.clicks)}</td>
                      <td className={tdRCls}>{m.vtr}%</td><td className={`${tdRCls} text-purple-600 font-medium`}>{m.ctr}%</td>
                      <td className={tdRCls}>{fmt(m.cpm)}원</td><td className={tdRCls}>{fmt(m.cpc)}원</td>
                      <td className={`${tdRCls} text-blue-700 font-medium`}>{fmtAbbr(m.netAmount)}</td>
                    </tr>
                  ))}
                </tbody></table>
              </div>
            </div>
          )}

          {/* ===== RAW 편집 탭 ===== */}
          {tab==="raw"&&(
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">{campRows.length}행 · 노출/조회/클릭/집행금액 직접 수정 가능</p>
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
                      <th className={thCls}>칄페인명</th><th className={thCls}>소재</th>
                      <th className={thRCls}>노출</th><th className={thRCls}>조회</th>
                      <th className={thRCls}>클릭</th><th className={thRCls}>집행금액</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-50">
                      {campRows.map((r,i)=>{
                        const changed=edits.has(rowKey(r))
                        return(
                          <tr key={i} className={changed?"bg-yellow-50":"hover:bg-gray-50"}>
                            <td className={`${tdCls} font-mono text-gray-600`}>{r.date}</td>
                            <td className={tdCls}>{r.media}</td>
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
