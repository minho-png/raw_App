"use client"
import React from "react"
import type { Campaign } from "@/lib/campaignTypes"

// ── 타입 ──────────────────────────────────────────────
export type AnomalyType = "lagging" | "overspend" | "no_data"

export interface CampaignAnomaly {
  campaign: Campaign
  type: AnomalyType
  detail: string
  /** 진행률 (lagging 전용) */
  progress?: number
  /** 소진율 (lagging/overspend 전용) */
  spendRate?: number
}

// ── 매체 콘솔 URL ────────────────────────────────────
type MediaKey = "naver" | "kakao" | "google" | "meta"

const CONSOLE_URLS: Record<MediaKey, string> = {
  naver:  "https://gfa.naver.com",
  kakao:  "https://moment.kakao.com",
  google: "https://ads.google.com",
  meta:   "https://adsmanager.facebook.com",
}

const MEDIA_LABELS: Record<MediaKey, string> = {
  naver:  "네이버 GFA",
  kakao:  "카카오모먼트",
  google: "Google",
  meta:   "META",
}

// ── 이상치 표시 설정 ─────────────────────────────────
const ANOMALY_CFG: Record<AnomalyType, {
  icon: string; label: string
  hdr: string; row: string; badge: string; text: string
}> = {
  lagging:  {
    icon: "⚠️", label: "집행 속도 지연",
    hdr:  "bg-yellow-50 border-yellow-200 hover:bg-yellow-100",
    row:  "bg-yellow-50 border-yellow-200 divide-yellow-100",
    badge:"bg-yellow-100 text-yellow-800",
    text: "text-yellow-700 bg-yellow-100",
  },
  overspend: {
    icon: "🔴", label: "예산 초과",
    hdr:  "bg-red-50 border-red-200 hover:bg-red-100",
    row:  "bg-red-50 border-red-200 divide-red-100",
    badge:"bg-red-100 text-red-800",
    text: "text-red-700 bg-red-100",
  },
  no_data: {
    icon: "❓", label: "데이터 없음",
    hdr:  "bg-gray-50 border-gray-200 hover:bg-gray-100",
    row:  "bg-gray-50 border-gray-200 divide-gray-100",
    badge:"bg-gray-100 text-gray-700",
    text: "text-gray-600 bg-gray-100",
  },
}

// ── 컴포넌트 ──────────────────────────────────────────
export function AnomalyBanner({
  anomalies, open, setOpen,
}: {
  anomalies: CampaignAnomaly[]
  open: boolean
  setOpen: (v: boolean | ((p: boolean) => boolean)) => void
}) {
  if (anomalies.length === 0) return null

  // 타입별 집계 요약
  const counts = { lagging: 0, overspend: 0, no_data: 0 }
  anomalies.forEach(a => counts[a.type]++)
  const summary = (Object.entries(counts) as [AnomalyType, number][])
    .filter(([, n]) => n > 0)
    .map(([t, n]) => `${ANOMALY_CFG[t].label} ${n}건`)
    .join(" · ")

  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50 overflow-hidden">
      {/* 헤더 토글 버튼 */}
      <button
        onClick={() => setOpen(p => !p)}
        className="flex w-full items-center justify-between px-4 py-3 hover:bg-orange-100 transition-colors"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-base">🚨</span>
          <span className="text-sm font-semibold text-orange-800">
            이상치 감지 · {anomalies.length}건
          </span>
          <span className="text-xs text-orange-600">{summary}</span>
        </div>
        <svg
          className={`h-4 w-4 text-orange-400 transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* 펼쳐진 상태 */}
      {open && (
        <div className="border-t border-orange-200 divide-y divide-orange-100">
          {anomalies.map((a, i) => {
            const cfg = ANOMALY_CFG[a.type]
            const medias = a.campaign.mediaBudgets
              .map(mb => mb.media as MediaKey)
              .filter(m => m in CONSOLE_URLS)

            return (
              <div
                key={`${a.campaign.id}-${a.type}-${i}`}
                className="px-4 py-3 space-y-2"
              >
                {/* 캠페인 명 + 이상치 배지 + 매체 콘솔 버튼 */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span>{cfg.icon}</span>
                    <span className="text-sm font-semibold text-orange-900">
                      {a.campaign.campaignName}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cfg.badge}`}>
                      {cfg.label}
                    </span>
                    {a.progress !== undefined && a.spendRate !== undefined && (
                      <span className="text-xs text-gray-500">
                        진행률 <strong>{a.progress}%</strong>
                        {" · "}
                        소진율 <strong>{a.spendRate.toFixed(1)}%</strong>
                        {" · "}
                        <span className="text-orange-600 font-semibold">
                          {a.type === "overspend"
                            ? `+${(a.spendRate - 100).toFixed(1)}%p`
                            : `-${(a.progress - a.spendRate).toFixed(1)}%p`
                          }
                        </span>
                      </span>
                    )}
                  </div>

                  {/* 매체 콘솔 바로가기 버튼 */}
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

                {/* 상세 설명 */}
                <p className={`text-xs rounded-lg px-3 py-1.5 ${cfg.text}`}>
                  {a.detail}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
