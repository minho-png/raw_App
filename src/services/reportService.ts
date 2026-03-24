import { CampaignConfig, PerformanceRecord, BudgetStatus } from "../types";

export class ReportService {
  public static generateHtmlReport(
    campaign: CampaignConfig,
    data: PerformanceRecord[],
    status: BudgetStatus,
    layout?: string[]
  ): string {
    const today = new Date().toLocaleDateString();
    
    // Sort data for the table
    const sortedData = [...data].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const dashboardLayout = (layout && layout.length > 0)
      ? Array.from(new Set(layout))
      : (campaign.dashboard_layout && campaign.dashboard_layout.length > 0
        ? Array.from(new Set(campaign.dashboard_layout))
        : ['trend', 'share', 'budget', 'audience', 'creative', 'matrix', 'insights']);

    const sumBy = <T extends string>(rows: PerformanceRecord[], keyFn: (r: PerformanceRecord) => T) => {
      const acc = new Map<T, { spend: number; clicks: number; imps: number }>();
      for (const r of rows) {
        const k = keyFn(r);
        const prev = acc.get(k) || { spend: 0, clicks: 0, imps: 0 };
        prev.spend += Number(r.execution_amount ?? r.cost ?? 0) || 0;
        prev.clicks += Number(r.clicks ?? 0) || 0;
        prev.imps += Number(r.impressions ?? 0) || 0;
        acc.set(k, prev);
      }
      return acc;
    };

    const renderSection = (id: string) => {
      if (id === 'trend') {
        return `
          <h3>📈 Trend (Daily)</h3>
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th class="text-right">Execution</th>
                  <th class="text-right">Clicks</th>
                  <th class="text-right">Impressions</th>
                  <th class="text-right">CPC</th>
                  <th class="text-right">CTR</th>
                </tr>
              </thead>
              <tbody>
                ${(() => {
                  const daily = sumBy(sortedData, (r) => new Date(r.date).toISOString().split('T')[0] as any);
                  const rows = Array.from(daily.entries())
                    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
                    .slice(0, 31);
                  return rows.map(([date, v]) => {
                    const cpc = v.clicks > 0 ? v.spend / v.clicks : 0;
                    const ctr = v.imps > 0 ? (v.clicks / v.imps) * 100 : 0;
                    return `
                      <tr>
                        <td class="font-mono">${date}</td>
                        <td class="text-right bold">₩${Math.round(v.spend).toLocaleString()}</td>
                        <td class="text-right">${Math.round(v.clicks).toLocaleString()}</td>
                        <td class="text-right">${Math.round(v.imps).toLocaleString()}</td>
                        <td class="text-right">₩${Math.round(cpc).toLocaleString()}</td>
                        <td class="text-right">${ctr.toFixed(2)}%</td>
                      </tr>
                    `;
                  }).join('');
                })()}
              </tbody>
            </table>
          </div>
        `;
      }

      if (id === 'share') {
        const dmpData = sortedData.filter(r => r.dmp_type && r.dmp_type !== 'DIRECT');
        const directData = sortedData.filter(r => !r.dmp_type || r.dmp_type === 'DIRECT');
        const byDmp = sumBy(sortedData, (r) => (String(r.dmp || r.dmp_type || 'DIRECT') as any));
        const rows = Array.from(byDmp.entries()).sort((a, b) => b[1].spend - a[1].spend).slice(0, 20);
        const totalDmpSpend = dmpData.reduce((s, r) => s + (Number(r.execution_amount ?? r.cost ?? 0) || 0), 0);
        const totalDirectSpend = directData.reduce((s, r) => s + (Number(r.execution_amount ?? r.cost ?? 0) || 0), 0);
        return `
          <h3>🧩 DMP Share</h3>
          <div class="dmp-split" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
            <div class="card" style="border-left:4px solid #2563eb;">
              <p class="card-label">DMP 타겟</p>
              <p class="card-value highlight">₩${Math.round(totalDmpSpend).toLocaleString()}</p>
            </div>
            <div class="card" style="border-left:4px solid #94a3b8;">
              <p class="card-label">Direct (비타겟)</p>
              <p class="card-value" style="color:#94a3b8;">₩${Math.round(totalDirectSpend).toLocaleString()}</p>
            </div>
          </div>
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>DMP</th>
                  <th class="text-right">Execution</th>
                  <th class="text-right">Share</th>
                </tr>
              </thead>
              <tbody>
                ${(() => {
                  const total = rows.reduce((s, [, v]) => s + v.spend, 0) || 1;
                  return rows.map(([name, v]) => {
                    const share = (v.spend / total) * 100;
                    const isUnknown = name === 'Unknown' || name === 'DIRECT';
                    return `
                      <tr style="${isUnknown ? 'opacity:0.45;' : ''}">
                        <td class="${isUnknown ? '' : 'bold'}" style="${isUnknown ? 'color:#94a3b8;' : ''}">${name}</td>
                        <td class="text-right" style="${isUnknown ? 'color:#94a3b8;' : ''}">₩${Math.round(v.spend).toLocaleString()}</td>
                        <td class="text-right" style="${isUnknown ? 'color:#94a3b8;' : ''}">${share.toFixed(1)}%</td>
                      </tr>
                    `;
                  }).join('');
                })()}
              </tbody>
            </table>
          </div>
        `;
      }

      if (id === 'budget') {
        const subs = (campaign.sub_campaigns || []).filter(s => s.enabled !== false);
        if (subs.length === 0) return '';
        return `
          <h3>💳 Budget Alignment</h3>
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Media</th>
                  <th>Mapping</th>
                  <th class="text-right">Budget</th>
                  <th class="text-right">Execution</th>
                  <th class="text-right">Pacing</th>
                  <th>Placement</th>
                </tr>
              </thead>
              <tbody>
                ${subs.map((sub) => {
                  const mKey = sub.mapping_value || sub.excel_name || '';
                  const rows = sortedData.filter(r => (mKey ? (r.excel_campaign_name === mKey || r.mapping_value === mKey) : r.media === sub.media));
                  const spend = rows.reduce((s, r) => s + (Number(r.execution_amount ?? r.cost ?? 0) || 0), 0);
                  const pacing = sub.budget > 0 ? (spend / sub.budget) * 100 : 0;
                  const placements = Array.from(new Set(rows.map(r => String(r.placement || 'Unknown')))).slice(0, 3).join(', ');
                  const statusClass = pacing > 90 ? 'text-red' : 'text-blue';
                  return `
                    <tr>
                      <td class="bold">${sub.media}</td>
                      <td>${mKey || '-'}</td>
                      <td class="text-right">₩${Math.round(sub.budget || 0).toLocaleString()}</td>
                      <td class="text-right">₩${Math.round(spend).toLocaleString()}</td>
                      <td class="text-right ${statusClass}">${pacing.toFixed(1)}%</td>
                      <td>${placements || 'Unknown'}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `;
      }

      if (id === 'audience') {
        const audienceData = sortedData.filter(r => (r as any).age || (r as any).gender);
        const byAge = sumBy(audienceData.length > 0 ? audienceData : sortedData, (r) => (String((r as any).age || 'Unknown') as any));
        const byGender = sumBy(audienceData.length > 0 ? audienceData : sortedData, (r) => (String((r as any).gender || 'Unknown') as any));
        const ageRows = Array.from(byAge.entries()).sort((a, b) => b[1].spend - a[1].spend).slice(0, 8);
        const genderRows = Array.from(byGender.entries()).sort((a, b) => b[1].spend - a[1].spend).slice(0, 8);
        const renderAudienceRow = (k: string, v: { spend: number }) =>
          `<p style="display:flex;justify-content:space-between;margin-top:6px;${k === 'Unknown' ? 'opacity:0.4;' : ''}">
            <span class="${k === 'Unknown' ? '' : 'bold'}" style="${k === 'Unknown' ? 'color:#94a3b8;' : ''}">${k}</span>
            <span class="font-mono" style="${k === 'Unknown' ? 'color:#94a3b8;' : ''}">₩${Math.round(v.spend).toLocaleString()}</span>
          </p>`;
        return `
          <h3>👥 Audience Intelligence</h3>
          <div class="summary-grid" style="grid-template-columns: repeat(2, 1fr);">
            <div class="card">
              <p class="card-label">연령 (Age)</p>
              ${ageRows.map(([k, v]) => renderAudienceRow(k, v)).join('')}
            </div>
            <div class="card">
              <p class="card-label">성별 (Gender)</p>
              ${genderRows.map(([k, v]) => renderAudienceRow(k, v)).join('')}
            </div>
          </div>
        `;
      }

      if (id === 'creative') {
        const byCreative = sumBy(sortedData, (r) => (String((r as any).creative_name || 'N/A') as any));
        const rows = Array.from(byCreative.entries()).sort((a, b) => b[1].spend - a[1].spend).slice(0, 10);
        return `
          <h3>🎨 Creative (Top 10)</h3>
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Creative</th>
                  <th class="text-right">Execution</th>
                  <th class="text-right">Clicks</th>
                  <th class="text-right">Impressions</th>
                  <th class="text-right">CTR</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(([name, v]) => {
                  const ctr = v.imps > 0 ? (v.clicks / v.imps) * 100 : 0;
                  return `
                    <tr>
                      <td class="bold">${name}</td>
                      <td class="text-right">₩${Math.round(v.spend).toLocaleString()}</td>
                      <td class="text-right">${Math.round(v.clicks).toLocaleString()}</td>
                      <td class="text-right">${Math.round(v.imps).toLocaleString()}</td>
                      <td class="text-right">${ctr.toFixed(2)}%</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `;
      }

      if (id === 'matrix') {
        // Keep lightweight: placement-aware rollup (campaign x placement)
        const byPlacement = sumBy(sortedData, (r) => (String(r.placement || 'Unknown') as any));
        const rows = Array.from(byPlacement.entries()).sort((a, b) => b[1].spend - a[1].spend).slice(0, 20);
        return `
          <h3>🧱 Placement Matrix</h3>
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Placement</th>
                  <th class="text-right">Execution</th>
                  <th class="text-right">Clicks</th>
                  <th class="text-right">Impressions</th>
                  <th class="text-right">CTR</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(([p, v]) => {
                  const ctr = v.imps > 0 ? (v.clicks / v.imps) * 100 : 0;
                  return `
                    <tr>
                      <td class="bold">${p}</td>
                      <td class="text-right">₩${Math.round(v.spend).toLocaleString()}</td>
                      <td class="text-right">${Math.round(v.clicks).toLocaleString()}</td>
                      <td class="text-right">${Math.round(v.imps).toLocaleString()}</td>
                      <td class="text-right">${ctr.toFixed(2)}%</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `;
      }

      if (id === 'insights') {
        return campaign.insights ? `
          <div class="insights">
            <h3 style="margin-bottom: 12px; color: var(--primary);">💡 Campaign Insights</h3>
            <p style="color: var(--slate-600); white-space: pre-wrap; font-size: 15px; font-weight: 500;">${campaign.insights}</p>
          </div>
        ` : '';
      }

      return '';
    };

    return `
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${campaign.campaign_name} - 성과 보고서</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Pretendard:wght@400;600;800&display=swap');
        
        :root {
            --primary: #2563eb;
            --primary-light: #eff6ff;
            --slate-900: #0f172a;
            --slate-600: #475569;
            --slate-400: #94a3b8;
            --slate-100: #f1f5f9;
            --emerald: #10b981;
            --amber: #f59e0b;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: 'Pretendard', sans-serif;
        }

        body {
            background-color: #f8fafc;
            color: var(--slate-900);
            padding: 40px 20px;
            line-height: 1.5;
        }

        .container {
            max-width: 1000px;
            margin: 0 auto;
        }

        /* Header */
        header {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            margin-bottom: 40px;
        }

        .brand-pill {
            display: inline-block;
            background: var(--primary);
            color: white;
            padding: 4px 12px;
            border-radius: 6px;
            font-size: 10px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 8px;
        }

        h1 {
            font-size: 32px;
            font-weight: 800;
            letter-spacing: -1px;
        }

        .report-date {
            color: var(--slate-400);
            font-weight: 600;
            font-size: 14px;
        }

        /* Summary Grid */
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 20px;
            margin-bottom: 40px;
        }

        .card {
            background: white;
            padding: 24px;
            border-radius: 24px;
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03);
            border: 1px solid var(--slate-100);
        }

        .card-label {
            font-size: 11px;
            font-weight: 800;
            color: var(--slate-400);
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 8px;
        }

        .card-value {
            font-size: 20px;
            font-weight: 800;
        }

        .card-value.highlight { color: var(--primary); }
        .card-value.emerald { color: var(--emerald); }

        /* Pacing Section */
        .pacing-section {
            background: var(--slate-900);
            color: white;
            padding: 32px;
            border-radius: 32px;
            margin-bottom: 40px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .pacing-info h2 {
            font-size: 48px;
            font-weight: 800;
            letter-spacing: -2px;
        }

        .progress-container {
            width: 200px;
            height: 8px;
            background: rgba(255,255,255,0.1);
            border-radius: 4px;
            margin-top: 12px;
            overflow: hidden;
        }

        .progress-bar {
            height: 100%;
            background: linear-gradient(90deg, #60a5fa, #3b82f6);
            border-radius: 4px;
        }

        /* Tables */
        h3 {
            font-size: 20px;
            font-weight: 800;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .table-container {
            background: white;
            border-radius: 24px;
            overflow: hidden;
            border: 1px solid var(--slate-100);
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
        }

        table {
            width: 100%;
            border-collapse: collapse;
        }

        th {
            background: #f8fafc;
            text-align: left;
            padding: 16px 24px;
            font-size: 11px;
            font-weight: 800;
            color: var(--slate-400);
            text-transform: uppercase;
            letter-spacing: 1px;
            border-bottom: 1px solid var(--slate-100);
        }

        td {
            padding: 16px 24px;
            font-size: 14px;
            color: var(--slate-600);
            border-bottom: 1px solid var(--slate-100);
        }

        tr:last-child td { border-bottom: none; }

        .font-mono { font-family: monospace; font-weight: 600; }
        .text-right { text-align: right; }
        .bold { font-weight: 800; color: var(--slate-900); }
        .text-blue { color: var(--primary); font-weight: 800; }
        .text-red { color: #dc2626; font-weight: 800; }

        .badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 800;
            background: var(--slate-100);
            color: var(--slate-400);
        }

        .insights {
            background: var(--primary-light);
            padding: 24px;
            border-radius: 24px;
            margin-top: 40px;
            border-left: 4px solid var(--primary);
        }

        .footer {
            margin-top: 60px;
            text-align: center;
            color: var(--slate-400);
            font-size: 12px;
            font-weight: 600;
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <div>
                <span class="brand-pill">GFA RAW MASTER PRO</span>
                <h1>${campaign.campaign_name}</h1>
                <p style="color: var(--slate-400); margin-top: 4px; font-weight: 600;">Marketing Performance Analytics Report</p>
            </div>
            <div class="report-date">발행일: ${today}</div>
        </header>

        <div class="pacing-section">
            <div class="pacing-info">
                <span style="color: var(--slate-400); font-weight: 800; font-size: 11px; letter-spacing: 2px;">CAMPAIGN PACING</span>
                <h2>${Math.round(status.burn_rate)}% <span style="font-size: 24px; color: rgba(255,255,255,0.4); vertical-align: middle;">집행 중</span></h2>
                <div class="progress-container">
                    <div class="progress-bar" style="width: ${Math.min(100, status.burn_rate)}%"></div>
                </div>
            </div>
            <div style="text-align: right;">
                <div style="margin-bottom: 16px;">
                    <p style="color: var(--slate-400); font-size: 10px; font-weight: 800; margin-bottom: 4px;">REMAINING BUDGET</p>
                    <p style="font-size: 24px; font-weight: 800;">₩${Math.round(status.remaining).toLocaleString()}</p>
                </div>
                <div>
                    <p style="color: #10b981; font-size: 10px; font-weight: 800; margin-bottom: 4px;">ESTIMATED PACING</p>
                    <p style="font-size: 14px; color: #10b981; font-weight: 800;">Stable Execution</p>
                </div>
            </div>
        </div>

        <div class="summary-grid">
            <div class="card">
                <p class="card-label">Total Budget</p>
                <p class="card-value">₩${Math.round(status.total_budget).toLocaleString()}</p>
            </div>
            <div class="card">
                <p class="card-label">Actual Spend</p>
                <p class="card-value highlight">₩${Math.round(status.spent).toLocaleString()}</p>
            </div>
            <div class="card">
                <p class="card-label">Actual CPC</p>
                <p class="card-value">₩${Math.round(status.actual_cpc).toLocaleString()}</p>
            </div>
            <div class="card">
                <p class="card-label">Actual CTR</p>
                <p class="card-value emerald">${status.actual_ctr.toFixed(2)}%</p>
            </div>
        </div>

        ${dashboardLayout.map(renderSection).join('<div style="height: 28px;"></div>')}

        <div class="footer">
            &copy; 2026 GFA RAW MASTER PRO. All rights reserved. <br/>
            본 리포트는 시스템에 의해 자동 생성된 실시간 데이터 분석 자료입니다.
        </div>
    </div>
</body>
</html>
    `;
  }
}
