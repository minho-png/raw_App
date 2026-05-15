"use client"
import type { MotivCampaign } from "@/lib/motivApi/types"
import { motivCampaignToSnapshot } from "@/lib/motivApi/statsMapper"
import { buildAlerts, dDay } from "@/components/analysis/alertEngine"
import { DEFAULT_ANALYSIS_SETTINGS, type AlertMsg } from "@/components/analysis/types"
import { motivCampaignAdGroupUrl } from "@/lib/motivApi/consoleLinks"
import { isActiveMotivCampaign } from "@/lib/motivApi/campaignFilters"

interface Row {
  motivId: number
  product: 'CT' | 'CTV'
  name: string
  endDate: string
  ddayLabel: string
  ddayDiff: number
  alerts: AlertMsg[]
  criticals: number
  warns: number
}

/**
 * 첫 화면용 Motiv 캠페인 통합 알림 테이블.
 *
 * 사용자 요청 — '첫 화면에 테이블 형식으로 경고를 모아 볼 수 있으면 좋겠다'.
 *
 * 디자인 — 모던/현대적, 단순:
 *   - rounded-2xl 카드 + 부드러운 그림자
 *   - 행 hover, 우측에 '매체 콘솔 열기' 외부 링크 버튼
 *   - critical 이 있는 행은 red 톤
 *
 * 정확도 — 첫 화면이라 분석 페이지처럼 stats/breakdown 호출은 생략.
 * 시간 무관 케이스(운영중 spend=0, 종료 임박) 위주로 트리거.
 */
export function MotivAlertsTable({
  ct, ctv,
}: {
  ct: MotivCampaign[]
  ctv: MotivCampaign[]
}) {
  const rows: Row[] = []
  const collect = (cs: MotivCampaign[], product: 'CT' | 'CTV') => {
    for (const c of cs) {
      // 사용자 요청 — '비활성화 캠페인 / 집행일 도래 안한 캠페인은 알림 제외'.
      // isActiveMotivCampaign = status==='Y' AND 오늘이 [start_date, end_date] 안.
      // → 비활성(status!=='Y'), 시작 전(start>today), 종료 후(end<today) 모두 제외.
      if (!isActiveMotivCampaign(c)) continue
      const snap = motivCampaignToSnapshot(c, '—')
      const alerts = buildAlerts(snap, DEFAULT_ANALYSIS_SETTINGS, { yesterdayMissing: true })
      // critical/warn 만 노출 — '상승' 은 첫 화면에서 노이즈.
      const actionable = alerts.filter(a => a.kind === 'critical' || a.kind === 'warn')
      if (actionable.length === 0) continue
      const dd = dDay(snap.endDate)
      rows.push({
        motivId: c.id,
        product,
        name: c.title || `Campaign #${c.id}`,
        endDate: snap.endDate,
        ddayLabel: dd.label,
        ddayDiff: dd.diff,
        alerts: actionable,
        criticals: actionable.filter(a => a.kind === 'critical').length,
        warns:     actionable.filter(a => a.kind === 'warn').length,
      })
    }
  }
  collect(ct, 'CT')
  collect(ctv, 'CTV')

  // 정렬: critical 많은 순 → 종료 임박 순.
  rows.sort((a, b) => {
    if (a.criticals !== b.criticals) return b.criticals - a.criticals
    return a.ddayDiff - b.ddayDiff
  })

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/40 via-white to-white p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white text-[10px] font-bold">✓</span>
          <h3 className="text-sm font-semibold text-gray-900">매체 캠페인 알림</h3>
        </div>
        <p className="text-xs text-gray-500 mt-1">현재 알림 없음 — 모든 캠페인이 정상 운영 중입니다.</p>
      </div>
    )
  }

  const today = todayStr()
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-white to-gray-50/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-bold">!</span>
          <h3 className="text-sm font-semibold text-gray-900">매체 캠페인 알림 <span className="text-amber-600 ml-1">({rows.length})</span></h3>
        </div>
        <p className="text-[10px] text-gray-400">행 클릭 → 매체 콘솔 직접 이동</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr className="text-gray-500">
              <th className="px-3 py-2 text-left font-medium">제품</th>
              <th className="px-3 py-2 text-left font-medium">캠페인</th>
              <th className="px-3 py-2 text-left font-medium">알림</th>
              <th className="px-3 py-2 text-center font-medium">D-day</th>
              <th className="px-3 py-2 text-right font-medium">매체 콘솔</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(r => {
              const hasCritical = r.criticals > 0
              const url = motivCampaignAdGroupUrl({
                campaignId: r.motivId, startDate: today, endDate: today,
              })
              return (
                <tr key={r.motivId} className={`group transition-colors ${hasCritical ? 'bg-red-50/30 hover:bg-red-50/60' : 'hover:bg-gray-50'}`}>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      r.product === 'CT' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                    }`}>{r.product}</span>
                  </td>
                  <td className="px-3 py-2 text-gray-900 font-medium max-w-[240px] truncate" title={r.name}>{r.name}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1 flex-wrap">
                      {hasCritical && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-red-100 text-red-700 px-1.5 py-0.5 text-[10px] font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" />
                          critical {r.criticals}
                        </span>
                      )}
                      {r.warns > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 text-amber-700 px-1.5 py-0.5 text-[10px] font-semibold">
                          warn {r.warns}
                        </span>
                      )}
                      <span className="text-[10px] text-gray-500 truncate max-w-[200px]" title={r.alerts.map(a => a.text).join(' · ')}>
                        {r.alerts[0]?.text}{r.alerts.length > 1 ? ` 외 ${r.alerts.length - 1}` : ''}
                      </span>
                    </div>
                  </td>
                  <td className={`px-3 py-2 text-center tabular-nums ${
                    r.ddayDiff > 0 && r.ddayDiff <= 4 ? 'text-red-600 font-bold'
                    : r.ddayDiff > 0 && r.ddayDiff <= 9 ? 'text-orange-600 font-medium'
                    : 'text-gray-500'
                  }`}>{r.ddayLabel}</td>
                  <td className="px-3 py-2 text-right">
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md bg-gray-900 text-white px-2 py-1 text-[10px] font-medium hover:bg-gray-700 transition-colors"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                      열기
                    </a>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
