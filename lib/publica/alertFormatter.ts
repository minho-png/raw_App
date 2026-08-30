/**
 * Publica 분석 결과 → 알림 메일 본문 — Service 계층.
 *
 * 기존 zeroSpendAlert 의 인라인 스타일 규약을 따른다
 * (메일 클라이언트는 <style> 블록·외부 CSS 를 자주 무시하므로 인라인 필수).
 */

import type { PublicaAnalysis, PublicaAnomaly, AnomalySeverity } from './types'
import { fmtInt, fmtPct } from './anomalyDetector'

const SEVERITY_LABEL: Record<AnomalySeverity, string> = {
  critical: '심각',
  warning: '주의',
  info: '참고',
}

const SEVERITY_COLOR: Record<AnomalySeverity, { fg: string; bg: string }> = {
  critical: { fg: '#991b1b', bg: '#fee2e2' },
  warning: { fg: '#92400e', bg: '#fef3c7' },
  info: { fg: '#1e40af', bg: '#dbeafe' },
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 분석 기준일 — basic 리포트 최신일이 있으면 그것, 없으면 실행일. */
export function reportDate(analysis: PublicaAnalysis, now: Date): string {
  if (analysis.latest) return analysis.latest.date
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10)
}

/** 제목 — 수신함에서 한눈에 심각도를 알 수 있게 구성. */
export function formatSubject(analysis: PublicaAnalysis, now: Date): string {
  const date = reportDate(analysis, now)
  const { critical, warning } = analysis.counts
  if (critical === 0 && warning === 0) {
    return `[Publica ${date}] 이상 없음`
  }
  const parts: string[] = []
  if (critical > 0) parts.push(`심각 ${critical}건`)
  if (warning > 0) parts.push(`주의 ${warning}건`)
  return `[Publica ${date}] ${parts.join(' · ')}`
}

function anomalyLineText(a: PublicaAnomaly): string {
  const ev = Object.entries(a.evidence).map(([k, v]) => `${k}=${v}`).join(', ')
  return `  [${SEVERITY_LABEL[a.severity]}] (${a.source}) ${a.subject} — ${a.message}${ev ? `\n      ${ev}` : ''}`
}

/** 평문 본문 — HTML 을 못 읽는 클라이언트·알림 미리보기용. */
export function formatText(analysis: PublicaAnalysis, now: Date): string {
  const date = reportDate(analysis, now)
  const lines: string[] = [`Publica 데일리 리포트 분석 — 기준일 ${date}`, '']

  if (analysis.anomalies.length === 0) {
    lines.push('탐지된 이상 징후가 없습니다.')
  } else {
    const { critical, warning, info } = analysis.counts
    lines.push(`이상 징후 ${analysis.anomalies.length}건 (심각 ${critical} / 주의 ${warning} / 참고 ${info})`, '')
    for (const a of analysis.anomalies) lines.push(anomalyLineText(a))
    if (analysis.truncated > 0) lines.push('', `… 외 ${analysis.truncated}건 생략`)
  }

  if (analysis.latest) {
    const l = analysis.latest
    lines.push('', `[${l.date} 전체 실적]`,
      `  요청 ${fmtInt(l.bidRequests)} / 응답 ${fmtInt(l.bidResponses)} / 낙찰 ${fmtInt(l.bidWon)} / 노출 ${fmtInt(l.impressions)}`,
      `  매출 ${l.revenue} / 렌더율 ${l.renderRate !== null ? fmtPct(l.renderRate) : '—'} / eCPM ${l.avgImpEcpm ?? '—'}`)
  }

  if (analysis.breakdowns.length > 0) {
    lines.push('', '[퍼블리셔별 에러 분해]')
    for (const b of analysis.breakdowns) {
      lines.push(`  ${b.publisherName}: 총 ${fmtInt(b.totalErrors)} (연동 ${fmtInt(b.byClass.integration)} / 설정 ${fmtInt(b.byClass.config)} / 정상 ${fmtInt(b.byClass.expected)})`)
      for (const c of b.codes.slice(0, 5)) {
        lines.push(`      ${c.code ?? '(없음)'} ${c.name} — ${fmtInt(c.count)}`)
      }
    }
  }

  if (analysis.llm) {
    lines.push('', '[AI 요약]', `  ${analysis.llm.summary}`)
    for (const o of analysis.llm.observations) lines.push(`  - ${o}`)
  }

  if (analysis.warnings.length > 0) {
    lines.push('', '[처리 경고]')
    for (const w of analysis.warnings) lines.push(`  - ${w}`)
  }

  lines.push('', `분석 대상 메일 ${analysis.messages.length}통 / 리포트 ${analysis.reports.length}건`)
  return lines.join('\n')
}

function anomalyBlockHtml(a: PublicaAnomaly): string {
  const color = SEVERITY_COLOR[a.severity]
  const evidence = Object.entries(a.evidence)
    .map(([k, v]) => `<span style="display:inline-block;margin-right:10px"><span style="color:#888">${esc(k)}</span> <strong>${esc(v)}</strong></span>`)
    .join('')
  return `<div style="margin:0 0 10px;padding:10px 12px;border-left:3px solid ${color.fg};background:#fafafa">
    <div>
      <span style="display:inline-block;padding:2px 8px;font-size:11px;font-weight:700;color:${color.fg};background:${color.bg};border-radius:9999px">${SEVERITY_LABEL[a.severity]}</span>
      <span style="margin-left:6px;font-size:11px;color:#888">${esc(a.source)}</span>
      <strong style="margin-left:6px;color:#111">${esc(a.subject)}</strong>
    </div>
    <div style="margin-top:4px;color:#333">${esc(a.message)}</div>
    ${evidence ? `<div style="margin-top:4px;font-size:11px">${evidence}</div>` : ''}
  </div>`
}

/** HTML 본문. */
export function formatHtml(analysis: PublicaAnalysis, now: Date): string {
  const date = reportDate(analysis, now)
  const { critical, warning, info } = analysis.counts

  const summary = analysis.anomalies.length === 0
    ? `<p style="margin:0 0 16px;padding:10px 12px;background:#ecfdf5;color:#065f46;border-radius:6px">탐지된 이상 징후가 없습니다.</p>`
    : `<p style="margin:0 0 14px;font-size:12px;color:#555">
         이상 징후 <strong>${analysis.anomalies.length}건</strong> — 심각 ${critical} · 주의 ${warning} · 참고 ${info}
       </p>`

  const blocks = analysis.anomalies.map(anomalyBlockHtml).join('')
  const truncated = analysis.truncated > 0
    ? `<p style="font-size:12px;color:#888">… 외 ${analysis.truncated}건 생략</p>` : ''

  const latest = analysis.latest ? `
    <h3 style="font-size:13px;margin:20px 0 6px;color:#111">${esc(analysis.latest.date)} 전체 실적</h3>
    <table style="border-collapse:collapse;font-size:12px">
      <tr><td style="padding:2px 12px 2px 0;color:#666">요청</td><td style="padding:2px 0"><strong>${fmtInt(analysis.latest.bidRequests)}</strong></td>
          <td style="padding:2px 12px 2px 24px;color:#666">응답</td><td style="padding:2px 0"><strong>${fmtInt(analysis.latest.bidResponses)}</strong></td></tr>
      <tr><td style="padding:2px 12px 2px 0;color:#666">낙찰</td><td style="padding:2px 0"><strong>${fmtInt(analysis.latest.bidWon)}</strong></td>
          <td style="padding:2px 12px 2px 24px;color:#666">노출</td><td style="padding:2px 0"><strong>${fmtInt(analysis.latest.impressions)}</strong></td></tr>
      <tr><td style="padding:2px 12px 2px 0;color:#666">매출</td><td style="padding:2px 0"><strong>${analysis.latest.revenue}</strong></td>
          <td style="padding:2px 12px 2px 24px;color:#666">렌더율</td><td style="padding:2px 0"><strong>${analysis.latest.renderRate !== null ? fmtPct(analysis.latest.renderRate) : '—'}</strong></td></tr>
    </table>` : ''

  const breakdowns = analysis.breakdowns.length === 0 ? '' : `
    <h3 style="font-size:13px;margin:20px 0 6px;color:#111">퍼블리셔별 에러 분해</h3>
    ${analysis.breakdowns.map(b => `
      <div style="margin-bottom:10px;font-size:12px">
        <strong>${esc(b.publisherName)}</strong>
        <span style="color:#666">총 ${fmtInt(b.totalErrors)}</span>
        <span style="margin-left:8px;color:#991b1b">연동 ${fmtInt(b.byClass.integration)}</span>
        <span style="margin-left:6px;color:#92400e">설정 ${fmtInt(b.byClass.config)}</span>
        <span style="margin-left:6px;color:#666">정상 ${fmtInt(b.byClass.expected)}</span>
        <ul style="margin:4px 0 0;padding-left:18px;color:#555">
          ${b.codes.slice(0, 5).map(c => `<li>${c.code ?? '(없음)'} ${esc(c.name)} — ${fmtInt(c.count)}</li>`).join('')}
        </ul>
      </div>`).join('')}`

  const llm = analysis.llm ? `
    <h3 style="font-size:13px;margin:20px 0 6px;color:#111">AI 요약</h3>
    <div style="font-size:12px;color:#333;padding:10px 12px;background:#f5f3ff;border-radius:6px">
      <p style="margin:0 0 6px">${esc(analysis.llm.summary)}</p>
      ${analysis.llm.observations.length > 0
        ? `<ul style="margin:0;padding-left:18px">${analysis.llm.observations.map(o => `<li>${esc(o)}</li>`).join('')}</ul>`
        : ''}
    </div>` : ''

  const warnings = analysis.warnings.length === 0 ? '' : `
    <h3 style="font-size:13px;margin:20px 0 6px;color:#92400e">처리 경고</h3>
    <ul style="font-size:12px;color:#92400e;margin:0;padding-left:18px">
      ${analysis.warnings.map(w => `<li>${esc(w)}</li>`).join('')}
    </ul>`

  return `<div style="font-family:system-ui,-apple-system,sans-serif;color:#111;line-height:1.5;max-width:720px">
  <h2 style="font-size:16px;margin:0 0 4px">Publica 데일리 리포트 분석</h2>
  <p style="font-size:12px;color:#888;margin:0 0 14px">기준일 ${esc(date)} · 메일 ${analysis.messages.length}통 · 리포트 ${analysis.reports.length}건</p>
  ${summary}
  ${blocks}
  ${truncated}
  ${latest}
  ${breakdowns}
  ${llm}
  ${warnings}
</div>`
}

/** 제목·평문·HTML 을 한 번에 생성. */
export function formatAlertEmail(analysis: PublicaAnalysis, now: Date): {
  subject: string
  text: string
  html: string
} {
  return {
    subject: formatSubject(analysis, now),
    text: formatText(analysis, now),
    html: formatHtml(analysis, now),
  }
}
