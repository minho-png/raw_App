// 캠페인별 알림 메시지 생성기 (mock 페이지에서 추출).
// today/yesterday 메트릭 + 임계값을 받아 critical/warn/up 분류.

import type { UnifiedCampaignSnapshot } from "@/lib/motivApi/statsMapper"
import { calcCTR, calcSR, calcPR, calcVTR } from "@/lib/motivApi/statsMapper"
import type { AlertMsg, AnalysisSettings } from "./types"

export function dDay(endDate: string): { label: string; color: string; diff: number } {
  if (!endDate) return { label: '—', color: 'text-gray-400', diff: 0 }
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const end = new Date(endDate); end.setHours(0, 0, 0, 0)
  const diff = Math.round((end.getTime() - today.getTime()) / 86400000)
  if (diff > 0) return { label: `D-${diff}`, diff, color: diff <= 4 ? 'text-red-500' : diff <= 9 ? 'text-orange-500' : 'text-gray-400' }
  if (diff === 0) return { label: 'D-Day', diff, color: 'text-red-600 font-bold' }
  return { label: `D+${Math.abs(diff)}`, diff, color: 'text-gray-500' }
}

export function buildAlerts(
  c: UnifiedCampaignSnapshot,
  s: AnalysisSettings,
  opts: { yesterdayMissing?: boolean } = {},
): AlertMsg[] {
  const msgs: AlertMsg[] = []
  const t = c.today
  const y = c.yesterday
  const yesterdayMissing = opts.yesterdayMissing ?? false

  // CTR 비교 (전일 미연동 시 skip)
  if (!yesterdayMissing) {
    const ctrT = calcCTR(t.clicks, t.impressions)
    const ctrY = calcCTR(y.clicks, y.impressions)
    const ctrDiff = ctrT - ctrY
    if (Math.abs(ctrDiff) >= s.ctrDiff) {
      msgs.push({
        kind: ctrDiff >= 0 ? 'up' : 'warn',
        cat: 'ctr',
        text: `CTR ${ctrDiff >= 0 ? '+' : ''}${ctrDiff.toFixed(2)}%p`,
      })
    }
  }

  // 소진률 비교
  if (!yesterdayMissing && c.budget > 0) {
    const srT = calcSR(t.spend, c.budget)
    const srY = calcSR(y.spend, c.budget)
    const srDiff = srT - srY
    if (Math.abs(srDiff) >= s.spendRateDiff) {
      msgs.push({
        kind: srDiff >= 0 ? 'up' : 'warn',
        cat: 'spend',
        text: `소진률 ${srDiff >= 0 ? '+' : ''}${srDiff.toFixed(2)}%p`,
      })
    }
  }

  // 수익률 기준 미달 (절대값) — 전일 비교와 무관하게 항상 체크
  const prT = calcPR(t)
  const minProfit = c.uiType === 'display' ? s.displayProfitMin
    : c.uiType === 'video' ? s.videoProfitMin
    : c.uiType === 'ctv' ? s.videoProfitMin  // CTV도 동영상 기준 적용
    : s.displayProfitMin
  if (t.spend > 0 && prT < minProfit) {
    msgs.push({
      kind: 'warn',
      cat: 'profit',
      text: `수익률 ${prT.toFixed(2)}% (기준 ${minProfit}% 미달)`,
    })
  }

  // VTR 기준 미달 (video/ctv 만)
  if (c.uiType === 'video' || c.uiType === 'ctv') {
    const vtrT = calcVTR(t)
    const minVtr = c.uiType === 'ctv' ? s.ctvVtrMin : s.videoVtrMin
    if (t.impressions > 0 && vtrT < minVtr) {
      msgs.push({
        kind: 'warn',
        cat: 'vtr',
        text: `VTR ${vtrT.toFixed(2)}% (기준 ${minVtr}% 미달)`,
      })
    }
  }

  // 광고 미게재 감지 (오늘 spend 0 — critical)
  if (t.spend === 0 && t.impressions === 0 && c.budget > 0) {
    const d = dDay(c.endDate)
    if (d.diff > 0) {  // 진행 중인데 노출이 전혀 없는 경우만
      msgs.push({
        kind: 'critical',
        cat: 'spend',
        text: '오늘 노출/소진 데이터 없음',
      })
    }
  }

  // 기간 임박 (D-4 이하, 종료 전)
  const d = dDay(c.endDate)
  if (d.diff > 0 && d.diff <= 4) {
    msgs.push({
      kind: 'warn',
      cat: 'deadline',
      text: `종료 임박 ${d.label}`,
    })
  }

  return msgs
}
