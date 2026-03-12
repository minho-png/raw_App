import pandas as pd
from datetime import datetime
from jinja2 import Environment, FileSystemLoader
import os

try:
    from weasyprint import HTML
    PDF_SUPPORT = True
except ImportError:
    PDF_SUPPORT = False

# --- Common Utilities ---

def format_comma(value):
    try: return f"{value:,.0f}"
    except: return value

def format_pct(value):
    try: return f"{value:.2f}"
    except: return value

def format_cell(value):
    if isinstance(value, (int, float)):
        if value == int(value): return f"{value:,.0f}"
        return f"{value:,.2f}"
    return str(value)

def get_jinja_env():
    env = Environment(loader=FileSystemLoader(os.path.dirname(__file__)))
    env.filters['format_comma'] = format_comma
    env.filters['format_pct'] = format_pct
    env.filters['format_cell'] = format_cell
    return env

def safe_date_str(val):
    """Converts any date/datetime to YYYY-MM-DD string for JSON serialization."""
    try:
        if hasattr(val, 'strftime'):
            return val.strftime('%Y-%m-%d')
        return str(val)[:10]
    except:
        return str(val)

def select_optimal_columns(df):
    """
    데이터프레임의 컬럼을 분석하여 리포트용 최적의 컬럼 리스트와 정렬 순서를 반환.
    보안에 민감한 정산 데이터(NET가 등)는 제외.
    """
    exclude = ['has_dmp', 'NET', 'NET가', '조회', 'db_created_at', 'db_campaign_name', '총 비용']
    dimensions = ['날짜', '매체', '캠페인', 'DMP종류', '지면', '소재']
    metrics = ['노출', '클릭', '집행 금액', 'CTR', 'CPC', 'CPM']
    
    useful_metrics = [c for c in metrics if c in df.columns and c not in exclude]
    available_dims = [c for c in dimensions if c in df.columns and c not in exclude]
    
    known_cols = dimensions + metrics + exclude
    others = [c for c in df.columns if c not in known_cols]
    
    return available_dims + useful_metrics + others

def calculate_performance_indicators(df):
    df_res = df.copy()
    if '노출' in df_res.columns and '클릭' in df_res.columns:
        df_res['CTR'] = (df_res['클릭'] / df_res['노출'] * 100).fillna(0)
    if '집행 금액' in df_res.columns:
        if '클릭' in df_res.columns:
            df_res['CPC'] = (df_res['집행 금액'] / df_res['클릭']).replace([float('inf'), -float('inf')], 0).fillna(0)
        if '노출' in df_res.columns:
            df_res['CPM'] = (df_res['집행 금액'] / df_res['노출'] * 1000).fillna(0)
    return df_res

# --- Report Generators ---

def generate_premium_html(df, title="GFA 광고 성과 리포트", growth_data=None, theme_color="#AC0212", logo_url=None, selected_cols=None, insights=None, show_trend_chart=True, show_media_chart=True, show_creative_chart=True, show_placement_chart=True, table_group_by=None):
    df_perf = calculate_performance_indicators(df)
    summary = {
        'total_imp': df_perf['노출'].sum() if '노출' in df_perf.columns else 0,
        'total_click': df_perf['클릭'].sum() if '클릭' in df_perf.columns else 0,
        'total_exec': df_perf['집행 금액'].sum() if '집행 금액' in df_perf.columns else 0,
        'avg_ctr': (df_perf['클릭'].sum() / df_perf['노출'].sum() * 100) if '노출' in df_perf.columns and df_perf['노출'].sum() > 0 else 0
    }
    
    # Trend & Media Data - dates converted to strings for JSON safety
    trend_data = {'labels': [], 'imp': [], 'click': [], 'ctr': []}
    if '날짜' in df_perf.columns:
        daily = df_perf.groupby('날짜').agg({'노출':'sum', '클릭':'sum', '집행 금액':'sum'}).reset_index().sort_values('날짜')
        daily['CTR'] = (daily['클릭'] / daily['노출'] * 100).fillna(0)
        trend_data = {
            'labels': [safe_date_str(d) for d in daily['날짜'].tolist()],
            'imp': daily['노출'].tolist(),
            'click': daily['클릭'].tolist(),
            'ctr': daily['CTR'].tolist()
        }
        
    media_data = {'labels': [], 'values': []}
    if '매체' in df_perf.columns:
        media_share = df_perf.groupby('매체')['집행 금액'].sum().reset_index()
        media_data = {'labels': media_share['매체'].tolist(), 'values': media_share['집행 금액'].tolist()}

    creative_data = {'labels': [], 'values': []}
    if '소재' in df_perf.columns:
        creative_share = df_perf.groupby('소재')['집행 금액'].sum().reset_index()
        creative_data = {'labels': creative_share['소재'].tolist(), 'values': creative_share['집행 금액'].tolist()}

    placement_data = {'labels': [], 'values': []}
    if '지면' in df_perf.columns:
        placement_share = df_perf.groupby('지면')['집행 금액'].sum().reset_index()
        placement_data = {'labels': placement_share['지면'].tolist(), 'values': placement_share['집행 금액'].tolist()}

    # Table: optionally group by a dimension before rendering
    table_cols = selected_cols if selected_cols else select_optimal_columns(df_perf)
    if table_group_by and table_group_by in df_perf.columns:
        grp_metrics = {c: 'sum' for c in ['노출', '클릭', '집행 금액'] if c in df_perf.columns}
        grp_keys = [table_group_by]
        for extra in [c for c in table_cols if c != table_group_by and c not in grp_metrics]:
            if extra in df_perf.columns:
                grp_keys.append(extra)
        df_table = df_perf.groupby(list(dict.fromkeys(grp_keys))).agg(grp_metrics).reset_index()
        df_table = calculate_performance_indicators(df_table)
        avail_cols = [c for c in table_cols if c in df_table.columns]
        table_data = df_table[avail_cols].to_dict('records')
        table_cols = avail_cols
    else:
        table_data = df_perf[[c for c in table_cols if c in df_perf.columns]].to_dict('records')
        table_cols = [c for c in table_cols if c in df_perf.columns]
    
    # Convert any date objects in table_data to strings
    for row in table_data:
        for k, v in row.items():
            if hasattr(v, 'strftime'):
                row[k] = safe_date_str(v)
    
    env = get_jinja_env()
    template = env.get_template('report_template.html')
    return template.render(
        title=title, generated_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        summary=summary, trend_data=trend_data, media_data=media_data,
        creative_data=creative_data, placement_data=placement_data,
        table_cols=table_cols, table_data=table_data, growth_data=growth_data,
        theme_color=theme_color, logo_url=logo_url, insights=insights,
        show_trend_chart=show_trend_chart, show_media_chart=show_media_chart,
        show_creative_chart=show_creative_chart, show_placement_chart=show_placement_chart
    )

def generate_daily_report_html(df, campaign_config, title="GFA 일일 운영 리포트", theme_color="#AC0212", logo_url="", selected_cols=None, insights=None, target_cpc=0, target_ctr=0, show_trend_chart=True, show_media_chart=True, show_creative_chart=True, show_placement_chart=True, table_group_by=None):
    from logic import calculate_budget_metrics, calculate_pacing, prepare_daily_accumulation
    
    df_perf = calculate_performance_indicators(df)
    budget_metrics = calculate_budget_metrics(df, campaign_config['budget'])
    pacing_idx, pacing_status = calculate_pacing(budget_metrics['spent'], campaign_config['budget'], campaign_config['start'], campaign_config['end'])
    acc_df = prepare_daily_accumulation(df)
    
    # Summary Metrics
    total_imp = df_perf['노출'].sum() if '노출' in df_perf.columns else 0
    total_click = df_perf['클릭'].sum() if '클릭' in df_perf.columns else 0
    total_exec = df_perf['집행 금액'].sum() if '집행 금액' in df_perf.columns else 0
    avg_ctr = (total_click / total_imp * 100) if total_imp > 0 else 0
    avg_cpc = (total_exec / total_click) if total_click > 0 else 0

    # Benchmarking Logic
    benchmarking = {
        'target_cpc': target_cpc,
        'target_ctr': target_ctr,
        'ctr_achievement': (avg_ctr / target_ctr * 100) if target_ctr > 0 else 0,
        'cpc_achievement': (target_cpc / avg_cpc * 100) if target_cpc > 0 and avg_cpc > 0 else 0,
        'active': target_cpc > 0 or target_ctr > 0
    }

    # Daily Chart Data - dates converted to strings for JSON safety
    daily_trend = {'labels': [], 'spend': [], 'ctr': []}
    if '날짜' in df_perf.columns:
        daily = df_perf.groupby('날짜').agg({'집행 금액':'sum', '노출':'sum', '클릭':'sum'}).reset_index().sort_values('날짜')
        daily['CTR'] = (daily['클릭'] / daily['노출'] * 100).fillna(0)
        daily_trend = {
            'labels': [safe_date_str(d) for d in daily['날짜'].tolist()],
            'spend': daily['집행 금액'].tolist(),
            'ctr': daily['CTR'].tolist()
        }

    acc_data = {
        'labels': [safe_date_str(d) for d in acc_df['날짜']] if not acc_df.empty else [],
        'values': acc_df['누적 집행 금액'].tolist() if not acc_df.empty else []
    }
    
    summary = {
        'total_imp': total_imp,
        'total_click': total_click,
        'total_exec': total_exec,
        'avg_ctr': avg_ctr,
        'avg_cpc': avg_cpc
    }

    # Media Chart Data
    media_data = {'labels': [], 'values': []}
    if '매체' in df_perf.columns:
        media_summary = df_perf.groupby('매체')['집행 금액'].sum().reset_index()
        media_data = {'labels': media_summary['매체'].tolist(), 'values': media_summary['집행 금액'].tolist()}

    # Creative Chart Data
    creative_data = {'labels': [], 'values': []}
    if '소재' in df_perf.columns:
        creative_summary = df_perf.groupby('소재')['집행 금액'].sum().reset_index()
        creative_data = {'labels': creative_summary['소재'].tolist(), 'values': creative_summary['집행 금액'].tolist()}

    # Placement Chart Data
    placement_data = {'labels': [], 'values': []}
    if '지면' in df_perf.columns:
        placement_summary = df_perf.groupby('지면')['집행 금액'].sum().reset_index()
        placement_data = {'labels': placement_summary['지면'].tolist(), 'values': placement_summary['집행 금액'].tolist()}

    # Table: optionally group by dimension
    table_cols = selected_cols if selected_cols else select_optimal_columns(df_perf)
    if table_group_by and table_group_by in df_perf.columns:
        grp_metrics = {c: 'sum' for c in ['노출', '클릭', '집행 금액'] if c in df_perf.columns}
        grp_keys = [table_group_by]
        for extra in [c for c in table_cols if c != table_group_by and c not in grp_metrics]:
            if extra in df_perf.columns:
                grp_keys.append(extra)
        df_table = df_perf.groupby(list(dict.fromkeys(grp_keys))).agg(grp_metrics).reset_index()
        df_table = calculate_performance_indicators(df_table)
        avail_cols = [c for c in table_cols if c in df_table.columns]
        table_data = df_table[avail_cols].to_dict('records')
        table_cols = avail_cols
    else:
        avail_cols = [c for c in table_cols if c in df_perf.columns]
        table_data = df_perf[avail_cols].sort_values('날짜', ascending=False).to_dict('records') if '날짜' in avail_cols else df_perf[avail_cols].to_dict('records')
        table_cols = avail_cols
    
    # Coerce any date objects in table_data to strings
    for row in table_data:
        for k, v in row.items():
            if hasattr(v, 'strftime'):
                row[k] = safe_date_str(v)

    env = get_jinja_env()
    template = env.get_template('daily_report_template.html')
    return template.render(
        title=title, generated_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        campaign_config=campaign_config, budget_metrics=budget_metrics,
        pacing={'index': pacing_idx, 'status': pacing_status}, summary=summary,
        acc_data=acc_data, daily_trend=daily_trend, media_data=media_data, 
        creative_data=creative_data, placement_data=placement_data,
        table_cols=table_cols, table_data=table_data,
        theme_color=theme_color, logo_url=logo_url, insights=insights,
        benchmarking=benchmarking,
        show_trend_chart=show_trend_chart, show_media_chart=show_media_chart,
        show_creative_chart=show_creative_chart, show_placement_chart=show_placement_chart
    )

def generate_media_report_html(df, title="GFA 매체별 성과 리포트", theme_color="#AC0212", logo_url="", insights=None):
    df_perf = calculate_performance_indicators(df)
    media_col = '매체' if '매체' in df_perf.columns else None
    
    if media_col:
        media_summary = df_perf.groupby(media_col).agg({'노출': 'sum', '클릭': 'sum', '집행 금액': 'sum'}).reset_index()
        media_summary = calculate_performance_indicators(media_summary).sort_values('집행 금액', ascending=False)
        media_data = {'labels': media_summary[media_col].tolist(), 'values': media_summary['집행 금액'].tolist()}
    else:
        media_summary = pd.DataFrame()
        media_data = {'labels': [], 'values': []}

    env = get_jinja_env()
    template = env.get_template('media_report_template.html')
    return template.render(
        title=title, generated_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        summary={'total_exec': media_summary['집행 금액'].sum() if not media_summary.empty else 0, 
                 'total_imp': media_summary['노출'].sum() if not media_summary.empty else 0,
                 'total_click': media_summary['클릭'].sum() if not media_summary.empty else 0,
                 'avg_ctr': (media_summary['클릭'].sum() / media_summary['노출'].sum() * 100) if not media_summary.empty and media_summary['노출'].sum() > 0 else 0},
        media_data=media_data, table_cols=media_summary.columns.tolist() if not media_summary.empty else [],
        table_data=media_summary.to_dict('records') if not media_summary.empty else [],
        theme_color=theme_color, logo_url=logo_url, insights=insights
    )

def generate_creative_report_html(df, title="GFA 소재별 성과 리포트", theme_color="#AC0212", logo_url="", insights=None):
    df_perf = calculate_performance_indicators(df)
    creative_col = '소재' if '소재' in df_perf.columns else None
    
    if creative_col:
        creative_summary = df_perf.groupby(creative_col).agg({'노출': 'sum', '클릭': 'sum', '집행 금액': 'sum'}).reset_index()
        creative_summary = calculate_performance_indicators(creative_summary).sort_values('CTR', ascending=False)
    else:
        creative_summary = pd.DataFrame()

    env = get_jinja_env()
    template = env.get_template('creative_report_template.html')
    return template.render(
        title=title, generated_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        summary={'total_exec': creative_summary['집행 금액'].sum() if not creative_summary.empty else 0,
                 'total_imp': creative_summary['노출'].sum() if not creative_summary.empty else 0,
                 'total_click': creative_summary['클릭'].sum() if not creative_summary.empty else 0,
                 'avg_ctr': (creative_summary['클릭'].sum() / creative_summary['노출'].sum() * 100) if not creative_summary.empty and creative_summary['노출'].sum() > 0 else 0},
        table_cols=creative_summary.columns.tolist() if not creative_summary.empty else [],
        table_data=creative_summary.to_dict('records') if not creative_summary.empty else [],
        theme_color=theme_color, logo_url=logo_url, insights=insights
    )

def generate_media_creative_report_html(df, title="GFA 매체/소재 통합 성과 리포트", theme_color="#AC0212", logo_url="", insights=None):
    df_perf = calculate_performance_indicators(df)
    dims = []
    if '매체' in df_perf.columns: dims.append('매체')
    if '소재' in df_perf.columns: dims.append('소재')
    
    if dims:
        combined_summary = df_perf.groupby(dims).agg({'노출': 'sum', '클릭': 'sum', '집행 금액': 'sum'}).reset_index()
        combined_summary = calculate_performance_indicators(combined_summary).sort_values(['집행 금액', 'CTR'], ascending=False)
    else:
        combined_summary = pd.DataFrame()

    env = get_jinja_env()
    template = env.get_template('combined_report_template.html')
    return template.render(
        title=title, generated_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        summary={'total_exec': combined_summary['집행 금액'].sum() if not combined_summary.empty else 0,
                 'total_imp': combined_summary['노출'].sum() if not combined_summary.empty else 0,
                 'total_click': combined_summary['클릭'].sum() if not combined_summary.empty else 0,
                 'avg_ctr': (combined_summary['클릭'].sum() / combined_summary['노출'].sum() * 100) if not combined_summary.empty and combined_summary['노출'].sum() > 0 else 0},
        table_cols=combined_summary.columns.tolist() if not combined_summary.empty else [],
        table_data=combined_summary.to_dict('records') if not combined_summary.empty else [],
        theme_color=theme_color, logo_url=logo_url, insights=insights
    )

def generate_pdf_report(html_content):
    if not PDF_SUPPORT: return None
    try:
        return HTML(string=html_content).write_pdf()
    except Exception as e:
        print(f"PDF Generation Error: {e}")
        return None
