import pandas as pd
# Deployment Trigger: v1.0.3
from datetime import datetime
from jinja2 import Environment, FileSystemLoader, Template
import io
import os

try:
    from xhtml2pdf import pisa
    PDF_SUPPORT = True
except ImportError:
    PDF_SUPPORT = False

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

def generate_premium_html(df, title="GFA 광고 성과 리포트"):
    """
    Jinja2 템플릿을 사용하여 고도화된 HTML 리포트 생성
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
    
    table_cols = [c for c in df_perf.columns if c not in ['has_dmp', '조회']]
    table_data = df_perf[table_cols].to_dict('records')
    
    html_content = template.render(
        title=title,
        generated_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        summary=summary,
        trend_data=trend_data,
        media_data=media_data,
        table_cols=table_cols,
        table_data=table_data
    )
    
    return html_content

def generate_pdf_report(html_content):
    """
    HTML 콘텐츠를 PDF로 변환
    """
    if not PDF_SUPPORT:
        return None
        
    result = io.BytesIO()
    pisa_status = pisa.CreatePDF(io.BytesIO(html_content.encode("utf-8")), dest=result, encoding='utf-8')
    if pisa_status.err:
        return None
    return result.getvalue()
