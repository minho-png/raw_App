import pandas as pd
import chardet
import numpy as np

def parse_naver_date(date_str):
    """'2026.02.24.' or '2026.02.24' -> datetime"""
    try:
        if isinstance(date_str, str):
            # Clean possible dots or spaces
            clean_date = date_str.strip().strip('.')
            # Handle 2026.02.24 style
            dt = pd.to_datetime(clean_date, format='%Y.%m.%d', errors='coerce')
            if pd.isna(dt):
                # Fallback to general parser
                dt = pd.to_datetime(clean_date, errors='coerce')
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

def load_data_with_encoding(file_obj):
    """Detect encoding and load CSV"""
    raw_data = file_obj.read()
    file_obj.seek(0)
    result = chardet.detect(raw_data)
    encoding = result['encoding']
    
    # Fallback to CP949 if detection is unsure
    if encoding is None or result['confidence'] < 0.8:
        encoding = 'cp949'
    
    try:
        df = pd.read_csv(file_obj, encoding=encoding)
    except UnicodeDecodeError:
        df = pd.read_csv(file_obj, encoding='utf-8-sig')
    return df

def merge_raw_data(dfs):
    """Merge multiple raw dataframes, filter summary rows, and sort by date"""
    if not dfs:
        return pd.DataFrame()
    combined_df = pd.concat(dfs, ignore_index=True)
    
    # Filter out summary rows (often found in GFA/Media reports)
    # These rows double the values when grouped/summed later
    summary_keywords = ['합계', '소계', 'total', '평균']
    # Check first 5 columns for summary keywords
    search_cols = combined_df.columns[:5].tolist()
    if search_cols:
        mask = combined_df[search_cols].apply(lambda x: x.astype(str).str.contains('|'.join(summary_keywords), case=False, na=False)).any(axis=1)
        combined_df = combined_df[~mask]

    # Handle Naver GFA specific '기간' column -> '날짜'
    if '기간' in combined_df.columns and '날짜' not in combined_df.columns:
        combined_df = combined_df.rename(columns={'기간': '날짜'})
    
    if '날짜' in combined_df.columns:
        combined_df['dt'] = combined_df['날짜'].apply(parse_naver_date)
        # Drop rows where date parsing failed
        combined_df = combined_df.dropna(subset=['dt'])
        combined_df = combined_df.sort_values('dt').drop('dt', axis=1)
        # Final Format for consistency: YYYY-MM-DD string
        combined_df['날짜'] = combined_df['날짜'].apply(parse_naver_date).dt.strftime('%Y-%m-%d')
        
    return combined_df

def detect_anomalies(df, threshold=2.0):
    """Detect anomalies in CTR (more than threshold * std dev)"""
    if '클릭' not in df.columns or '노출' not in df.columns or len(df) < 5:
        return []
    
    temp_df = df.copy()
    temp_df['CTR'] = (temp_df['클릭'] / temp_df['노출']).fillna(0)
    mean_ctr = temp_df['CTR'].mean()
    std_ctr = temp_df['CTR'].std()
    
    if std_ctr == 0:
        return []
        
    anomalies = temp_df[temp_df['CTR'] > (mean_ctr + threshold * std_ctr)]
    insights = []
    for _, row in anomalies.iterrows():
        placement = row.get('지면', 'Unknown')
        group = row.get('광고 그룹 이름', 'Unknown')
        insights.append(f"이상 탐지: [{placement} > {group}] CTR {row['CTR']*100:.2f}% (평균 대비 급증)")
    
    return insights

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

def extract_dmp_type(group_name, keywords):
    """
    광고 그룹명에서 DMP 사명을 추출합니다.
    예: "[SKP] 관심사_A" -> "SKP"
    """
    if not isinstance(group_name, str):
        return "None"
    
    # 키워드별로 매칭 확인
    for kw in keywords:
        if kw.strip() and kw.strip().upper() in group_name.upper():
            return kw.strip().upper()
    return "None"

def calculate_metrics(df, base_fee, media_type, dmp_keywords=None, include_vat=False):
    """
    정산 목적의 '집행 금액'과 'NET'만 계산하도록 유지.
    매체, DMP종류, NET가 컬럼을 추가함.
    """
    if dmp_keywords is None:
        dmp_keywords = ['SKP', 'LOTTE', 'TG360', 'WIFI', '실내 위치']
    
    # Ensure '총 비용' is numeric
    if '총 비용' in df.columns:
        df['총 비용'] = df['총 비용'].apply(clean_numeric)
    
    # NET가 계산 (총 비용 / 1.1)
    if '총 비용' in df.columns:
        df['NET가'] = df['총 비용'] / 1.1
    else:
        df['NET가'] = 0.0

    # 매체 정보 추가
    df['매체'] = media_type

    # DMP 여부 및 종류 확인 (광고 그룹 이름 기준)
    if '광고 그룹 이름' in df.columns:
        df['DMP종류'] = df['광고 그룹 이름'].apply(lambda x: extract_dmp_type(x, dmp_keywords))
        df['has_dmp'] = df['DMP종류'] != "None"
    else:
        df['DMP종류'] = "None"
        df['has_dmp'] = False
    
    def apply_formula(row):
        if media_type == '네이버GFA':
            fee_rate = (base_fee + 10) / 100 if row['has_dmp'] else base_fee / 100
            # 1. 리포트 금액에서 1.1을 먼저 나눔 (공급가액 기준) = NET가
            supply_value = row['NET가']
            # 2. 해당 값을 (1 - 수수료율)로 나눠서 최종 집행 금액 계산
            if fee_rate >= 1.0:
                exec_cost = supply_value
            else:
                exec_cost = supply_value / (1 - fee_rate)
        else:
            fee_rate = base_fee / 100
            # 타 매체도 동일하게 NET가(공급가액) 기준으로 계산하는지 확인 필요하나, 
            # 일단 기존 로직 유지하되 공급가액 기반으로 통일
            supply_value = row['NET가']
            if fee_rate >= 1.0:
                exec_cost = supply_value
            else:
                exec_cost = supply_value / (1 - fee_rate)
            
        # VAT 처리 (최종 결과에 10% 추가 여부)
        if include_vat:
            exec_cost = exec_cost * 1.1
            
        return exec_cost

    df['집행 금액'] = df.apply(apply_formula, axis=1)
    
    if '지면' in df.columns:
        df['지면'] = df['지면'].apply(clean_placement)
        
    return df

def calculate_budget_metrics(df, total_budget):
    """소진액, 잔여 예산, 소진율 계산"""
    spent = df['집행 금액'].sum()
    remaining = total_budget - spent
    burn_rate = (spent / total_budget * 100) if total_budget > 0 else 0
    return {
        "spent": spent,
        "remaining": remaining,
        "burn_rate": burn_rate
    }

def calculate_pacing(spent, total_budget, start_date, end_date):
    """
    Pacing Index 계산:
    100 = 정상 집행
    > 100 = 과다 집행 (빨름)
    < 100 = 과소 집행 (느림)
    """
    from datetime import datetime
    if not start_date or not end_date or total_budget <= 0:
        return 0, "N/A"
    
    # Normalize dates to start of day for comparison
    start_dt = pd.to_datetime(start_date)
    end_dt = pd.to_datetime(end_date)
    today = pd.to_datetime(datetime.now().date())
    
    total_days = (end_dt - start_dt).days + 1
    elapsed_days = (today - start_dt).days + 1
    
    if elapsed_days <= 0: return 0, "집행 전"
    if elapsed_days > total_days: elapsed_days = total_days
    
    target_burn_rate = (elapsed_days / total_days) * 100
    current_burn_rate = (spent / total_budget) * 100
    
    pacing_index = (current_burn_rate / target_burn_rate * 100) if target_burn_rate > 0 else 0
    
    status = "정상"
    if pacing_index > 110: status = "과다 (Fast)"
    elif pacing_index < 90: status = "과소 (Slow)"
    
    return pacing_index, status

def prepare_daily_accumulation(df):
    """날짜별 누적 집행 금액 데이터 생성"""
    if '날짜' not in df.columns or df.empty:
        return pd.DataFrame()
    
    temp_df = df.copy()
    # Ensure the date column is sorted and unique per day
    daily = temp_df.groupby('날짜').agg({'집행 금액': 'sum'}).reset_index()
    daily = daily.sort_values('날짜')
    daily['누적 집행 금액'] = daily['집행 금액'].cumsum()
    
    return daily

