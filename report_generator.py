import pandas as pd
# Deployment Trigger: v1.0.4
from datetime import datetime
from jinja2 import Environment, FileSystemLoader, Template
import io
import os

try:
    from weasyprint import HTML
    PDF_SUPPORT = True
except ImportError:
    PDF_SUPPORT = False

def select_optimal_columns(df):
    """
    데이터프레임의 컬럼을 분석하여 리포트용 최적의 컬럼 리스트와 정렬 순서를 반환.
    데이터가 유효하지 않은(모든 값이 0인) 지표 컬럼은 자동으로 제외.
    """
    # 1. 제외할 컬럼 (보안 및 노이즈)
    exclude = ['has_dmp', 'NET', 'NET가', '조회', 'db_created_at', 'db_campaign_name', '총 비용']
    
    # 2. 범주별 우선순위 정의 (Dimensions)
    dimensions = ['날짜', '캠페인', '매체', '지면', '소재']
    
    # 3. 실제 존재하는 유효한 수치형 컬럼 필터링
    useful_metrics = []
    # Metrics/KPI candidate check
    candidates = ['노출', '클릭', '집행 금액', 'CTR', 'CPC', 'CPM']
    for c in candidates:
        if c in df.columns and c not in exclude:
            # Check if column has any non-zero values
            try:
                if (df[c] != 0).any():
                    useful_metrics.append(c)
            except:
                useful_metrics.append(c) # Fallback to include if check fails
    
    # 4. 실제 존재하는 식별자 필터링
    available_dims = [c for c in dimensions if c in df.columns and c not in exclude]
    
    # 기타 남은 유용한 컬럼들
    known_cols = dimensions + candidates + exclude
    others = [c for c in df.columns if c not in known_cols]
    
    # 5. 논리적 순서로 병합: 식별자 -> 유효 지표 -> 기타
    final_cols = available_dims + useful_metrics + others
    return final_cols

def calculate_performance_indicators(df):
    """
    리포트용 성과 지표 계산: CTR, CPC, CPM.
    """
    df_res = df.copy()
    
    # 기본 지표 확인
    if '노출' not in df_res.columns or '클릭' not in df_res.columns or '집행 금액' not in df_res.columns:
        return df_res
        
    df_res['CTR'] = (df_res['클릭'] / df_res['노출'] * 100).fillna(0)
    df_res['CPC'] = (df_res['집행 금액'] / df_res['클릭']).replace([float('inf'), -float('inf')], 0).fillna(0)
    df_res['CPM'] = (df_res['집행 금액'] / df_res['노출'] * 1000).fillna(0)
    
    return df_res

def generate_premium_html(df, title="GFA 광고 성과 리포트", growth_data=None, theme_color="#AC0212", logo_url=None):
    """
    Jinja2 템플릿을 사용하여 고도화된 HTML 리포트 생성
    theme_color: 브랜드 컬러 (HEX)
    logo_url: 대행사/브랜드 로고 경로
    """
    # 1. 성과 지표 계산
    df_perf = calculate_performance_indicators(df)
    
    # 2. 요약 데이터
    summary = {
        'total_imp': df_perf['노출'].sum(),
        'total_click': df_perf['클릭'].sum(),
        'total_exec': df_perf['집행 금액'].sum(),
        'avg_ctr': (df_perf['클릭'].sum() / df_perf['노출'].sum() * 100) if df_perf['노출'].sum() > 0 else 0
    }
    
    # 3. 차트 데이터 준비
    # 일별 추이
    if '날짜' in df_perf.columns:
        daily = df_perf.groupby('날짜').agg({'노출':'sum', '클릭':'sum', '집행 금액':'sum'}).reset_index()
        daily['CTR'] = (daily['클릭'] / daily['노출'] * 100).fillna(0)
        trend_data = {
            'labels': daily['날짜'].tolist(),
            'imp': daily['노출'].tolist(),
            'click': daily['클릭'].tolist(),
            'ctr': daily['CTR'].tolist()
        }
    else:
        trend_data = {'labels': [], 'imp': [], 'click': [], 'ctr': []}
        
    # 매체별 비중
    media_share = df_perf.groupby('매체')['집행 금액'].sum().reset_index()
    media_data = {
        'labels': media_share['매체'].tolist(),
        'values': media_share['집행 금액'].tolist()
    }
    
    # 3.1 DMP 효율 비교 데이터
    dmp_comparison = {}
    if 'has_dmp' in df_perf.columns:
        dmp_stats = df_perf.groupby('has_dmp').agg({
            '노출': 'sum',
            '클릭': 'sum',
            '집행 금액': 'sum'
        }).reset_index()
        dmp_stats['CTR'] = (dmp_stats['클릭'] / dmp_stats['노출'] * 100).fillna(0)
        dmp_stats['CPC'] = (dmp_stats['집행 금액'] / dmp_stats['클릭']).fillna(0)
        dmp_comparison = dmp_stats.to_dict('records')
    
    # 4. 템플릿 필터 정의 (Jinja용)
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

    # 5. 템플릿 로드 및 렌더링
    env = Environment(loader=FileSystemLoader(os.path.dirname(__file__)))
    env.filters['format_comma'] = format_comma
    env.filters['format_pct'] = format_pct
    env.filters['format_cell'] = format_cell
    
    try:
        template = env.get_template('report_template.html')
    except Exception:
        # Fallback if file not found
        template = Environment().from_string("<html><body>Template not found</body></html>")
    
    # Intelligent Column Selection
    table_cols = select_optimal_columns(df_perf)
    
    # Sort data for better presentation (Date desc, then Exec Cost desc)
    sort_cols = [c for c in ['날짜', '집행 금액'] if c in df_perf.columns]
    sort_order = [False] * len(sort_cols) # Descending for both
    if sort_cols:
        df_perf = df_perf.sort_values(sort_cols, ascending=sort_order)
        
    table_data = df_perf[table_cols].to_dict('records')
    
    html_content = template.render(
        title=title,
        generated_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        summary=summary,
        trend_data=trend_data,
        media_data=media_data,
        table_cols=table_cols,
        table_data=table_data,
        growth_data=growth_data,
        dmp_comparison=dmp_comparison,
        theme_color=theme_color,
        logo_url=logo_url
    )
    
    return html_content

def generate_daily_report_html(df, campaign_config, title="GFA 일일 운영 리포트", theme_color="#AC0212", logo_url=""):
    """
    일일 운영 관리용 HTML 리포트 생성 (예산 소진 중심)
    """
    from logic import calculate_budget_metrics, calculate_pacing, prepare_daily_accumulation
    
    # 1. 지표 계산
    df_perf = calculate_performance_indicators(df)
    budget_metrics = calculate_budget_metrics(df, campaign_config['budget'])
    pacing_idx, pacing_status = calculate_pacing(budget_metrics['spent'], campaign_config['budget'], campaign_config['start'], campaign_config['end'])
    acc_df = prepare_daily_accumulation(df)
    
    # 2. 요약 및 차트 데이터
    summary = {
        'total_imp': df_perf['노출'].sum(),
        'total_click': df_perf['클릭'].sum(),
        'total_exec': df_perf['집행 금액'].sum(),
        'avg_ctr': (df_perf['클릭'].sum() / df_perf['노출'].sum() * 100) if df_perf['노출'].sum() > 0 else 0
    }
    
    media_share = df_perf.groupby('매체')['집행 금액'].sum().reset_index()
    media_data = {
        'labels': media_share['매체'].tolist(),
        'values': media_share['집행 금액'].tolist()
    }
    
    acc_data = {
        'labels': [d.strftime('%m-%d') for d in acc_df['날짜']] if not acc_df.empty else [],
        'values': acc_df['누적 집행 금액'].tolist() if not acc_df.empty else []
    }
    
    # 3. 템플릿 로더 설정
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

    env = Environment(loader=FileSystemLoader(os.path.dirname(__file__)))
    env.filters['format_comma'] = format_comma
    env.filters['format_pct'] = format_pct
    env.filters['format_cell'] = format_cell
    
    try:
        template = env.get_template('daily_report_template.html')
    except Exception:
        template = Environment().from_string("<html><body>Daily Template not found</body></html>")
    
    # Intelligent Column Selection
    table_cols = select_optimal_columns(df_perf)
    
    # Sort data (Date desc)
    if '날짜' in df_perf.columns:
        df_perf = df_perf.sort_values('날짜', ascending=False)
        
    table_data = df_perf[table_cols].to_dict('records')
    
    html_content = template.render(
        title=title,
        generated_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        campaign_config=campaign_config,
        budget_metrics=budget_metrics,
        pacing={'index': pacing_idx, 'status': pacing_status},
        summary=summary,
        acc_data=acc_data,
        media_data=media_data,
        table_cols=table_cols,
        table_data=table_data,
        theme_color=theme_color,
        logo_url=logo_url
    )
    
    return html_content

def generate_pdf_report(html_content):
    """
    HTML 콘텐츠를 PDF로 변환 (WeasyPrint 사용)
    """
    if not PDF_SUPPORT:
        return None
        
    try:
        # WeasyPrint handles modern CSS better than xhtml2pdf
        # Note: External resources like Google Fonts might not load easily in all environments
        result = HTML(string=html_content).write_pdf()
        return result
    except Exception as e:
        print(f"PDF Generation Error: {e}")
        return None
