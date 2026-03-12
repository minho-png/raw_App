import pandas as pd
import streamlit as st
import io
import plotly.express as px
import plotly.graph_objects as go
from database_manager import DatabaseManager
from report_generator import generate_premium_html, generate_pdf_report, PDF_SUPPORT
from datetime import datetime
from logic import (
    parse_naver_date, get_day_of_week, calculate_metrics, 
    clean_placement, clean_numeric, load_data_with_encoding, 
    merge_raw_data, detect_anomalies, calculate_budget_metrics,
    calculate_pacing, prepare_daily_accumulation
)

# --- Page Config ---
st.set_page_config(
    page_title="GFA RAW Master Pro",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="expanded"
)

# --- Premium Global Styling ---
st.markdown("""
<style>
    :root {
        --primary: #AC0212;
        --primary-soft: rgba(172, 2, 18, 0.1);
        --glass: rgba(255, 255, 255, 0.7);
        --glass-border: rgba(255, 255, 255, 0.3);
        --shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.07);
        --text-main: #1e293b;
        --text-sub: #64748b;
    }

    /* Global Transitions */
    * { transition: all 0.2s ease-in-out; }

    /* Glassmorphism Cards */
    .glass-card {
        background: var(--glass);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border-radius: 20px;
        border: 1px solid var(--glass-border);
        box-shadow: var(--shadow);
        padding: 1.75rem;
        margin-bottom: 1.5rem;
        transition: transform 0.3s ease, box-shadow 0.3s ease;
    }
    .glass-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 12px 40px 0 rgba(31, 38, 135, 0.1);
    }

    .header-text {
        font-family: 'Pretendard Variable', sans-serif;
        font-size: 1.3rem;
        font-weight: 850;
        color: var(--text-main);
        margin-bottom: 1.5rem;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        letter-spacing: -0.01em;
    }

    /* Premium Metric Grid */
    .m-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 1.25rem;
        margin-bottom: 2rem;
    }
    
    .m-card {
        background: white;
        padding: 1.5rem;
        border-radius: 20px;
        border: 1px solid #f1f5f9;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.03);
        position: relative;
        overflow: hidden;
    }
    .m-card::after {
        content: '';
        position: absolute;
        top: 0; left: 0; width: 6px; height: 100%;
        background: var(--primary);
        opacity: 0.8;
    }
    .m-label { color: var(--text-sub); font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.5rem; }
    .m-value { color: var(--text-main); font-size: 1.75rem; font-weight: 900; font-family: 'Inter', sans-serif; }
    .m-status { font-size: 0.85rem; font-weight: 600; margin-top: 0.75rem; display: flex; align-items: center; gap: 0.4rem; color: var(--primary); }

    /* Button Styling */
    .stButton > button {
        border-radius: 14px !important;
        font-weight: 700 !important;
        padding: 0.6rem 1.2rem !important;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
    }
    .stButton > button:active {
        transform: scale(0.98);
    }

    /* Progress Stepper */
    .stepper {
        display: flex;
        justify-content: space-around;
        padding: 1.5rem 0;
        margin-bottom: 2.5rem;
        background: rgba(255,255,255,0.4);
        border-radius: 20px;
        border: 1px solid rgba(255,255,255,0.2);
    }
    .step {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.6rem;
        opacity: 0.3;
        transition: opacity 0.5s ease;
    }
    .step.active { opacity: 1; filter: drop-shadow(0 0 8px rgba(172,2,18,0.15)); }
    .step-circle {
        width: 36px; height: 36px;
        border-radius: 50%;
        background: #f1f5f9;
        display: flex; align-items: center; justify-content: center;
        font-weight: 900; font-size: 1rem;
        border: 2px solid #e2e8f0;
    }
    .step.active .step-circle { 
        background: var(--primary); 
        color: white; 
        border-color: var(--primary);
        box-shadow: 0 4px 15px rgba(172,2,18,0.3); 
    }
    .step-label { font-size: 0.85rem; font-weight: 800; letter-spacing: -0.02em; }
</style>
""", unsafe_allow_html=True)

# --- Initialization ---
if 'processed_df' not in st.session_state: st.session_state.processed_df = None
if 'df_raw' not in st.session_state: st.session_state.df_raw = None
if 'db_manager' not in st.session_state or not hasattr(st.session_state.db_manager, 'save_background_settlement'): 
    st.session_state.db_manager = DatabaseManager()
if 'current_step' not in st.session_state: st.session_state.current_step = 1
if 'growth_data' not in st.session_state: st.session_state.growth_data = None
if 'brand_color' not in st.session_state: st.session_state.brand_color = "#AC0212"
if 'logo_url' not in st.session_state: st.session_state.logo_url = ""
if 'report_type' not in st.session_state: st.session_state.report_type = "Final Performance"
if 'campaign_config' not in st.session_state: st.session_state.campaign_config = {"name": "", "budget": 0, "start": datetime.now(), "end": datetime.now()}

# Permanent Config Fields per Campaign
if 'base_fee' not in st.session_state: st.session_state.base_fee = 15.0
if 'include_vat' not in st.session_state: st.session_state.include_vat = False
if 'dmp_keywords' not in st.session_state: st.session_state.dmp_keywords = "SKP, KB, LOTTE, TG360, WIFI, 실내위치"
if 'selected_media' not in st.session_state: st.session_state.selected_media = '네이버GFA'
if 'saved_group_cols' not in st.session_state: st.session_state.saved_group_cols = ['날짜', '캠페인 이름']

# --- Sidebar Implementation ---
with st.sidebar:
    st.markdown("<div class='glass-card'>", unsafe_allow_html=True)
    st.markdown("<div class='header-text'>🎨 Brand Identity</div>", unsafe_allow_html=True)
    st.session_state.logo_url = st.text_input("Agency Logo URL", value="", placeholder="https://example.com/logo.png")
    st.session_state.brand_color = st.color_picker("Theme Color", value="#AC0212")
    st.markdown("</div>", unsafe_allow_html=True)

    st.markdown("<div class='glass-card'>", unsafe_allow_html=True)
    st.markdown("<div class='header-text'>🔗 DB Status</div>", unsafe_allow_html=True)
    db_mgr = st.session_state.db_manager
    if db_mgr.conn_success:
        st.success("Connected to MongoDB")
    else:
        st.warning("Not Connected (Local Only)")
    
    if st.button("🔄 Connection Refresh"):
        st.session_state.db_manager = DatabaseManager()
        st.rerun()
    st.markdown("</div>", unsafe_allow_html=True)

    # Dynamic Sidebar Style Override
    st.markdown(f"""
    <style>
        :root {{ --primary: {st.session_state.brand_color}; }}
        .header-text {{ border-bottom-color: {st.session_state.brand_color}; }}
    </style>
    """, unsafe_allow_html=True)

if 'db_data' not in st.session_state: st.session_state.db_data = None
if 'sql_result' not in st.session_state: st.session_state.sql_result = None

# --- Main Layout ---
st.markdown("<h1 style='text-align: center; color: var(--primary); font-family: Pretendard; font-weight: 900; letter-spacing: -0.02em;'>🚀 GFA RAW MASTER PRO</h1>", unsafe_allow_html=True)
st.markdown("<p style='text-align: center; color: var(--text-sub); margin-bottom: 2rem;'>네이버 GFA 광고 성과를 완벽한 RAW 데이터로 가공하고 리포트를 생성하세요.</p>", unsafe_allow_html=True)

# Visual Stepper
st.markdown(f"""
<div class='stepper'>
    <div class='step {"active" if st.session_state.current_step >= 1 else ""}'>
        <div class='step-circle'>1</div>
        <div class='step-label'>관리</div>
    </div>
    <div class='step {"active" if st.session_state.current_step >= 2 else ""}'>
        <div class='step-circle'>2</div>
        <div class='step-label'>분석</div>
    </div>
    <div class='step {"active" if st.session_state.current_step >= 3 else ""}'>
        <div class='step-circle'>3</div>
        <div class='step-label'>교정</div>
    </div>
    <div class='step {"active" if st.session_state.current_step >= 4 else ""}'>
        <div class='step-circle'>4</div>
        <div class='step-label'>정산</div>
    </div>
    <div class='step {"active" if st.session_state.current_step >= 5 else ""}'>
        <div class='step-circle'>5</div>
        <div class='step-label'>리포트</div>
    </div>
</div>
""", unsafe_allow_html=True)

# --- TAB Navigator ---
tabs = st.tabs(["📁 데이터 관리", "📈 일일 운영", "✍️ 데이터 교정", "📊 정산 분석", "📑 리포트 빌더"])

# --- TAB 1: 데이터 관리 ---
with tabs[0]:
    st.session_state.current_step = 1
    st.markdown("<div class='glass-card'>", unsafe_allow_html=True)
    st.markdown("<div class='header-text'>📂 캠페인 선택 및 관리</div>", unsafe_allow_html=True)
    
    # Campaign List Refresh
    camp_list, _ = st.session_state.db_manager.list_campaigns()
    
    c_col1, c_col2 = st.columns([2, 1])
    with c_col1:
        # Dropdown to select existing campaign
        options = ["선택 안함"] + camp_list
        selected_camp = st.selectbox("관리할 캠페인 선택", options, index=0)
        
        if selected_camp != "선택 안함" and (st.session_state.campaign_config['name'] != selected_camp):
            cfg, _ = st.session_state.db_manager.get_campaign_config(selected_camp)
            if cfg:
                st.session_state.campaign_config = {
                    "name": selected_camp,
                    "budget": cfg.get("budget", 0),
                    "start": pd.to_datetime(cfg.get("start")).date(),
                    "end": pd.to_datetime(cfg.get("end")).date()
                }
                # Load additional settings if exist
                if "base_fee" in cfg: st.session_state.base_fee = cfg["base_fee"]
                if "include_vat" in cfg: st.session_state.include_vat = cfg["include_vat"]
                if "dmp_keywords" in cfg: st.session_state.dmp_keywords = cfg["dmp_keywords"]
                if "selected_media" in cfg: st.session_state.selected_media = cfg["selected_media"]
                if "group_cols" in cfg: st.session_state.saved_group_cols = cfg["group_cols"]
                if "brand_color" in cfg: st.session_state.brand_color = cfg["brand_color"]
                if "logo_url" in cfg: st.session_state.logo_url = cfg["logo_url"]
                st.success(f"'{selected_camp}' 캠페인 정보 로드 완료")
                st.rerun()
                
        if selected_camp != "선택 안함":
            if st.button("🗑️ 선택한 캠페인 영구 삭제", type="secondary", use_container_width=True):
                success, msg = st.session_state.db_manager.delete_campaign(selected_camp)
                if success:
                    st.success(msg)
                    st.session_state.campaign_config = {"name": "", "budget": 0, "start": datetime.now(), "end": datetime.now()}
                    st.rerun()
                else:
                    st.error(msg)

    with c_col2:
        # Toggle for new campaign creation
        if st.checkbox("➕ 새 캠페인 생성하기"):
            new_camp_name = st.text_input("새 캠페인 이름")
            if st.button("생성 및 저장"):
                if new_camp_name and new_camp_name not in camp_list:
                    # Initialize with defaults
                    new_cfg = {
                        "name": new_camp_name, "budget": 0, "start": str(datetime.now().date()), "end": str(datetime.now().date()),
                        "base_fee": st.session_state.base_fee,
                        "include_vat": st.session_state.include_vat,
                        "dmp_keywords": st.session_state.dmp_keywords,
                        "selected_media": st.session_state.selected_media,
                        "group_cols": st.session_state.saved_group_cols
                    }
                    st.session_state.db_manager.save_campaign_config(new_camp_name, new_cfg)
                    st.session_state.campaign_config = {
                        "name": new_camp_name, "budget": 0, "start": datetime.now().date(), "end": datetime.now().date()
                    }
                    st.success(f"'{new_camp_name}' 캠페인이 생성되었습니다.")
                    st.rerun()
                else:
                    st.error("이름을 입력하거나 중복을 확인하세요.")
    st.markdown("</div>", unsafe_allow_html=True)

    st.markdown("<div class='glass-card'>", unsafe_allow_html=True)
    st.markdown("<div class='header-text'>📤 신규 데이터 업로드</div>", unsafe_allow_html=True)
    uploaded_files = st.file_uploader("result.csv 파일들을 선택하세요", type=['csv'], accept_multiple_files=True, key="uploader_main")
    
    if uploaded_files:
        if st.button("데이터 가공 및 적용", type="primary"):
            dfs = [load_data_with_encoding(f) for f in uploaded_files]
            st.session_state.df_raw = merge_raw_data(dfs)
            st.success(f"{len(uploaded_files)}개 파일 로드 완료")
    st.markdown("</div>", unsafe_allow_html=True)

    if st.session_state.df_raw is not None:
        col_s1, col_s2 = st.columns([1, 1])
        with col_s1:
            st.markdown("<div class='glass-card'>", unsafe_allow_html=True)
            st.markdown("<div class='header-text'>⚙️ 가공 설정</div>", unsafe_allow_html=True)
            st.session_state.report_type = st.radio("기본 리포트 설정", ["Final Performance", "Daily Operations"], horizontal=True)
            media_list = ['네이버GFA', '카카오', '구글', '메타']
            # Find index of saved media
            media_idx = media_list.index(st.session_state.selected_media) if st.session_state.selected_media in media_list else 0
            selected_media = st.selectbox("매체 선택", media_list, index=media_idx)
            base_fee = st.number_input("수수료 (%)", value=float(st.session_state.base_fee))
            include_vat = st.toggle("VAT (10%) 포함 정산", value=st.session_state.include_vat)
            dmp_input = st.text_area("DMP Keywords", value=st.session_state.dmp_keywords)
            
            # Sync back to session for saving
            st.session_state.selected_media = selected_media
            st.session_state.base_fee = base_fee
            st.session_state.include_vat = include_vat
            st.session_state.dmp_keywords = dmp_input
            st.markdown("</div>", unsafe_allow_html=True)
            
        with col_s2:
            st.markdown("<div class='glass-card'>", unsafe_allow_html=True)
            st.markdown("<div class='header-text'>💰 예산 및 기간 설정</div>", unsafe_allow_html=True)
            
            # Show current selected campaign name (Read-only for consistency)
            st.info(f"현재 선택된 캠페인: **{st.session_state.campaign_config['name']}**")
            
            c_budget = st.number_input("총 예산 (원)", value=float(st.session_state.campaign_config['budget']), step=1000000.0)
            c_start = st.date_input("시작일", value=st.session_state.campaign_config['start'])
            c_end = st.date_input("종료일", value=st.session_state.campaign_config['end'])
            
            if st.button("💾 모든 설정 저장 (DB)"):
                c_name = st.session_state.campaign_config['name']
                config = {
                    "name": c_name, "budget": c_budget, "start": str(c_start), "end": str(c_end),
                    "base_fee": st.session_state.base_fee,
                    "include_vat": st.session_state.include_vat,
                    "dmp_keywords": st.session_state.dmp_keywords,
                    "selected_media": st.session_state.selected_media,
                    "group_cols": st.session_state.saved_group_cols,
                    "brand_color": st.session_state.brand_color,
                    "logo_url": st.session_state.logo_url
                }
                success, msg = st.session_state.db_manager.save_campaign_config(c_name, config)
                if success: 
                    st.session_state.campaign_config = {"name": c_name, "budget": c_budget, "start": c_start, "end": c_end}
                    st.success("캠페인의 모든 설정이 DB에 저장되었습니다.")
                else: st.error(msg)
            st.markdown("</div>", unsafe_allow_html=True)

        st.markdown("<div class='glass-card'>", unsafe_allow_html=True)
        st.markdown("<div class='header-text'>🎯 필터 및 집계 구조 설정</div>", unsafe_allow_html=True)
        
        # Original Columns from Excel
        raw_cols = st.session_state.df_raw.columns.tolist()
        metrics_to_exclude = ['노출', '클릭', '총 비용', '클릭수', '노출수', 'CTR', 'CPC', 'CPM', '집행 금액', 'has_dmp']
        dim_candidates = [c for c in raw_cols if c not in metrics_to_exclude]
        
        f_col1, f_col2 = st.columns(2)
        with f_col1:
            # Filtering based on original column name
            camp_col_name = next((c for c in ['캠페인 이름', '캠페인'] if c in raw_cols), None)
            if camp_col_name:
                selected_cams = st.multiselect(f"🏢 {camp_col_name} 필터링", st.session_state.df_raw[camp_col_name].unique())
            else:
                selected_cams = []
        with f_col2:
            # SAFE DEFAULT: Use saved_group_cols if they exist in dim_candidates
            valid_saved_defaults = [d for d in st.session_state.saved_group_cols if d in dim_candidates]
            
            # If nothing valid, fallback to 날짜/캠페인 if they exist
            if not valid_saved_defaults:
                valid_saved_defaults = [d for d in ['날짜', '캠페인 이름', '캠페인'] if d in dim_candidates]
                
            group_cols = st.multiselect("📊 데이터 집계 기준 (Group By)", dim_candidates, default=valid_saved_defaults, help="엑셀 파일의 실제 컬럼명을 선택하여 데이터를 집계할 수 있습니다.")
            st.session_state.saved_group_cols = group_cols # Sync for persistence
            
            split_by_dmp = st.checkbox("🧩 DMP 및 매체별 성과 분리 (선택)", value=False, help="체크 시 초기 설정한 매체와 추출된 DMP 종류를 기준으로 데이터를 추가 분리합니다.")
            
            st.caption("💡 '일일 운영' 분석을 사용하시려면 **'날짜'** 기준을 반드시 포함해 주세요.")
        
        if st.button("✨ 데이터 가공 시작 (Apply)", type="primary", use_container_width=True):
            df_work = st.session_state.df_raw.copy()
            if selected_cams and camp_col_name: 
                df_work = df_work[df_work[camp_col_name].isin(selected_cams)]
            
            # Numeric cleaning
            for col in ['노출', '클릭', '총 비용']:
                if col in df_work.columns: 
                    df_work[col] = df_work[col].apply(clean_numeric)
            
            # Processing (calculate individual costs)
            keywords = [k.strip() for k in dmp_input.split(',')]
            df_processed = calculate_metrics(df_work, base_fee, selected_media, keywords, include_vat)
            
            # Aggregation based on user choice (using original names)
            if group_cols:
                # Group metrics (ensure columns exist)
                actual_metrics = {c: 'sum' for c in ['노출', '클릭', '집행 금액', 'NET가', '총 비용'] if c in df_processed.columns}
                
                final_group_cols = group_cols.copy()
                if split_by_dmp:
                    for c in ['매체', 'DMP종류', 'has_dmp']:
                        if c in df_processed.columns and c not in final_group_cols:
                            final_group_cols.append(c)
                else:
                    # If not splitting by DMP, ensure we don't accidentally lose these overall values by summing them up
                    # though DMP종류 and 매체 are strings so sum won't work, so we just let them drop from groupby 
                    # actually we should keep the first value or drop them. dropping them is safest.
                    pass
                df_processed = df_processed.groupby(final_group_cols).agg(actual_metrics).reset_index()
            
            # Post-Renaming for internal compatibility (Report Gen, etc.)
            rename_map = {'캠페인 이름': '캠페인', '게재 위치': '지면', '광고 소재 이름': '소재'}
            df_processed = df_processed.rename(columns={k: v for k, v in rename_map.items() if k in df_processed.columns})
            
            # DB 저장용 전체 데이터는 별도 저장 (정산 분석용)
            st.session_state.full_processed_df = df_processed.copy()
            
            # Background logic: Send to DB implicitly for settlement module
            c_name = st.session_state.campaign_config.get('name', 'Unknown')
            if c_name and c_name != "선택 안함":
                st.session_state.db_manager.save_background_settlement(st.session_state.full_processed_df, c_name)
            
            # Security Patch: NET 관련 컬럼 삭제 (일반 성과 뷰용)
            cols_to_drop = [c for c in ['총 비용', 'has_dmp', 'NET', 'NET가'] if c in df_processed.columns]
            if cols_to_drop:
                df_processed = df_processed.drop(columns=cols_to_drop)
                
            st.session_state.growth_data = st.session_state.db_manager.compare_with_history(df_processed)
            st.session_state.processed_df = df_processed
            st.success("데이터 가공 완료! 하단 프리뷰 및 다른 탭에서 결과를 확인하세요.")

    # Show preview if processed_df exists
    if st.session_state.processed_df is not None:
        st.markdown("<div class='glass-card'>", unsafe_allow_html=True)
        st.markdown("<div class='header-text'>📝 가공 결과 프리뷰 (상위 5행)</div>", unsafe_allow_html=True)
        st.dataframe(st.session_state.processed_df.head(5), use_container_width=True)
        st.caption(f"총 {len(st.session_state.processed_df)}개의 집계 데이터가 생성되었습니다. 상세 내역은 '데이터 뷰어' 탭을 이용해 주세요.")
        st.markdown("</div>", unsafe_allow_html=True)

# --- TAB 2: 일일 운영 (Daily Ops) ---
with tabs[1]:
    st.session_state.current_step = 2
    if st.session_state.processed_df is None:
        st.info("먼저 '데이터 관리' 탭에서 파일을 업로드하고 '데이터 가공 시작'을 클릭하세요.")
    else:
        cfg = st.session_state.campaign_config
        df = st.session_state.processed_df
        budget_metrics = calculate_budget_metrics(df, cfg['budget'])
        pacing_idx, pacing_status = calculate_pacing(budget_metrics['spent'], cfg['budget'], cfg['start'], cfg['end'])
        
        # Dashboard Header
        st.markdown("<div class='m-grid'>", unsafe_allow_html=True)
        st.markdown(f"<div class='m-card'><div class='m-label'>오늘 누적 소진액</div><div class='m-value'>{budget_metrics['spent']:,.0f}원</div></div>", unsafe_allow_html=True)
        st.markdown(f"<div class='m-card'><div class='m-label'>잔여 예산</div><div class='m-value'>{budget_metrics['remaining']:,.0f}원</div></div>", unsafe_allow_html=True)
        st.markdown(f"<div class='m-card'><div class='m-label'>Pacing Status</div><div class='m-value'>{pacing_status}</div><div class='m-status'>Index: {pacing_idx:.1f}</div></div>", unsafe_allow_html=True)
        st.markdown("</div>", unsafe_allow_html=True)

        v1, v2 = st.columns([2, 1])
        with v1:
            st.markdown("<div class='glass-card'>", unsafe_allow_html=True)
            st.markdown("<div class='header-text'>📈 일별 집행 추이</div>", unsafe_allow_html=True)
            acc_df = prepare_daily_accumulation(df)
            if not acc_df.empty:
                fig = go.Figure()
                fig.add_trace(go.Scatter(x=acc_df['날짜'], y=acc_df['누적 집행 금액'], fill='tozeroy', name='누적 지출', line_color=st.session_state.brand_color))
                fig.add_hline(y=cfg['budget'], line_dash="dash", line_color="#ef4444", annotation_text="Total Budget")
                fig.update_layout(height=350, margin=dict(l=20, r=20, t=20, b=20), paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)')
                st.plotly_chart(fig, use_container_width=True)
            else:
                st.warning("표시할 누적 데이터가 없습니다. 날짜 정보가 포함된 파일을 업로드했는지 확인하세요.")
            st.markdown("</div>", unsafe_allow_html=True)

        with v2:
            st.markdown("<div class='glass-card'>", unsafe_allow_html=True)
            st.markdown("<div class='header-text'>⭕ 소진율 (Burn Rate)</div>", unsafe_allow_html=True)
            fig_gauge = go.Figure(go.Indicator(
                mode = "gauge+number",
                value = budget_metrics['burn_rate'],
                gauge = {'axis': {'range': [0, 100]}, 'bar': {'color': st.session_state.brand_color}}
            ))
            fig_gauge.update_layout(height=280, margin=dict(l=30, r=30, t=30, b=10))
            st.plotly_chart(fig_gauge, use_container_width=True)
            st.markdown("</div>", unsafe_allow_html=True)

# --- TAB 3: 데이터 교정 (Data Correction) ---
# --- TAB 3: 데이터 교정 (Data Correction) ---
with tabs[2]:
    st.session_state.current_step = 3
    st.markdown("<div class='glass-card'>", unsafe_allow_html=True)
    st.markdown("<div class='header-text'>✍️ 데이터 교합 및 교정</div>", unsafe_allow_html=True)
    st.info("💡 여기서 수정한 데이터는 다른 분석 모듈 및 최종 리포트에 즉시 반영됩니다.")
    
    if st.session_state.processed_df is not None:
        edited_df = st.data_editor(st.session_state.processed_df, use_container_width=True, num_rows="dynamic", key="main_editor_v2")
        st.session_state.processed_df = edited_df
        
        c1, c2 = st.columns(2)
        with c1:
            if st.button("💾 Cloud DB에 현재 데이터 저장", use_container_width=True):
                c_name = st.session_state.campaign_config['name']
                df_to_save = st.session_state.processed_df.copy()
                
                # 병합: 사용자가 수정한 데이터(df_to_save)에 숨겨진 정산 관련 컬럼을 다시 붙임
                if 'full_processed_df' in st.session_state:
                    restore_cols = [c for c in ['총 비용', 'has_dmp', 'NET', 'NET가', 'DMP종류', '매체'] if c in st.session_state.full_processed_df.columns]
                    if restore_cols and len(st.session_state.full_processed_df) == len(df_to_save):
                        # 행 순서가 동일하다는 가정 하에 값만 덮어씌움
                        df_to_save[restore_cols] = st.session_state.full_processed_df[restore_cols].values
                        
                success, msg = st.session_state.db_manager.save_data(df_to_save, campaign_name=c_name)
                if success: st.success(msg)
                else: st.error(msg)
        with c2:
            output = io.BytesIO()
            with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
                st.session_state.processed_df.to_excel(writer, index=False)
            st.download_button("📥 Master Excel 다운로드", data=output.getvalue(), file_name="Master_Data.xlsx", use_container_width=True)
    else:
        st.warning("표시할 가공된 데이터가 없습니다. 1단계에서 가공을 완료해 주세요.")
    st.markdown("</div>", unsafe_allow_html=True)

# --- TAB 4: 정산 분석 (Settlement Analysis) ---
with tabs[3]:
    st.session_state.current_step = 4
    st.markdown("<div class='glass-card'>", unsafe_allow_html=True)
    st.markdown("<div class='header-text'>📊 On-Demand 정산 분석 (DMP NET가)</div>", unsafe_allow_html=True)
    st.info("이 탭은 DB에 저장된 데이터를 기반으로 DMP별 NET가 및 집행 금액을 조회합니다.")
    
    # Filtering for settlement
    sc1, sc2, sc3 = st.columns([2, 2, 1])
    with sc1:
        s_camp_list, _ = st.session_state.db_manager.list_campaigns()
        selected_s_camp = st.selectbox("정산 캠페인 선택", ["선택 안함"] + s_camp_list, key="settle_camp_select")
    with sc2:
        today = datetime.now()
        s_date_range = st.date_input("정산 기간 선택", value=[today, today], key="settle_date_sel")
    with sc3:
        st.write("") # Padding
        st.write("")
        fetch_settle = st.button("🔍 조회", use_container_width=True)

    if fetch_settle and selected_s_camp != "선택 안함":
        start_d = s_date_range[0]
        end_d = s_date_range[1] if len(s_date_range) > 1 else start_d
        s_df, msg = st.session_state.db_manager.get_settlement_data(selected_s_camp, start_d, end_d)
        
        if s_df is not None and not s_df.empty:
            st.session_state.settlement_df = s_df
            st.success(msg)
        else:
            st.warning(msg)
            
    if 'settlement_df' in st.session_state and st.session_state.settlement_df is not None:
        sdf = st.session_state.settlement_df
        
        # Backward compatibility for older data without NET/DMP columns
        if 'NET가' not in sdf.columns: sdf['NET가'] = 0
        if 'DMP종류' not in sdf.columns: sdf['DMP종류'] = 'N/A'
        if '매체' not in sdf.columns: sdf['매체'] = 'N/A'
        
        st.markdown("<div class='m-grid'>", unsafe_allow_html=True)
        st.markdown(f"<div class='m-card'><div class='m-label'>총 정산 대상 금액</div><div class='m-value'>{sdf.get('집행 금액', pd.Series([0])).sum():,.0f}원</div><div class='m-status'>💰 Settlement Base</div></div>", unsafe_allow_html=True)
        st.markdown(f"<div class='m-card'><div class='m-label'>총 NET가</div><div class='m-value'>{sdf['NET가'].sum():,.0f}원</div><div class='m-status'>📉 DMP Net Price</div></div>", unsafe_allow_html=True)
        st.markdown("</div>", unsafe_allow_html=True)

        st.markdown("<div class='glass-card'>", unsafe_allow_html=True)
        st.markdown("<div class='header-text'>📑 매체/DMP별 정산 상세 내역</div>", unsafe_allow_html=True)
        pivot_sdf = sdf.pivot_table(index=['매체', 'DMP종류'], values=['집행 금액', 'NET가'], aggfunc='sum').reset_index()
        st.dataframe(pivot_sdf, use_container_width=True)
        
        with st.expander("🔍 전체 RAW 정산 데이터 확인"):
            st.dataframe(sdf, use_container_width=True)
        st.markdown("</div>", unsafe_allow_html=True)
    st.markdown("</div>", unsafe_allow_html=True)

# --- TAB 5: 리포트 빌더 (Report Builder) ---
with tabs[4]:
    st.session_state.current_step = 5
    if st.session_state.processed_df is None:
        st.info("먼저 데이터를 가공해 주세요.")
    else:
        df = st.session_state.processed_df
        cfg = st.session_state.campaign_config
        
        # Campaign Target Settings (Benchmarking)
        st.markdown("<div class='glass-card'>", unsafe_allow_html=True)
        st.markdown("<div class='header-text'>🎯 캠페인 성과 벤치마킹 설정</div>", unsafe_allow_html=True)
        
        t_col1, t_col2 = st.columns(2)
        existing_targets = st.session_state.db_manager.get_campaign_targets(selected_camp) if selected_camp != "선택 안함" else None
        d_cpc = existing_targets.get('target_cpc', 0) if existing_targets else 0
        d_ctr = existing_targets.get('target_ctr', 0.0) if existing_targets else 0.0

        t_cpc = t_col1.number_input("기대 CPC (원)", value=int(d_cpc), step=10, key="rep_target_cpc")
        t_ctr = t_col2.number_input("기대 CTR (%)", value=float(d_ctr), step=0.1, format="%.2f", key="rep_target_ctr")
        
        if st.button("목표치 저장 및 적용", use_container_width=True):
            if selected_camp != "선택 안함":
                success, msg = st.session_state.db_manager.save_campaign_targets(selected_camp, {'target_cpc': t_cpc, 'target_ctr': t_ctr})
                if success: st.success(f"[{selected_camp}] 목표달성률 기준이 업데이트되었습니다.")
                else: st.error(msg)
            else: st.warning("캠페인을 선택해주세요.")
        st.markdown("</div>", unsafe_allow_html=True)

        # Report Action Builder
        st.markdown("<div class='glass-card'>", unsafe_allow_html=True)
        st.markdown("<div class='header-text'>🛠️ 리포트 자동 생성 빌더</div>", unsafe_allow_html=True)
        
        st.markdown("**1. 리포트 목적 선택**")
        report_kind = st.radio("발행할 리포트의 종류를 선택하세요.", 
            ["일일 운영 보고서 (데일리 트래킹)", "최종 마감 보고서 (매체/소재 총괄)"], 
            horizontal=True, key="report_kind_selector", label_visibility="collapsed")
        
        st.markdown("<br>", unsafe_allow_html=True)
        rep_col1, rep_col2, rep_col3 = st.columns([1, 1, 1])
        with rep_col1:
            st.markdown("**2. 포함할 측정 지표**")
            m_cols = ['노출', '클릭', '집행 금액', 'CTR', 'CPC', 'CPM']
            selected_metrics = [m for m in m_cols if st.checkbox(m, value=True, key=f"final_m_{m}")]
        with rep_col2:
            st.markdown("**3. 분석 차원 선택**")
            d_cols = ['날짜', '캠페인', '지면', '소재', '매체', 'DMP종류']
            selected_dims = [d for d in d_cols if d in df.columns and st.checkbox(d, value=(d in ['날짜', '캠페인']), key=f"final_d_{d}")]
        with rep_col3:
            st.markdown("**4. 차트 표시 옵션**")
            show_trend_chart = st.checkbox("📈 일별 소진 추이 차트", value=True, key="opt_trend")
            show_media_chart = st.checkbox("🍩 매체별 비중 차트", value=True, key="opt_media")
            show_creative_chart = st.checkbox("🖼️ 소재별 비중 차트", value=True, key="opt_creative")
            show_placement_chart = st.checkbox("📱 지면별 비중 차트", value=True, key="opt_placement")

        st.markdown("**5. 전문가 운영 인사이트**")
        op_insights = st.text_area("인사이트를 입력하세요.", placeholder="리포트의 최상단에 강조되어 표시됩니다.", height=100)
        
        if st.button("📄 프리미어 HTML 리포트 발행", type="primary", use_container_width=True):
            from report_generator import generate_daily_report_html, generate_media_report_html, generate_creative_report_html, generate_media_creative_report_html
            final_cols = selected_dims + selected_metrics
            
            if not final_cols: st.error("항목을 선택하세요.")
            else:
                if report_kind.startswith("일일"):
                    st.session_state.html_report = generate_daily_report_html(
                        df, cfg, title=f"{cfg['name']} 일일 운영 보고서",
                        theme_color=st.session_state.brand_color, logo_url=st.session_state.logo_url,
                        selected_cols=final_cols, insights=op_insights,
                        target_cpc=t_cpc, target_ctr=t_ctr,
                        show_trend_chart=show_trend_chart, show_media_chart=show_media_chart,
                        show_creative_chart=show_creative_chart, show_placement_chart=show_placement_chart
                    )
                else:
                    if '매체' in selected_dims and '소재' in selected_dims:
                        st.session_state.html_report = generate_media_creative_report_html(df, insights=op_insights)
                    elif '매체' in selected_dims:
                        st.session_state.html_report = generate_media_report_html(df, insights=op_insights)
                    elif '소재' in selected_dims:
                        st.session_state.html_report = generate_creative_report_html(df, insights=op_insights)
                    else:
                        from report_generator import generate_premium_html
                        st.session_state.html_report = generate_premium_html(
                            df, title=f"{cfg['name']} 최종 성과 보고서", selected_cols=final_cols, insights=op_insights,
                            show_trend_chart=show_trend_chart, show_media_chart=show_media_chart,
                            show_creative_chart=show_creative_chart, show_placement_chart=show_placement_chart
                        )
                
                st.success("고급 리포트 생성이 완료되었습니다!")
                st.download_button("📥 리포트 파일 내려받기", data=st.session_state.html_report, file_name=f"Advanced_Report_{cfg['name']}.html", mime="text/html", use_container_width=True)
        st.markdown("</div>", unsafe_allow_html=True)

st.markdown("<div style='text-align: center; color: var(--text-sub); font-size: 0.8rem; margin: 4rem 0 2rem 0;'>© 2026 GFA RAW MASTER PRO | Powered by Advanced Data Engine</div>", unsafe_allow_html=True)

