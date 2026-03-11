import pandas as pd

def parse_naver_date(date_str):
    """'2026.02.24.' -> '2026-02-24'"""
    try:
        if isinstance(date_str, str):
            clean_date = date_str.strip('.')
            dt = pd.to_datetime(clean_date, format='%Y.%m.%d')
            return dt
        return date_str
    except Exception:
        return pd.NaT

def get_day_of_week(dt):
    """Extract Korean day of week"""
    days = ['월', '화', '수', '목', '금', '토', '일']
    if pd.notnull(dt):
        return days[dt.weekday()]
    return ""

def clean_placement(placement_str):
    """Remove '네이버+ > ' from placement strings"""
    if isinstance(placement_str, str):
        return placement_str.replace("네이버+ > ", "")
    return placement_str

def clean_numeric(val):
    """Remove commas and convert to float/int"""
    if isinstance(val, str):
        # Remove commas and handle empty/whitespace strings
        val = val.replace(',', '').strip()
        if val == '' or val == '-':
            return 0.0
        try:
            return float(val)
        except ValueError:
            return 0.0
    elif isinstance(val, (int, float)):
        return float(val)
    return 0.0

def calculate_metrics(df, base_fee, media_type, dmp_keywords=None):
    """
    정산 목적의 '집행 금액'과 'NET'만 계산하도록 유지.
    성과 지표(CTR, CPC, CPM)는 report_generator.py에서 계산함.
    """
    if dmp_keywords is None:
        dmp_keywords = ['SKP', 'LOTTE', 'TG360', 'WIFI', '실내 위치']
    
    # Ensure '총 비용' is numeric
    if '총 비용' in df.columns:
        df['총 비용'] = df['총 비용'].apply(clean_numeric)
    
    # DMP 여부 확인 (광고 그룹 이름 기준)
    if '광고 그룹 이름' in df.columns:
        dmp_pattern = '|'.join([k.strip() for k in dmp_keywords if k.strip()])
        if dmp_pattern:
            df['has_dmp'] = df['광고 그룹 이름'].str.contains(dmp_pattern, case=False, na=False)
        else:
            df['has_dmp'] = False
    else:
        df['has_dmp'] = False
    
    def apply_formula(row):
        if media_type == '네이버GFA':
            fee_rate = (base_fee + 10) / 100 if row['has_dmp'] else base_fee / 100
        else:
            fee_rate = base_fee / 100
        
        # 마크업 계산: 집행 금액 = (총 비용 / (1 - rate))
        if fee_rate >= 1.0:
            exec_cost = row['총 비용']
        else:
            exec_cost = row['총 비용'] / (1 - fee_rate)
            
        # NET은 기본적으로 원본 총 비용
        net_cost = row['총 비용']
        
        # 매체별 특약 로직
        if media_type == '네이버GFA':
            # 네이버 특약: 집행금액/NET 모두 / 1.1 (공급가액 기준)
            exec_cost = exec_cost / 1.1
            net_cost = net_cost / 1.1
            
        return pd.Series([exec_cost, net_cost])

    df[['집행 금액', 'NET']] = df.apply(apply_formula, axis=1)
    
    if '지면' in df.columns:
        df['지면'] = df['지면'].apply(clean_placement)
        
    return df

