import type { DmpSettlement } from "@/lib/calculationService"

// ── 포맷 헬퍼 ──────────────────────────────────────────────────────────────
function fmt(n: number) { return n.toLocaleString("ko-KR") }
function fmtPct(n: number) { return n.toFixed(2) + "%" }
function fmtDate() { return new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" }) }

// ── 타입 ───────────────────────────────────────────────────────────────────
export interface DailyReportParams {
  title?: string
  dateRange: string
  campaignName: string | null
  summary: { impressions: number; clicks: number; ctr: number; cpc: number; cost: number; net: number }
  dailyData: Array<{ date: string; impressions: number; clicks: number; cost: number; ctr: number; cpc: number }>
  dmpSettlement: DmpSettlement
  mediaData: Array<{ media: string; impressions: number; clicks: number; cost: number; ctr: number; cpc: number }>
  creativeData: Array<{ name: string; impressions: number; clicks: number; cost: number; ctr: number; cpc: number }>
}

// ── 공통 CSS ───────────────────────────────────────────────────────────────
const BASE_CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,"Noto Sans KR",sans-serif;font-size:13px;color:#111827;background:#f9fafb;padding:24px}
  h1{font-size:20px;font-weight:700;color:#111827}
  h2{font-size:14px;font-weight:600;color:#374151;margin-bottom:12px}
  h3{font-size:12px;font-weight:600;color:#6b7280;margin-bottom:8px}
  .page{max-width:960px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 1px 4px rgba(0,0,0,.08)}
  .cover{border-bottom:2px solid #e5e7eb;padding-bottom:20px;margin-bottom:28px}
  .cover-meta{font-size:11px;color:#9ca3af;margin-top:6px}
  .kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:28px}
  .kpi-card{border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px}
  .kpi-label{font-size:11px;color:#6b7280}
  .kpi-value{font-size:18px;font-weight:700;color:#111827;margin:2px 0}
  .kpi-sub{font-size:10px;color:#9ca3af}
  .section{margin-bottom:28px}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th{background:#f9fafb;border-bottom:1px solid #e5e7eb;padding:8px 12px;text-align:right;font-weight:600;color:#374151}
  th:first-child{text-align:left}
  td{padding:8px 12px;text-align:right;border-bottom:1px solid #f3f4f6;color:#374151}
  td:first-child{text-align:left;font-weight:500}
  tr:last-child td{border-bottom:none}
  .tfoot td{font-weight:700;background:#f9fafb;border-top:1px solid #e5e7eb}
  .badge{display:inline-block;padding:2px 7px;border-radius:999px;font-size:10px;font-weight:600}
  .footer{margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:10px;color:#9ca3af;text-align:right}
  @media print{
    body{background:#fff;padding:0}
    .page{box-shadow:none;padding:16px}
  }
`

// ── KPI 카드 ───────────────────────────────────────────────────────────────
function kpiCard(label: string, value: string, sub = "") {
  return `<div class="kpi-card"><p class="kpi-label">${label}</p><p class="kpi-value">${value}</p>${sub ? `<p class="kpi-sub">${sub}</p>` : ""}</div>`
}

// ── 테이블 ─────────────────────────────────────────────────────────────────
function table(
  headers: string[],
  rows: string[][],
  totalsRow?: string[],
) {
  const ths = headers.map((h, i) => `<th${i === 0 ? "" : ""}>${h}</th>`).join("")
  const trs = rows.map(r => `<tr>${r.map((c, i) => `<td${i === 0 ? "" : ""}>${c}</td>`).join("")}</tr>`).join("")
  const tfoot = totalsRow ? `<tfoot><tr class="tfoot">${totalsRow.map(c => `<td>${c}</td>`).join("")}</tr></tfoot>` : ""
  return `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody>${tfoot}</table>`
}

// ── DMP 뱃지 색상 ──────────────────────────────────────────────────────────
const DMP_BADGE: Record<string, string> = {
  SKP: "background:#dbeafe;color:#1d4ed8",
  KB: "background:#fef9c3;color:#854d0e",
  LOTTE: "background:#fee2e2;color:#b91c1c",
  TG360: "background:#ffedd5;color:#c2410c",
  WIFI: "background:#ccfbf1;color:#0f766e",
  HyperLocal: "background:#f3e8ff;color:#7e22ce",
  BC: "background:#f3f4f6;color:#4b5563",
  SH: "background:#f1f5f9;color:#475569",
  DIRECT: "background:#f3f4f6;color:#9ca3af",
}

// ══════════════════════════════════════════════════════════════════════════
// 통합 리포트 HTML 생성
// ══════════════════════════════════════════════════════════════════════════
export function generateDailyHtmlReport(p: DailyReportParams): string {
  const { summary, dailyData, dmpSettlement, mediaData, creativeData } = p
  const title = p.title ?? "CT+ 통합 리포트"
  const campaignLine = p.campaignName ? ` &nbsp;·&nbsp; ${p.campaignName}` : ""

  // KPI 섹션
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
      </div>
    </div>`

  // 일별 추이 테이블
  const dailySection = dailyData.length > 0 ? `
    <div class="section">
      <h2>일별 성과 추이</h2>
      ${table(
        ["날짜", "노출", "클릭", "CTR", "CPC (원)", "집행금액 (원)"],
        dailyData.map(r => [
          r.date,
          fmt(r.impressions),
          fmt(r.clicks),
          fmtPct(r.ctr),
          fmt(r.cpc),
          fmt(r.cost),
        ]),
        ["합계",
          fmt(dailyData.reduce((s, r) => s + r.impressions, 0)),
          fmt(dailyData.reduce((s, r) => s + r.clicks, 0)),
          fmtPct(summary.ctr),
          fmt(summary.cpc),
          fmt(summary.cost),
        ],
      )}
    </div>` : ""

  // DMP 정산 테이블
  const dmpSection = dmpSettlement.rows.length > 0 ? `
    <div class="section">
      <h2>DMP 정산</h2>
      ${table(
        ["DMP", "집행금액 (원)", "순금액 (원)", "수수료율", "수수료 (원)"],
        dmpSettlement.rows.map(r => {
          const style = DMP_BADGE[r.dmpType] ?? DMP_BADGE.DIRECT
          return [
            `<span class="badge" style="${style}">${r.dmpType}</span>`,
            fmt(r.totalExecution),
            fmt(r.totalNet),
            fmtPct(r.feeRate),
            fmt(r.feeAmount),
          ]
        }),
        ["합계",
          fmt(dmpSettlement.totalExecution),
          fmt(dmpSettlement.totalNet),
          "",
          fmt(dmpSettlement.totalFee),
        ],
      )}
    </div>` : ""

  // 매체별 성과
  const mediaSection = mediaData.length > 0 ? `
    <div class="section">
      <h2>매체별 성과</h2>
      ${table(
        ["매체", "노출", "클릭", "CTR", "CPC (원)", "집행금액 (원)"],
        mediaData.map(r => [
          r.media,
          fmt(r.impressions),
          fmt(r.clicks),
          fmtPct(r.ctr),
          fmt(r.cpc),
          fmt(r.cost),
        ]),
        ["합계",
          fmt(mediaData.reduce((s, r) => s + r.impressions, 0)),
          fmt(mediaData.reduce((s, r) => s + r.clicks, 0)),
          fmtPct(summary.ctr),
          fmt(summary.cpc),
          fmt(summary.cost),
        ],
      )}
    </div>` : ""

  // 소재 Top 10
  const creativeSection = creativeData.length > 0 ? `
    <div class="section">
      <h2>소재별 성과 Top ${creativeData.length}</h2>
      ${table(
        ["소재명", "노출", "클릭", "CTR", "CPC (원)", "집행금액 (원)"],
        creativeData.map(r => [
          r.name,
          fmt(r.impressions),
          fmt(r.clicks),
          fmtPct(r.ctr),
          fmt(r.cpc),
          fmt(r.cost),
        ]),
      )}
    </div>` : ""

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
  </div>
  ${kpiSection}
  ${dailySection}
  ${dmpSection}
  ${mediaSection}
  ${creativeSection}
  <div class="footer">CT+ 캠페인 리포트 &nbsp;·&nbsp; 생성일시: ${new Date().toLocaleString("ko-KR")}</div>
</div>
</body>
</html>`
}

// ══════════════════════════════════════════════════════════════════════════
// 브라우저에서 HTML 파일 다운로드 트리거 (클라이언트 전용)
// ══════════════════════════════════════════════════════════════════════════
export function downloadHtml(html: string, filename: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement("a")
  a.href     = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
