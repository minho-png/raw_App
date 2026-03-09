import pandas as pd
from datetime import datetime

def generate_premium_html(df, title="GFA 광고 성과 리포트"):
    """
    Generates a premium, styled HTML report from a pandas DataFrame,
    inspired by the '트립앤샵 진행리포트.html' template.
    """
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    # Calculate summary metrics
    summary_data = {
        'total_imp': df['노출'].sum() if '노출' in df.columns else 0,
        'total_click': df['클릭'].sum() if '클릭' in df.columns else 0,
        'total_exec': df['집행 금액'].sum() if '집행 금액' in df.columns else 0,
        'total_net': df['NET'].sum() if 'NET' in df.columns else 0
    }
    
    ctr = (summary_data['total_click'] / summary_data['total_imp'] * 100) if summary_data['total_imp'] > 0 else 0
    
    # Format numbers for display
    fmt_imp = f"{summary_data['total_imp']:,.0f}"
    fmt_click = f"{summary_data['total_click']:,.0f}"
    fmt_exec = f"{summary_data['total_exec']:,.0f}"
    fmt_ctr = f"{ctr:.2f}"

    # Generate the table HTML using Tailwind classes
    # We'll build the table manually for better control over styling
    table_headers = "".join([f'<th class="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">{col}</th>' for col in df.columns])
    
    table_rows = ""
    for _, row in df.iterrows():
        row_html = "".join([f'<td class="px-4 py-3 whitespace-nowrap text-sm text-slate-600 border-b border-slate-100">{val}</td>' for val in row])
        table_rows += f"<tr>{row_html}</tr>"

    html_template = f"""
    <!DOCTYPE html>
    <html lang="ko">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>{title}</title>
        <!-- Tailwind CSS -->
        <script src="https://cdn.tailwindcss.com"></script>
        <!-- Google Fonts (Noto Sans KR) -->
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;900&display=swap" rel="stylesheet">
        <!-- Lucide Icons -->
        <script src="https://unpkg.com/lucide@latest"></script>
        
        <style>
            body {{
                font-family: 'Noto Sans KR', sans-serif;
                background-color: #f8fafc;
                color: #334155;
            }}
            .text-brand {{ color: rgb(172, 2, 18); }}
            .bg-brand {{ background-color: rgb(172, 2, 18); }}
            .border-brand {{ border-color: rgb(172, 2, 18); }}
            
            .card {{
                background: white;
                border-radius: 1rem;
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
                padding: 1.5rem;
            }}
            
            .premium-table-container {{
                overflow-x: auto;
                background: white;
                border-radius: 1rem;
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
            }}
        </style>
    </head>
    <body class="p-4 md:p-8">
        <div class="max-w-7xl mx-auto space-y-6">
            <!-- Header -->
            <header class="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-2xl shadow-sm border-l-8 border-brand">
                <div>
                    <h1 class="text-3xl font-black text-slate-800 tracking-tight">{title}</h1>
                    <p class="text-slate-500 mt-2 flex items-center gap-2 font-medium">
                        <i data-lucide="calendar" class="w-4 h-4"></i>
                        리포트 생성 일시: {now}
                    </p>
                </div>
            </header>

            <!-- Executive Summary KPIs -->
            <section class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div class="card flex flex-col md:flex-row items-center md:items-start p-5 gap-4 text-center md:text-left">
                    <div class="p-3 bg-red-50 rounded-full text-brand shrink-0">
                        <i data-lucide="eye" class="w-6 h-6 md:w-8 md:h-8"></i>
                    </div>
                    <div>
                        <p class="text-xs md:text-sm text-slate-500 font-semibold mb-1">총 노출수</p>
                        <h3 class="text-lg md:text-xl font-bold text-slate-800">{fmt_imp} <span class="text-xs font-normal text-slate-400">회</span></h3>
                    </div>
                </div>
                <div class="card flex flex-col md:flex-row items-center md:items-start p-5 gap-4 text-center md:text-left">
                    <div class="p-3 bg-blue-50 rounded-full text-blue-600 shrink-0">
                        <i data-lucide="mouse-pointer-click" class="w-6 h-6 md:w-8 md:h-8"></i>
                    </div>
                    <div>
                        <p class="text-xs md:text-sm text-slate-500 font-semibold mb-1">총 클릭수</p>
                        <h3 class="text-lg md:text-xl font-bold text-slate-800">{fmt_click} <span class="text-xs font-normal text-slate-400">회</span></h3>
                    </div>
                </div>
                <div class="card flex flex-col md:flex-row items-center md:items-start p-5 gap-4 text-center md:text-left">
                    <div class="p-3 bg-emerald-50 rounded-full text-emerald-600 shrink-0">
                        <i data-lucide="percent" class="w-6 h-6 md:w-8 md:h-8"></i>
                    </div>
                    <div>
                        <p class="text-xs md:text-sm text-slate-500 font-semibold mb-1">평균 클릭률 (CTR)</p>
                        <h3 class="text-lg md:text-xl font-bold text-slate-800">{fmt_ctr} <span class="text-xs font-normal text-slate-400">%</span></h3>
                    </div>
                </div>
                <div class="card flex flex-col md:flex-row items-center md:items-start p-5 gap-4 text-center md:text-left">
                    <div class="p-3 bg-purple-50 rounded-full text-purple-600 shrink-0">
                        <i data-lucide="banknote" class="w-6 h-6 md:w-8 md:h-8"></i>
                    </div>
                    <div>
                        <p class="text-xs md:text-sm text-slate-500 font-semibold mb-1">총 집행 금액</p>
                        <h3 class="text-lg md:text-xl font-bold text-slate-800">{fmt_exec} <span class="text-xs font-normal text-slate-400">원</span></h3>
                    </div>
                </div>
            </section>

            <!-- Data Table Section -->
            <section class="card">
                <h2 class="text-xl font-bold mb-4 flex items-center gap-2 text-slate-800">
                    <i data-lucide="table" class="w-5 h-5 text-brand"></i>
                    상세 성과 데이터
                </h2>
                <div class="premium-table-container">
                    <table class="min-w-full divide-y divide-slate-200">
                        <thead class="bg-slate-50">
                            <tr>
                                {table_headers}
                            </tr>
                        </thead>
                        <tbody class="bg-white">
                            {table_rows}
                        </tbody>
                    </table>
                </div>
            </section>

            <footer class="text-center text-slate-400 text-sm py-6 border-t border-slate-200">
                <p>&copy; 2026 GFA RAW MASTER PRO. All rights reserved.</p>
            </footer>
        </div>

        <script>
            // Initialize Lucide icons
            lucide.createIcons();
        </script>
    </body>
    </html>
    """
    return html_template
