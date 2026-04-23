"use client"
import React, { useState } from "react"
import type { Campaign } from "@/lib/campaignTypes"

// ── 타입 ──────────────────────────────────────────────
export type AnomalyType = "lagging" | "overspend" | "no_data"

export interface CampaignAnomaly {
  campaign: Campaign
  type: AnomalyType
  detail: string
  progress?: number
  spendRate?: number
}

// ── 매체 콘솔 URL ─────────────────────────────────────
type MediaKey = "naver" | "kakao" | "google" | "meta"

const CONSOLE_URLS: Record<MediaKey, string> = {
  naver:  "https://gfa.naver.com",
  kakao:  "https://moment.kakao.com",
  google: "https://ads.google.com",
  meta:   "https://adsmanager.facebook.com",
}
const MEDIA_LABELS: Record<MediaKey, string> = {
  naver: "네이버 GFA", kakao: "카카오모먼트", google: "Google", meta: "META",
}

// ── 이상치 설정 ───────────────────────────────────────
const ANOMALY_CFG: Record<AnomalyType, {
  icon: string; label: string; badge: string; detail: string
}> = {
  lagging:   { icon: "⚠️", label: "속도 지연",  badge: "bg-yellow-100 text-yellow-800 border-yellow-200", detail: "text-yellow-700 bg-yellow-50" },
  overspend: { icon: "🔴", label: "예산 초과",  badge: "bg-red-100 text-red-800 border-red-200",          detail: "text-red-700 bg-red-50" },
  no_data:   { icon: "❓", label: "데이터 없음", badge: "bg-gray-100 text-gray-700 border-gray-200",       detail: "text-gray-600 bg-gray-50" },
}

// ── 컴포넌트 ──────────────────────────────────────────
export function AnomalyBanner({ anomalies }: { anomalies: CampaignAnomaly[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)

  if (anomalies.length === 0) return null

  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50 overflow-hidden">
      {/* 항상 표시되는 알림 헤더: 캠페인명 배지 나열 */}
      <div className="px-4 py-2.5 flex items-start gap-2 flex-wrap">
        <span className="text-sm flex-shrink-0 mt-0.5">🚨</span>
        <span className="text-xs font-bold text-orange-800 flex-shrink-0 mt-0.5">
          이상치 {anomalies.length}건
        </span>
        <div className="flex flex-wrap gap-1.5 flex-1">
          {anomalies.map((a, i) => {
            const cfg = ANOMALY_CFG[a.type]
            const key = `${a.campaign.id}-${a.type}`
            return (
              <button
                key={key}
                onClick={() => setExpanded(expanded === key ? null : key)}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors hover:opacity-80 ${cfg.badge} ${expanded === key ? "ring-2 ring-orange-300" : ""}`}
              >
                {cfg.icon}
                <span className="max-w-[140px] truncate">{a.campaign.campaignName}</span>
                <span className="opacity-60">· {cfg.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 선택된 이상치 상세 */}
      {anomalies.map((a, i) => {
        const key = `${a.campaign.id}-${a.type}`
        if (expanded !== key) return null
        const cfg = ANOMALY_CFG[a.type]
        const medias = a.campaign.mediaBudgets
          .map(mb => mb.media as MediaKey)
          .filter(m => m in CONSOLE_URLS)

        return (
          <div key={key} className="border-t border-orange-200 px-4 py-3 space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span>{cfg.icon}</span>
                <span className="text-sm font-semibold text-orange-900">{a.campaign.campaignName}</span>
                {a.progress !== undefined && a.spendRate !== undefined && (
                  <span className="text-xs text-gray-500">
                    진행률 <strong>{a.progress}%</strong>
                    {" · "}
                    소진율 <strong>{a.spendRate.toFixed(1)}%</strong>
                    {" · "}
                    <span className="text-orange-600 font-semibold">
                      {a.type === "overspend"
                        ? `+${(a.spendRate - 100).toFixed(1)}%p 초과`
                        : `-${(a.progress - a.spendRate).toFixed(1)}%p 지연`}
                    </span>
                  </span>
                )}
              </div>
              {/* 매체 콘솔 바로가기 */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {medias.map(media => (
                  <a
                    key={media}
                    href={CONSOLE_URLS[media]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-white px-2.5 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-50 transition-colors"
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    {MEDIA_LABELS[media]}
                  </a>
                ))}
              </div>
            </div>
            <p className={`text-xs rounded-lg px-3 py-1.5 ${cfg.detail}`}>{a.detail}</p>
          </div>
        )
      })}
    </div>
  )
}
