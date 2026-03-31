import type { DmpSettlement } from "@/lib/calculationService"

// ── 포맷 헬퍼 ─────────────────────────────────────────────────────────────
function fmt(n: number)    { return n.toLocaleString("ko-KR") }
function fmtPct(n: number) { return n.toFixed(2) + "%" }
function fmtDate()         { return new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" }) }

// ── 타입 ─────────────────────────────────────────────────────────────────
export interface DailyReportParams {
  title?: string
  dateRange: string
  campaignName: string | null
  summary: {
    impressions: number; clicks: number; ctr: number; cpc: number
    cost: number; net: number; views?: number
  }
  dailyData: Array<{ date: string; impressions: number; clicks: number; cost: number; ctr: number; cpc: number }>
  dmpSettlement: DmpSettlement
  mediaData:    Array<{ media: string; impressions: number; clicks: number; cost: number; ctr: number; cpc: number }>
  creativeData: Array<{ name: string; impressions: number; clicks: number; cost: number; ctr: number; cpc: number }>
  // optional new sections
  videoData?:          Array<{ date: string; views: number; vtr: number; cpv: number; impressions: number; cost: number }>
  campaignBreakdown?:  Array<{ name: string; impressions: number; clicks: number; cost: number; ctr: number; cpc: number }>
  accountBreakdown?:   Array<{ name: string; impressions: number; clicks: number; cost: number; ctr: number; cpc: number }>
  reportMeta?: { advertiser?: string; agency?: string }
}

// ── 공통 CSS ─────────────────────────────────────────────────────────────
const BASE_CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,"Noto Sans KR",sans-serif;font-size:13px;color:#111827;background:#f9fafb;padding:24px}
  h1{font-size:20px;font-weight:700;color:#111827}
  h2{font-size:14px;font-weight:600;color:#374151;margin-bottom:12px}
  h3{font-size:12px;font-weight:600;color:#6b7280;margin-bottom:8px}
  .page{max-width:960px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 1px 4px rgba(0,0,0,.08)}
  .cover{border-bottom:2px solid #e5e7eb;padding-bottom:20px;margin-bottom:28px}
  .cover-meta{font-size:11px;color:#9ca3af;margin-top:4px}
  .cover-tags{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
  .cover-tag{font-size:11px;background:#f3f4f6;border-radius:6px;padding:3px 10px;color:#374151}
  .kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:28px}
  .kpi-card{border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px}
  .kpi-label{font-size:11px;color:#6b7280}
  .kpi-value{font-size:18px;font-weight:700;color:#111827;margin:2px 0}
  .kpi-sub{font-size:10px;color:#9ca3af}
  .section{margin-bottom:32px}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th{background:#f9fafb;border-bottom:1px solid #e5e7eb;padding:8px 12px;text-align:right;font-weight:600;color:#374151}
  th:first-child{text-align:left}
  td{padding:8px 12px;text-align:right;border-bottom:1px solid #f3f4f6;color:#374151}
  td:first-child{text-align:left;font-weight:500}
  tr:last-child td{border-bottom:none}
  .tfoot td{font-weight:700;background:#f9fafb;border-top:1px solid #e5e7eb}
  .badge{display:inline-block;padding:2px 7px;border-radius:999px;font-size:10px;font-weight:600}
  .chart-wrap{overflow-x:auto;margin-bottom:8px}
  .bar-row{display:flex;align-items:center;gap:8px;margin-bottom:6px}
  .bar-label{font-size:11px;color:#6b7280;width:60px;text-align:right;flex-shrink:0}
  .bar-track{flex:1;background:#f3f4f6;border-radius:4px;height:16px;overflow:hidden}
  .bar-fill{height:100%;border-radius:4px;min-width:2px}
  .bar-val{font-size:11px;color:#374151;width:80px;flex-shrink:0}
  .footer{margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:10px;color:#9ca3af;text-align:right}
  @media print{body{background:#fff;padding:0}.page{box-shadow:none;padding:16px}}
`

// ── KPI 카드 ─────────────────────────────────────────────────────────────
function kpiCard(label: string, value: string, sub = "") {
  return `<div class="kpi-card"><p class="kpi-label">${label}</p><p class="kpi-value">${value}</p>${sub ? `<p class="kpi-sub">${sub}</p>` : ""}</div>`
}

// ── 테이블 ──────────────────────────────────────────────────────────────
function table(headers: string[], rows: string[][], totalsRow?: string[]) {
  const ths   = headers.map(h => `<th>${h}</th>`).join("")
  const trs   = rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")
  const tfoot = totalsRow ? `<tfoot><tr class="tfoot">${totalsRow.map(c => `<td>${c}</td>`).join("")}</tr></tfoot>` : ""
  return `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody>${tfoot}</table>`
}

// ── CSS 가로 막대 차트 ───────────────────────────────────────────────────
function barChart(
  items: Array<{ label: string; value: number; color: string }>,
  maxValue: number,
  formatValue: (v: number) => string,
) {
  if (items.length === 0) return ""
  const max = maxValue || 1
  return `<div class="chart-wrap">${items.map(item => {
    const pct = Math.min(100, (item.value / max) * 100).toFixed(1)
    return `<div class="bar-row">
      <span class="bar-label">${item.label}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${item.color}"></div></div>
      <span class="bar-val">${formatValue(item.value)}</span>
    </div>`
  }).join("")}</div>`
}

// ── DMP 뱃지 색상 ────────────────────────────────────────────────────────
const DMP_BADGE: Record<string, string> = {
  SKP: "background:#dbeafe;color:#1d4ed8",
  KB:  "background:#fef9c3;color:#854d0e",
  LOTTE: "background:#fee2e2;color:#b91c1c",
  TG360: "background:#ffedd5;color:#c2410c",
  WIFI: "background:#ccfbf1;color:#0f766e",
  HyperLocal: "background:#f3e8ff;color:#7e22ce",
  BC: "background:#f3f4f6;color:#4b5563",
  SH: "background:#f1f5f9;color:#475569",
  DIRECT: "background:#f3f4f6;color:#9ca3af",
}

const MEDIA_COLORS: Record<string, string> = {
  "Google":    "#4285F4",
  "네이버 GFA": "#03C75A",
  "카카오모먼트": "#FAE100",
  "META":      "#0866FF",
}

function mediaBgColor(media: string) {
  return MEDIA_COLORS[media] ?? "#9CA3AF"
}

// ══════════════════════════════════════════════════════════════════════════
// 통합 리포트 HTML 생성
// ══════════════════════════════════════════════════════════════════════════
export function generateDailyHtmlReport(p: DailyReportParams): string {
  const { summary, dailyData, dmpSettlement, mediaData, creativeData } = p
  const title        = p.title ?? "CT+ 통합 리포트"
  const campaignLine = p.campaignName ? ` &nbsp;·&nbsp; ${p.campaignName}` : ""

  // ── 커버 태그 (대행사/광고주) ───────────────────────────────────────────
  const coverTagsHtml = (() => {
    const tags: string[] = []
    if (p.reportMeta?.advertiser) tags.push(`광고주: ${p.reportMeta.advertiser}`)
    if (p.reportMeta?.agency)     tags.push(`대행사: ${p.reportMeta.agency}`)
    if (tags.length === 0) return ""
    return `<div class="cover-tags">${tags.map(t => `<span class="cover-tag">${t}</span>`).join("")}</div>`
  })()

  // ── KPI 섹션 ────────────────────────────────────────────────────────────
  const hasViews   = (summary.views ?? 0) > 0
  const vtr        = hasViews && summary.impressions > 0 ? ((summary.views! / summary.impressions) * 100) : 0
  const cpv        = hasViews && summary.views! > 0 ? Math.round(summary.cost / summary.views!) : 0

  const kpiSection = `
    <div class="section">
      <h2>전체 요약 KPI</h2>
      <div class="kpi-grid">
        ${kpiCard("총 노출수",     fmt(summary.impressions))}
        ${kpiCard("총 클릭수",     fmt(summary.clicks))}
        ${kpiCard("CTR",           fmtPct(summary.ctr))}
        ${kpiCard("CPC",           fmt(summary.cpc) + "원")}
        ${kpiCard("집행 금액",     fmt(summary.cost) + "원", "마크업 포함")}
        ${kpiCard("순 금액 (NET)", fmt(summary.net)  + "원", "VAT 제외")}
        ${hasViews ? kpiCard("총 재생수", fmt(summary.views!), "동영상") : ""}
        ${hasViews ? kpiCard("VTR",  fmtPct(vtr), "재생/노출") : ""}
        ${hasViews ? kpiCard("CPV",  fmt(cpv) + "원", "재생당 비용") : ""}
      </div>
    </div>`

  // ── 일별 추이 (테이블 + 막대 차트) ──────────────────────────────────────
  const maxDailyCost = Math.max(...dailyData.map(d => d.cost), 1)
  const dailyCostChart = barChart(
    dailyData.map(d => ({ label: d.date, value: d.cost, color: "#6366F1" })),
    maxDailyCost,
    v => fmt(v) + "원",
  )

  const dailySection = dailyData.length > 0 ? `
    <div class="section">
      <h2>일별 성과 추이</h2>
      <h3>집행금액 추이</h3>
      ${dailyCostChart}
      ${table(
        ["날짜", "노출", "클릭", "CTR", "CPC (원)", "집행금액 (원)"],
        dailyData.map(r => [r.date, fmt(r.impressions), fmt(r.clicks), fmtPct(r.ctr), fmt(r.cpc), fmt(r.cost)]),
        ["합계",
          fmt(dailyData.reduce((s, r) => s + r.impressions, 0)),
          fmt(dailyData.reduce((s, r) => s + r.clicks, 0)),
          fmtPct(summary.ctr), fmt(summary.cpc), fmt(summary.cost),
        ],
      )}
    </div>` : ""

  // ── 매체별 성과 (막대 차트 + 테이블) ────────────────────────────────────
  const maxMediaCost = Math.max(...mediaData.map(d => d.cost), 1)
  const mediaCostChart = barChart(
    mediaData.map(d => ({ label: d.media, value: d.cost, color: mediaBgColor(d.media) })),
    maxMediaCost,
    v => fmt(v) + "원",
  )

  const mediaSection = mediaData.length > 0 ? `
    <div class="section">
      <h2>매체별 성과</h2>
      <h3>매체별 집행금액</h3>
      ${mediaCostChart}
      ${table(
        ["매체", "노출", "클릭", "CTR", "CPC (원)", "집행금액 (원)"],
        mediaData.map(r => [r.media, fmt(r.impressions), fmt(r.clicks), fmtPct(r.ctr), fmt(r.cpc), fmt(r.cost)]),
        ["합계",
          fmt(mediaData.reduce((s, r) => s + r.impressions, 0)),
          fmt(mediaData.reduce((s, r) => s + r.clicks, 0)),
          fmtPct(summary.ctr), fmt(summary.cpc), fmt(summary.cost),
        ],
      )}
    </div>` : ""

  // ── DMP 정산 ────────────────────────────────────────────────────────────
  const maxDmpExec = Math.max(...dmpSettlement.rows.map(r => r.totalExecution), 1)
  const dmpChart = barChart(
    dmpSettlement.rows.map(r => ({ label: r.dmpType, value: r.totalExecution, color: DMP_BADGE[r.dmpType] ? "#6366F1" : "#9CA3AF" })),
    maxDmpExec,
    v => fmt(v) + "원",
  )

  const dmpSection = dmpSettlement.rows.length > 0 ? `
    <div class="section">
      <h2>DMP 정산</h2>
      <h3>DMP별 집행금액</h3>
      ${dmpChart}
      ${table(
        ["DMP", "집행금액 (원)", "순금액 (원)", "수수료율", "수수료 (원)"],
        dmpSettlement.rows.map(r => {
          const style = DMP_BADGE[r.dmpType] ?? DMP_BADGE.DIRECT
          return [
            `<span class="badge" style="${style}">${r.dmpType}</span>`,
            fmt(r.totalExecution), fmt(r.totalNet), fmtPct(r.feeRate), fmt(r.feeAmount),
          ]
        }),
        ["합계", fmt(dmpSettlement.totalExecution), fmt(dmpSettlement.totalNet), "", fmt(dmpSettlement.totalFee)],
      )}
    </div>` : ""

  // ── 소재 Top 10 ─────────────────────────────────────────────────────────
  const creativeSection = creativeData.length > 0 ? `
    <div class="section">
      <h2>소재별 성과 Top ${creativeData.length}</h2>
      ${table(
        ["소재명", "노출", "클릭", "CTR", "CPC (원)", "집행금액 (원)"],
        creativeData.map(r => [r.name, fmt(r.impressions), fmt(r.clicks), fmtPct(r.ctr), fmt(r.cpc), fmt(r.cost)]),
      )}
    </div>` : ""

  // ── 영상 성과 (views 있는 경우만) ─────────────────────────────────────
  const videoSection = (() => {
    const vd = p.videoData?.filter(r => r.views > 0) ?? []
    if (vd.length === 0) return ""
    const maxViews = Math.max(...vd.map(d => d.views), 1)
    const viewsChart = barChart(
      vd.map(d => ({ label: d.date, value: d.views, color: "#10B981" })),
      maxViews,
      v => fmt(v),
    )
    return `
    <div class="section">
      <h2>영상 성과</h2>
      <h3>일별 재생수</h3>
      ${viewsChart}
      ${table(
        ["날짜", "재생수", "노출", "VTR", "집행금액 (원)", "CPV (원)"],
        vd.map(r => [
          r.date, fmt(r.views), fmt(r.impressions),
          fmtPct(r.vtr), fmt(r.cost), fmt(r.cpv),
        ]),
        ["합계",
          fmt(vd.reduce((s, r) => s + r.views, 0)),
          fmt(vd.reduce((s, r) => s + r.impressions, 0)),
          fmtPct(vd.reduce((s, r) => s + r.views, 0) / Math.max(vd.reduce((s, r) => s + r.impressions, 0), 1) * 100),
          fmt(vd.reduce((s, r) => s + r.cost, 0)),
          "",
        ],
      )}
    </div>`
  })()

  // ── 캠페인 브레이크다운 ─────────────────────────────────────────────────
  const campaignSection = (() => {
    const cd = p.campaignBreakdown ?? []
    if (cd.length === 0) return ""
    const maxCost = Math.max(...cd.map(d => d.cost), 1)
    const chart = barChart(
      cd.map((d, i) => ({ label: d.name.slice(0, 12), value: d.cost, color: ["#6366F1","#F59E0B","#10B981","#EF4444","#3B82F6"][i % 5] })),
      maxCost,
      v => fmt(v) + "원",
    )
    return `
    <div class="section">
      <h2>캠페인별 성과</h2>
      <h3>캠페인별 집행금액</h3>
      ${chart}
      ${table(
        ["캠페인명", "노출", "클릭", "CTR", "CPC (원)", "집행금액 (원)"],
        cd.map(r => [r.name, fmt(r.impressions), fmt(r.clicks), fmtPct(r.ctr), fmt(r.cpc), fmt(r.cost)]),
        ["합계",
          fmt(cd.reduce((s, r) => s + r.impressions, 0)),
          fmt(cd.reduce((s, r) => s + r.clicks, 0)),
          fmtPct(summary.ctr), fmt(summary.cpc), fmt(summary.cost),
        ],
      )}
    </div>`
  })()

  // ── 계정 브레이크다운 ───────────────────────────────────────────────────
  const accountSection = (() => {
    const ad = p.accountBreakdown ?? []
    if (ad.length === 0) return ""
    return `
    <div class="section">
      <h2>계정별 성과</h2>
      ${table(
        ["계정명", "노출", "클릭", "CTR", "CPC (원)", "집행금액 (원)"],
        ad.map(r => [r.name, fmt(r.impressions), fmt(r.clicks), fmtPct(r.ctr), fmt(r.cpc), fmt(r.cost)]),
        ["합계",
          fmt(ad.reduce((s, r) => s + r.impressions, 0)),
          fmt(ad.reduce((s, r) => s + r.clicks, 0)),
          fmtPct(summary.ctr), fmt(summary.cpc), fmt(summary.cost),
        ],
      )}
    </div>`
  })()

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}${p.campaignName ? " — " + p.campaignName : ""}</title>
  <style>${BASE_CSS}</style>
</head>
<body>
<div class="page">
  <div class="cover">
    <h1>${title}</h1>
    <p class="cover-meta">기간: ${p.dateRange}${campaignLine}</p>
    <p class="cover-meta">생성일: ${fmtDate()}</p>
    ${coverTagsHtml}
  </div>
  ${kpiSection}
  ${campaignSection}
  ${accountSection}
  ${dailySection}
  ${videoSection}
  ${dmpSection}
  ${mediaSection}
  ${creativeSection}
  <div class="footer">CT+ 캠페인 리포트 &nbsp;·&nbsp; 생성일시: ${new Date().toLocaleString("ko-KR")}</div>
</div>
</body>
</html>`
}

// ── 브라우저에서 HTML 파일 다운로드 (클라이언트 전용) ──────────────────────
export function downloadHtml(html: string, filename: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement("a")
  a.href     = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { URL.revokeObjectURL(url); a.remove() }, 1000)
}
