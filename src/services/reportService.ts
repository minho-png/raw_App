import { CampaignConfig, PerformanceRecord, BudgetStatus } from "../types";
import type { ReportBuilderConfig } from "../components/organisms/ReportBuilderModal";

// ── Internal aggregation helper ──────────────────────────────────────────────

type AggRow = { clicks: number; imps: number; cost: number };

function sumBy<T extends string>(
  rows: PerformanceRecord[],
  keyFn: (r: PerformanceRecord) => T
): Map<T, AggRow> {
  const acc = new Map<T, AggRow>();
  for (const r of rows) {
    const k = keyFn(r);
    const prev = acc.get(k) ?? { clicks: 0, imps: 0, cost: 0 };
    // SECURITY: never use execution_amount / net_amount / supply_value / fee_rate
    prev.cost   += Number(r.cost ?? 0) || 0;
    prev.clicks += Number(r.clicks ?? 0) || 0;
    prev.imps   += Number(r.impressions ?? 0) || 0;
    acc.set(k, prev);
  }
  return acc;
}

// ── SVG Chart Helpers ────────────────────────────────────────────────────────

const DMP_COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

function renderLineChart(
  data: { label: string; value: number }[],
  chartLabel: string,
  color: string,
  width = 640,
  height = 160
): string {
  if (data.length === 0) return '<p style="color:#94a3b8;font-size:13px;">데이터 없음</p>';

  const pad = { top: 16, right: 24, bottom: 36, left: 60 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;

  const maxVal = Math.max(...data.map(d => d.value), 1);
  const minVal = 0;
  const range = maxVal - minVal || 1;

  const pts = data.map((d, i) => {
    const x = pad.left + (i / Math.max(data.length - 1, 1)) * w;
    const y = pad.top + h - ((d.value - minVal) / range) * h;
    return { x, y, ...d };
  });

  const polyline = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  // Area fill polygon
  const areaPoints = [
    `${pts[0].x.toFixed(1)},${(pad.top + h).toFixed(1)}`,
    ...pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`),
    `${pts[pts.length - 1].x.toFixed(1)},${(pad.top + h).toFixed(1)}`,
  ].join(' ');

  // X-axis labels — show every Nth label to avoid crowding
  const labelStep = Math.ceil(data.length / 8);
  const xLabels = pts
    .filter((_, i) => i % labelStep === 0 || i === data.length - 1)
    .map(p => `<text x="${p.x.toFixed(1)}" y="${(pad.top + h + 20).toFixed(1)}" text-anchor="middle" font-size="10" fill="#94a3b8">${p.label}</text>`)
    .join('');

  // Y-axis labels
  const yTicks = 4;
  const yLabels = Array.from({ length: yTicks + 1 }, (_, i) => {
    const val = minVal + (range * i) / yTicks;
    const y = pad.top + h - (i / yTicks) * h;
    const display = val >= 10000 ? `${(val / 10000).toFixed(0)}만` : Math.round(val).toLocaleString('ko-KR');
    return `<text x="${(pad.left - 8).toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-size="10" fill="#cbd5e1">${display}</text>
<line x1="${pad.left}" y1="${y.toFixed(1)}" x2="${(pad.left + w).toFixed(1)}" y2="${y.toFixed(1)}" stroke="#f1f5f9" stroke-width="1"/>`;
  }).join('');

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="display:block;max-width:100%;">
  <defs>
    <linearGradient id="areaGrad_${chartLabel}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  ${yLabels}
  <polygon points="${areaPoints}" fill="url(#areaGrad_${chartLabel})"/>
  <polyline points="${polyline}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
  ${pts.map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="${color}" stroke="white" stroke-width="1.5"/>`).join('')}
  ${xLabels}
</svg>`;
}

function renderPieChart(data: { name: string; value: number; color: string }[]): string {
  const filtered = data.filter(d => d.value > 0);
  if (filtered.length === 0) return '<p style="color:#94a3b8;font-size:13px;">데이터 없음</p>';

  const total = filtered.reduce((s, d) => s + d.value, 0) || 1;
  const cx = 100;
  const cy = 100;
  const r = 80;
  const innerR = 44;

  let currentAngle = -Math.PI / 2;
  const slices = filtered.map(d => {
    const angle = (d.value / total) * 2 * Math.PI;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    currentAngle = endAngle;

    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const ix1 = cx + innerR * Math.cos(endAngle);
    const iy1 = cy + innerR * Math.sin(endAngle);
    const ix2 = cx + innerR * Math.cos(startAngle);
    const iy2 = cy + innerR * Math.sin(startAngle);
    const largeArc = angle > Math.PI ? 1 : 0;

    const path = [
      `M ${x1.toFixed(2)} ${y1.toFixed(2)}`,
      `A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
      `L ${ix1.toFixed(2)} ${iy1.toFixed(2)}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix2.toFixed(2)} ${iy2.toFixed(2)}`,
      'Z',
    ].join(' ');

    return { ...d, path, pct: ((d.value / total) * 100).toFixed(1) };
  });

  const legend = slices.map((s, i) =>
    `<g transform="translate(215,${20 + i * 22})">
      <rect x="0" y="0" width="12" height="12" rx="3" fill="${s.color}"/>
      <text x="18" y="10" font-size="11" fill="#475569" font-family="Pretendard,sans-serif" font-weight="600">${s.name}</text>
      <text x="140" y="10" text-anchor="end" font-size="11" fill="#94a3b8" font-family="Pretendard,sans-serif">${s.pct}%</text>
    </g>`
  ).join('');

  return `<svg width="380" height="200" viewBox="0 0 380 200" xmlns="http://www.w3.org/2000/svg" style="display:block;max-width:100%;">
  ${slices.map(s => `<path d="${s.path}" fill="${s.color}" opacity="0.9"/>`).join('')}
  <circle cx="${cx}" cy="${cy}" r="32" fill="white"/>
  <text x="${cx}" y="${cy - 6}" text-anchor="middle" font-size="10" fill="#94a3b8" font-family="Pretendard,sans-serif" font-weight="800">총합</text>
  <text x="${cx}" y="${cy + 10}" text-anchor="middle" font-size="10" fill="#0f172a" font-family="Pretendard,sans-serif" font-weight="800">100%</text>
  ${legend}
</svg>`;
}

function renderHBarChart(data: { label: string; value: number }[], color: string): string {
  if (data.length === 0) return '<p style="color:#94a3b8;font-size:13px;">데이터 없음</p>';

  const maxVal = Math.max(...data.map(d => d.value), 1);
  const rowH = 28;
  const labelW = 80;
  const barMaxW = 260;
  const height = data.length * rowH + 16;

  const rows = data.map((d, i) => {
    const barW = (d.value / maxVal) * barMaxW;
    const y = 8 + i * rowH;
    const display = d.value >= 10000
      ? `${(d.value / 10000).toFixed(1)}만`
      : d.value.toLocaleString('ko-KR');
    return `
    <text x="${labelW - 8}" y="${y + 14}" text-anchor="end" font-size="11" fill="#475569" font-family="Pretendard,sans-serif" font-weight="600">${d.label}</text>
    <rect x="${labelW}" y="${y + 4}" width="${barW.toFixed(1)}" height="16" rx="4" fill="${color}" opacity="0.8"/>
    <text x="${(labelW + barW + 6).toFixed(1)}" y="${y + 14}" font-size="10" fill="#94a3b8" font-family="Pretendard,sans-serif">${display}</text>`;
  }).join('');

  return `<svg width="380" height="${height}" viewBox="0 0 380 ${height}" xmlns="http://www.w3.org/2000/svg" style="display:block;max-width:100%;">
  ${rows}
</svg>`;
}

function renderMiniBar(value: number, max: number, color: string): string {
  const w = max > 0 ? Math.round((value / max) * 80) : 0;
  return `<svg width="80" height="10" viewBox="0 0 80 10" xmlns="http://www.w3.org/2000/svg" style="display:inline-block;vertical-align:middle;">
  <rect x="0" y="2" width="80" height="6" rx="3" fill="#f1f5f9"/>
  <rect x="0" y="2" width="${w}" height="6" rx="3" fill="${color}"/>
</svg>`;
}

// ── Section Renderers ────────────────────────────────────────────────────────

function renderKpi(
  data: PerformanceRecord[],
  status: BudgetStatus,
  cfg: ReportBuilderConfig
): string {
  const totalImps   = data.reduce((s, r) => s + (Number(r.impressions) || 0), 0);
  const totalClicks = data.reduce((s, r) => s + (Number(r.clicks) || 0), 0);
  const totalCost   = data.reduce((s, r) => s + (Number(r.cost) || 0), 0);
  const ctr = totalImps > 0 ? (totalClicks / totalImps) * 100 : 0;
  const cpc = totalClicks > 0 ? totalCost / totalClicks : 0;

  // Determine date range for "기간 노출"
  const dates = data.map(r => new Date(r.date).getTime()).filter(t => !isNaN(t));
  const periodLabel = dates.length > 0
    ? `${new Date(Math.min(...dates)).toLocaleDateString('ko-KR')} ~ ${new Date(Math.max(...dates)).toLocaleDateString('ko-KR')}`
    : '-';

  const cards: string[] = [];

  cards.push(`<div class="kpi-card">
    <div class="kpi-icon" style="background:#eff6ff;color:#2563eb;">👁</div>
    <p class="kpi-label">총 노출수</p>
    <p class="kpi-value">${totalImps.toLocaleString('ko-KR')}</p>
  </div>`);

  cards.push(`<div class="kpi-card">
    <div class="kpi-icon" style="background:#f0fdf4;color:#16a34a;">🖱</div>
    <p class="kpi-label">총 클릭수</p>
    <p class="kpi-value">${totalClicks.toLocaleString('ko-KR')}</p>
  </div>`);

  if (cfg.show_ctr) {
    cards.push(`<div class="kpi-card">
      <div class="kpi-icon" style="background:#fef3c7;color:#d97706;">📊</div>
      <p class="kpi-label">CTR</p>
      <p class="kpi-value">${ctr.toFixed(2)}%</p>
    </div>`);
  }

  if (cfg.show_cpc) {
    cards.push(`<div class="kpi-card">
      <div class="kpi-icon" style="background:#fdf4ff;color:#9333ea;">💡</div>
      <p class="kpi-label">CPC</p>
      <p class="kpi-value">₩${Math.round(cpc).toLocaleString('ko-KR')}</p>
    </div>`);
  }

  if (cfg.show_spend) {
    cards.push(`<div class="kpi-card">
      <div class="kpi-icon" style="background:#fff1f2;color:#e11d48;">💰</div>
      <p class="kpi-label">총 집행액</p>
      <p class="kpi-value">₩${Math.round(totalCost).toLocaleString('ko-KR')}</p>
    </div>`);
  }

  cards.push(`<div class="kpi-card">
    <div class="kpi-icon" style="background:#f0f9ff;color:#0891b2;">📅</div>
    <p class="kpi-label">집행 기간</p>
    <p class="kpi-value" style="font-size:13px;">${periodLabel}</p>
  </div>`);

  return `
<section class="section" id="kpi">
  <h3 class="section-title">핵심 KPI 요약</h3>
  <div class="kpi-grid" style="grid-template-columns:repeat(${Math.min(cards.length, 3)},1fr);">
    ${cards.join('')}
  </div>
</section>`;
}

function renderTrend(data: PerformanceRecord[], cfg: ReportBuilderConfig): string {
  // Aggregate by date
  const byDate = sumBy(data, r => new Date(r.date).toISOString().split('T')[0] as any);
  const sorted = Array.from(byDate.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .slice(-31);

  if (sorted.length === 0) return '';

  const chartData = sorted.map(([label, v]) => ({
    label: label.slice(5), // MM-DD
    value: v.clicks,
  }));

  const chart = renderLineChart(chartData, 'trend_clicks', '#2563eb', 640, 160);

  const tableRows = [...sorted].reverse().map(([date, v]) => {
    const ctr = v.imps > 0 ? (v.clicks / v.imps) * 100 : 0;
    const cpc = v.clicks > 0 ? v.cost / v.clicks : 0;
    return `<tr>
      <td class="mono">${date}</td>
      ${cfg.show_impressions ? `<td class="num">${v.imps.toLocaleString('ko-KR')}</td>` : ''}
      <td class="num bold">${v.clicks.toLocaleString('ko-KR')}</td>
      ${cfg.show_ctr ? `<td class="num">${ctr.toFixed(2)}%</td>` : ''}
      ${cfg.show_cpc ? `<td class="num">₩${Math.round(cpc).toLocaleString('ko-KR')}</td>` : ''}
      ${cfg.show_spend ? `<td class="num">₩${Math.round(v.cost).toLocaleString('ko-KR')}</td>` : ''}
    </tr>`;
  }).join('');

  return `
<section class="section" id="trend">
  <h3 class="section-title">📈 일별 성과 트렌드</h3>
  <div class="chart-wrap">${chart}</div>
  <div class="table-wrap">
    <table>
      <thead><tr>
        <th>날짜</th>
        ${cfg.show_impressions ? '<th class="num">노출수</th>' : ''}
        <th class="num">클릭수</th>
        ${cfg.show_ctr ? '<th class="num">CTR</th>' : ''}
        ${cfg.show_cpc ? '<th class="num">CPC</th>' : ''}
        ${cfg.show_spend ? '<th class="num">집행액</th>' : ''}
      </tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>
</section>`;
}

function renderDmp(data: PerformanceRecord[], cfg: ReportBuilderConfig): string {
  const byDmp = sumBy(data, r => (String(r.dmp_type || r.dmp || 'DIRECT') as any));
  const sorted = Array.from(byDmp.entries()).sort((a, b) => b[1].clicks - a[1].clicks);
  if (sorted.length === 0) return '';

  const totalClicks = sorted.reduce((s, [, v]) => s + v.clicks, 0) || 1;

  const pieData = sorted.slice(0, 8).map(([name, v], i) => ({
    name,
    value: v.clicks,
    color: DMP_COLORS[i % DMP_COLORS.length],
  }));
  const pie = renderPieChart(pieData);

  const maxClicks = Math.max(...sorted.map(([, v]) => v.clicks), 1);

  const tableRows = sorted.map(([name, v], i) => {
    const pct = ((v.clicks / totalClicks) * 100).toFixed(1);
    const ctr = v.imps > 0 ? (v.clicks / v.imps) * 100 : 0;
    const color = DMP_COLORS[i % DMP_COLORS.length];
    const isDirect = name === 'DIRECT' || name === 'Unknown';
    return `<tr${isDirect ? ' style="opacity:0.55;"' : ''}>
      <td><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${color};margin-right:8px;vertical-align:middle;"></span><strong>${name}</strong></td>
      <td class="num bold">${v.clicks.toLocaleString('ko-KR')}</td>
      ${cfg.show_impressions ? `<td class="num">${v.imps.toLocaleString('ko-KR')}</td>` : ''}
      ${cfg.show_ctr ? `<td class="num">${ctr.toFixed(2)}%</td>` : ''}
      <td class="num">${pct}%</td>
      <td>${renderMiniBar(v.clicks, maxClicks, color)}</td>
      ${cfg.show_spend ? `<td class="num">₩${Math.round(v.cost).toLocaleString('ko-KR')}</td>` : ''}
    </tr>`;
  }).join('');

  return `
<section class="section" id="dmp">
  <h3 class="section-title">🎯 DMP 타겟 분석</h3>
  <div class="chart-wrap" style="display:flex;align-items:center;gap:24px;flex-wrap:wrap;">${pie}</div>
  <div class="table-wrap">
    <table>
      <thead><tr>
        <th>DMP</th>
        <th class="num">클릭수</th>
        ${cfg.show_impressions ? '<th class="num">노출수</th>' : ''}
        ${cfg.show_ctr ? '<th class="num">CTR</th>' : ''}
        <th class="num">점유율</th>
        <th>분포</th>
        ${cfg.show_spend ? '<th class="num">집행액</th>' : ''}
      </tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>
</section>`;
}

function renderAudience(data: PerformanceRecord[]): string {
  const hasAudience = data.some(r => r.age || r.gender);

  if (!hasAudience) {
    return `
<section class="section" id="audience">
  <h3 class="section-title">👥 오디언스 현황</h3>
  <p class="empty-notice">연령/성별 데이터가 포함된 CSV를 업로드하면 표시됩니다.</p>
</section>`;
  }

  const byAge = sumBy(data.filter(r => r.age), r => (String(r.age) as any));
  const byGender = sumBy(data.filter(r => r.gender), r => (String(r.gender) as any));

  const ageRows = Array.from(byAge.entries())
    .filter(([k]) => k !== 'Unknown')
    .sort((a, b) => b[1].clicks - a[1].clicks)
    .slice(0, 8)
    .map(([label, v]) => ({ label, value: v.clicks }));

  const genderRows = Array.from(byGender.entries())
    .filter(([k]) => k !== 'Unknown')
    .sort((a, b) => b[1].clicks - a[1].clicks)
    .map(([label, v]) => ({ label, value: v.clicks }));

  const ageChart   = renderHBarChart(ageRows, '#2563eb');
  const genderChart = renderHBarChart(genderRows, '#10b981');

  return `
<section class="section" id="audience">
  <h3 class="section-title">👥 오디언스 현황</h3>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;flex-wrap:wrap;">
    <div>
      <p class="chart-sublabel">연령별 클릭 분포</p>
      <div class="chart-wrap">${ageChart}</div>
    </div>
    <div>
      <p class="chart-sublabel">성별 클릭 분포</p>
      <div class="chart-wrap">${genderChart}</div>
    </div>
  </div>
</section>`;
}

function renderCreative(data: PerformanceRecord[], cfg: ReportBuilderConfig): string {
  const byCreative = sumBy(data, r => (String(r.creative_name || 'N/A') as any));
  const sorted = Array.from(byCreative.entries()).sort((a, b) => b[1].clicks - a[1].clicks).slice(0, 10);
  if (sorted.length === 0) return '';

  const maxClicks = Math.max(...sorted.map(([, v]) => v.clicks), 1);

  const rows = sorted.map(([name, v]) => {
    const ctr = v.imps > 0 ? (v.clicks / v.imps) * 100 : 0;
    return `<tr>
      <td class="bold">${name}</td>
      <td class="num bold">${v.clicks.toLocaleString('ko-KR')}</td>
      ${cfg.show_impressions ? `<td class="num">${v.imps.toLocaleString('ko-KR')}</td>` : ''}
      ${cfg.show_ctr ? `<td class="num">${ctr.toFixed(2)}%</td>` : ''}
      <td>${renderMiniBar(v.clicks, maxClicks, '#2563eb')}</td>
    </tr>`;
  }).join('');

  return `
<section class="section" id="creative">
  <h3 class="section-title">🎨 소재 성과 (상위 10개)</h3>
  <div class="table-wrap">
    <table>
      <thead><tr>
        <th>소재명</th>
        <th class="num">클릭수</th>
        ${cfg.show_impressions ? '<th class="num">노출수</th>' : ''}
        ${cfg.show_ctr ? '<th class="num">CTR</th>' : ''}
        <th>분포</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</section>`;
}

function renderPlacement(data: PerformanceRecord[], cfg: ReportBuilderConfig): string {
  const byPlacement = sumBy(data, r => (String(r.placement || 'Unknown') as any));
  const sorted = Array.from(byPlacement.entries()).sort((a, b) => b[1].clicks - a[1].clicks).slice(0, 20);
  if (sorted.length === 0) return '';

  const totalClicks = sorted.reduce((s, [, v]) => s + v.clicks, 0) || 1;

  const rows = sorted.map(([placement, v]) => {
    const ctr = v.imps > 0 ? (v.clicks / v.imps) * 100 : 0;
    const pct = ((v.clicks / totalClicks) * 100).toFixed(1);
    return `<tr>
      <td class="bold">${placement}</td>
      <td class="num bold">${v.clicks.toLocaleString('ko-KR')}</td>
      ${cfg.show_impressions ? `<td class="num">${v.imps.toLocaleString('ko-KR')}</td>` : ''}
      ${cfg.show_ctr ? `<td class="num">${ctr.toFixed(2)}%</td>` : ''}
      <td class="num">${pct}%</td>
    </tr>`;
  }).join('');

  return `
<section class="section" id="placement">
  <h3 class="section-title">📍 게재지면 분석</h3>
  <div class="table-wrap">
    <table>
      <thead><tr>
        <th>게재지면</th>
        <th class="num">클릭수</th>
        ${cfg.show_impressions ? '<th class="num">노출수</th>' : ''}
        ${cfg.show_ctr ? '<th class="num">CTR</th>' : ''}
        <th class="num">점유율</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</section>`;
}

function renderBudget(
  campaign: CampaignConfig,
  data: PerformanceRecord[],
  cfg: ReportBuilderConfig
): string {
  const subs = (campaign.sub_campaigns || []).filter(s => s.enabled !== false);
  if (subs.length === 0) return '';

  const rows = subs.map(sub => {
    const mKey = sub.mapping_value || sub.excel_name || '';
    const subRows = data.filter(r =>
      mKey
        ? r.excel_campaign_name === mKey || r.mapping_value === mKey
        : r.media === sub.media
    );
    // SECURITY: use cost only
    const spent = subRows.reduce((s, r) => s + (Number(r.cost) || 0), 0);
    const pacing = sub.budget > 0 ? (spent / sub.budget) * 100 : 0;

    let statusBadge: string;
    let statusColor: string;
    if (pacing >= 90) {
      statusBadge = 'Over';
      statusColor = '#dc2626';
    } else if (pacing < 50) {
      statusBadge = 'Under';
      statusColor = '#f59e0b';
    } else {
      statusBadge = 'Normal';
      statusColor = '#16a34a';
    }

    const budgetCell = cfg.show_budget
      ? `<td class="num">₩${Math.round(sub.budget || 0).toLocaleString('ko-KR')}</td>`
      : '<td class="num muted">비공개</td>';

    const spendCell = cfg.show_spend
      ? `<td class="num">₩${Math.round(spent).toLocaleString('ko-KR')}</td>`
      : '<td class="num muted">-</td>';

    return `<tr>
      <td class="bold">${sub.media}</td>
      ${budgetCell}
      ${spendCell}
      <td class="num">${pacing.toFixed(1)}%
        ${renderMiniBar(Math.min(pacing, 100), 100, statusColor)}
      </td>
      <td><span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:10px;font-weight:800;background:${statusColor}1a;color:${statusColor};">${statusBadge}</span></td>
    </tr>`;
  }).join('');

  return `
<section class="section" id="budget">
  <h3 class="section-title">💰 예산 집행 현황</h3>
  <div class="table-wrap">
    <table>
      <thead><tr>
        <th>매체명</th>
        <th class="num">예산</th>
        <th class="num">집행</th>
        <th class="num">소진률</th>
        <th>상태</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</section>`;
}

function renderInsights(
  campaign: CampaignConfig,
  cfg: ReportBuilderConfig
): string {
  const parts: string[] = [];
  if (campaign.insights) {
    parts.push(`<div class="insight-block">
      <p class="chart-sublabel">캠페인 인사이트</p>
      <p style="white-space:pre-wrap;color:#334155;font-size:14px;line-height:1.7;">${campaign.insights}</p>
    </div>`);
  }
  if (cfg.custom_notes) {
    parts.push(`<div class="insight-block" style="margin-top:16px;">
      <p class="chart-sublabel">담당자 메모</p>
      <p style="white-space:pre-wrap;color:#334155;font-size:14px;line-height:1.7;">${cfg.custom_notes}</p>
    </div>`);
  }
  if (parts.length === 0) return '';

  return `
<section class="section" id="insights">
  <h3 class="section-title">💡 캠페인 인사이트</h3>
  ${parts.join('')}
</section>`;
}

// ── HTML Skeleton ────────────────────────────────────────────────────────────

const REPORT_CSS = `
  @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');

  :root {
    --primary: #2563eb;
    --primary-50: #eff6ff;
    --slate-900: #0f172a;
    --slate-700: #334155;
    --slate-500: #64748b;
    --slate-400: #94a3b8;
    --slate-200: #e2e8f0;
    --slate-100: #f1f5f9;
    --emerald: #10b981;
    --amber: #f59e0b;
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #f8fafc;
    color: var(--slate-900);
    padding: 40px 20px;
    line-height: 1.5;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .container { max-width: 960px; margin: 0 auto; }

  /* ── Cover ── */
  .report-cover {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    padding: 48px 0 32px;
    margin-bottom: 4px;
  }
  .report-label {
    font-size: 11px;
    font-weight: 800;
    color: var(--primary);
    letter-spacing: 2px;
    text-transform: uppercase;
    margin-bottom: 10px;
  }
  .client-name {
    font-size: 36px;
    font-weight: 800;
    letter-spacing: -1.5px;
    color: var(--slate-900);
    line-height: 1.15;
  }
  .report-period {
    font-size: 14px;
    color: var(--slate-500);
    font-weight: 600;
    margin-top: 6px;
  }
  .report-title-sub {
    font-size: 13px;
    color: var(--slate-400);
    font-weight: 500;
    margin-top: 2px;
  }
  .cover-right { text-align: right; }
  .agency-badge {
    display: inline-block;
    padding: 6px 16px;
    border-radius: 8px;
    background: var(--primary);
    color: white;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 1px;
  }
  .generated-date { font-size: 12px; color: var(--slate-400); margin-top: 8px; font-weight: 600; }
  .cover-divider {
    height: 3px;
    background: linear-gradient(90deg, var(--primary), #7c3aed);
    border-radius: 2px;
    margin-bottom: 40px;
  }

  /* ── KPI Grid ── */
  .kpi-grid {
    display: grid;
    gap: 16px;
    margin-bottom: 4px;
  }
  .kpi-card {
    background: white;
    border: 1px solid var(--slate-200);
    border-radius: 20px;
    padding: 22px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  }
  .kpi-icon {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    margin-bottom: 12px;
    line-height: 1;
  }
  .kpi-label {
    font-size: 10px;
    font-weight: 800;
    color: var(--slate-400);
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 6px;
  }
  .kpi-value {
    font-size: 22px;
    font-weight: 800;
    color: var(--slate-900);
    letter-spacing: -0.5px;
  }

  /* ── Sections ── */
  .section {
    margin-bottom: 48px;
    padding-top: 4px;
  }
  .section-title {
    font-size: 18px;
    font-weight: 800;
    color: var(--slate-900);
    margin-bottom: 20px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--slate-100);
  }

  /* ── Chart ── */
  .chart-wrap {
    background: white;
    border: 1px solid var(--slate-200);
    border-radius: 20px;
    padding: 24px;
    margin-bottom: 20px;
    overflow: hidden;
  }
  .chart-sublabel {
    font-size: 11px;
    font-weight: 800;
    color: var(--slate-400);
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 12px;
  }

  /* ── Table ── */
  .table-wrap {
    background: white;
    border: 1px solid var(--slate-200);
    border-radius: 20px;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  }
  table { width: 100%; border-collapse: collapse; }
  th {
    background: var(--slate-100);
    text-align: left;
    padding: 12px 20px;
    font-size: 10px;
    font-weight: 800;
    color: var(--slate-400);
    text-transform: uppercase;
    letter-spacing: 1px;
    border-bottom: 1px solid var(--slate-200);
  }
  th.num, td.num { text-align: right; }
  td {
    padding: 13px 20px;
    font-size: 13px;
    color: var(--slate-700);
    border-bottom: 1px solid var(--slate-100);
    vertical-align: middle;
  }
  tr:last-child td { border-bottom: none; }
  tbody tr:nth-child(even) { background: #fafafa; }
  .bold { font-weight: 700; color: var(--slate-900); }
  .mono { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 12px; font-weight: 600; }
  .muted { color: var(--slate-400); font-style: italic; }

  /* ── Insights ── */
  .insight-block {
    background: var(--primary-50);
    border-left: 4px solid var(--primary);
    border-radius: 0 16px 16px 0;
    padding: 20px 24px;
  }

  /* ── Empty ── */
  .empty-notice {
    background: var(--slate-100);
    border-radius: 16px;
    padding: 32px;
    text-align: center;
    color: var(--slate-400);
    font-size: 13px;
    font-weight: 600;
  }

  /* ── Footer ── */
  .report-footer {
    margin-top: 56px;
    padding-top: 24px;
    border-top: 1px solid var(--slate-200);
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    color: var(--slate-400);
    font-weight: 600;
  }

  /* ── Print ── */
  @media print {
    body { background: white; padding: 0; }
    .section { page-break-inside: avoid; }
    .table-wrap { box-shadow: none; border: 1px solid #e2e8f0; }
    .chart-wrap { box-shadow: none; }
  }
`;

// ── Public API ───────────────────────────────────────────────────────────────

export class ReportService {
  /**
   * Generate a client-facing HTML report.
   *
   * Overload 1: new signature — config-driven (ReportBuilderConfig)
   * Overload 2: legacy — layout?: string[]  (backward compat, auto-creates a safe default config)
   */
  public static generateHtmlReport(
    campaign: CampaignConfig,
    data: PerformanceRecord[],
    status: BudgetStatus,
    configOrLayout?: ReportBuilderConfig | string[]
  ): string {
    // Resolve config
    let cfg: ReportBuilderConfig;
    if (!configOrLayout) {
      cfg = buildLegacyConfig(campaign);
    } else if (Array.isArray(configOrLayout)) {
      cfg = buildLegacyConfig(campaign, configOrLayout);
    } else {
      cfg = configOrLayout;
    }

    const today = new Date().toLocaleDateString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric',
    });

    const sectionHtml = cfg.sections
      .map(id => {
        switch (id) {
          case 'kpi':       return renderKpi(data, status, cfg);
          case 'trend':     return renderTrend(data, cfg);
          case 'dmp':       return renderDmp(data, cfg);
          case 'audience':  return renderAudience(data);
          case 'creative':  return renderCreative(data, cfg);
          case 'placement': return renderPlacement(data, cfg);
          case 'budget':    return renderBudget(campaign, data, cfg);
          case 'insights':  return renderInsights(campaign, cfg);
          default:          return '';
        }
      })
      .filter(Boolean)
      .join('\n');

    const clientDisplay = cfg.client_name || campaign.campaign_name;

    return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${cfg.report_title || clientDisplay} - 광고 성과 보고서</title>
  <style>${REPORT_CSS}</style>
</head>
<body>
  <div class="container">

    <header>
      <div class="report-cover">
        <div class="cover-left">
          <div class="report-label">광고 성과 보고서</div>
          <h1 class="client-name">${clientDisplay}</h1>
          ${cfg.report_period ? `<p class="report-period">${cfg.report_period}</p>` : ''}
          ${cfg.report_title ? `<p class="report-title-sub">${cfg.report_title}</p>` : ''}
        </div>
        <div class="cover-right">
          <div class="agency-badge">${cfg.agency_name || 'GFA RAW'}</div>
          <p class="generated-date">발행일: ${today}</p>
        </div>
      </div>
      <div class="cover-divider"></div>
    </header>

    ${sectionHtml}

    <footer class="report-footer">
      <span>${cfg.agency_name || ''}</span>
      <span>발행일 ${today}</span>
    </footer>

  </div>
</body>
</html>`;
  }
}

// ── Legacy Config Builder ────────────────────────────────────────────────────

function buildLegacyConfig(
  campaign: CampaignConfig,
  layout?: string[]
): ReportBuilderConfig {
  const rawLayout = layout && layout.length > 0
    ? layout
    : (campaign.dashboard_layout && campaign.dashboard_layout.length > 0
      ? campaign.dashboard_layout
      : ['kpi', 'trend', 'dmp', 'audience', 'creative', 'placement', 'budget', 'insights']);

  // Map old section IDs to new ones (share→dmp, matrix→placement)
  const sectionMap: Record<string, string> = {
    share: 'dmp',
    matrix: 'placement',
    trend: 'trend',
    budget: 'budget',
    audience: 'audience',
    creative: 'creative',
    insights: 'insights',
    kpi: 'kpi',
    dmp: 'dmp',
    placement: 'placement',
  };

  const sections = Array.from(new Set(rawLayout.map(id => sectionMap[id] || id).filter(Boolean)));

  return {
    client_name: campaign.campaign_name,
    report_title: `${campaign.campaign_name} 광고 성과 보고서`,
    report_period: '',
    agency_name: 'GFA RAW',
    sections,
    // Legacy: hide spend/budget by default for safety
    show_spend: false,
    show_budget: false,
    show_cpc: true,
    show_ctr: true,
    show_impressions: true,
    custom_notes: '',
  };
}
