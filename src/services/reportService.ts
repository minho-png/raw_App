import { CampaignConfig, PerformanceRecord, BudgetStatus } from "../types";

export class ReportService {
  public static generateHtmlReport(
    campaign: CampaignConfig,
    data: PerformanceRecord[],
    status: BudgetStatus
  ): string {
    const today = new Date().toLocaleDateString();
    
    // Sort data for the table
    const sortedData = [...data].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

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

        <h3>📅 Daily Performance Log</h3>
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Campaign Group</th>
                        <th>DMP</th>
                        <th class="text-right">Impressions</th>
                        <th class="text-right">Clicks</th>
                        <th class="text-right">Execution Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${sortedData.map(row => `
                        <tr>
                            <td class="font-mono">${new Date(row.date).toISOString().split('T')[0]}</td>
                            <td class="bold">${row.excel_campaign_name || row.ad_group_name || '-'}</td>
                            <td><span class="badge">${row.dmp || row.dmp_type || 'DIRECT'}</span></td>
                            <td class="text-right">${row.impressions.toLocaleString()}</td>
                            <td class="text-right">${row.clicks.toLocaleString()}</td>
                            <td class="text-right bold">₩${Math.round(row.cost || row.execution_amount).toLocaleString()}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        ${campaign.insights ? `
            <div class="insights">
                <h3 style="margin-bottom: 12px; color: var(--primary);">💡 Campaign Insights</h3>
                <p style="color: var(--slate-600); white-space: pre-wrap; font-size: 15px; font-weight: 500;">${campaign.insights}</p>
            </div>
        ` : ''}

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
