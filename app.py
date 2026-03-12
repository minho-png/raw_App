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
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Pretendard+Variable:wght@100..900&display=swap" rel="stylesheet">
<style>
    /* Stepper Styling */
    .stepper-box {
        display: flex;
        justify-content: space-between;
        margin-bottom: 2rem;
        background: white;
        padding: 1rem;
        border-radius: 12px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.02);
    }
    .step-item {
        flex: 1;
        text-align: center;
        position: relative;
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--text-sub);
    }
    .step-item.active {
        color: var(--primary);
    }
    .step-item.active .step-num {
        background: var(--primary);
        color: white;
    }
    .step-num {
        width: 24px;
        height: 24px;
        line-height: 24px;
        border-radius: 50%;
        background: #e2e8f0;
        display: inline-block;
        margin-bottom: 5px;
        font-size: 0.75rem;
    }

    /* Metric Card Premium */
    .m-card {
        background: white;
        border-radius: 12px;
        padding: 1.25rem;
        border: 1px solid #e2e8f0;
        text-align: left;
    }
    .m-label { color: var(--text-sub); font-size: 0.75rem; font-weight: 700; text-transform: uppercase; margin-bottom: 0.5rem; }
    .m-value { font-size: 1.5rem; font-weight: 800; color: var(--text-main); }
    .m-growth { font-size: 0.8rem; font-weight: 600; margin-top: 0.25rem; }
    .growth-up { color: #ef4444; }
    .growth-down { color: #22c55e; }
</style>
""", unsafe_allow_html=True)

# --- Initialization ---
if 'processed_df' not in st.session_state: st.session_state.processed_df = None
if 'df_raw' not in st.session_state: st.session_state.df_raw = None
if 'db_manager' not in st.session_state: st.session_state.db_manager = DatabaseManager()
if 'current_step' not in st.session_state: st.session_state.current_step = 1
if 'growth_data' not in st.session_state: st.session_state.growth_data = None
if 'brand_color' not in st.session_state: st.session_state.brand_color = "#AC0212"
if 'logo_url' not in st.session_state: st.session_state.logo_url = ""
if 'report_type' not in st.session_state: st.session_state.report_type = "Final Performance"
if 'campaign_config' not in st.session_state: st.session_state.campaign_config = {"name": "", "budget": 0, "start": datetime.now(), "end": datetime.now()}

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
st.markdown("<div class='main-title'>GFA RAW MASTER PRO</div>", unsafe_allow_html=True)
st.markdown("<div class='main-subtitle'>네이버 GFA 광고 성과를 완벽한 RAW 데이터로 가공하고 리포트를 생성하세요.</div>", unsafe_allow_html=True)

# --- TAB Navigator ---
tabs = st.tabs(["📁 데이터 관리", "📈 일일 운영", "🏆 최종 성과", "💾 데이터 뷰어"])

# --- TAB 1: 데이터 관리 ---
with tabs[0]:
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
                st.success(f"'{selected_camp}' 캠페인 정보 로드 완료")
                st.rerun()

    with c_col2:
        # Toggle for new campaign creation
        if st.checkbox("➕ 새 캠페인 생성하기"):
            new_camp_name = st.text_input("새 캠페인 이름")
            if st.button("생성 및 저장"):
                if new_camp_name and new_camp_name not in camp_list:
                    # Initialize with defaults
                    new_cfg = {"name": new_camp_name, "budget": 0, "start": str(datetime.now().date()), "end": str(datetime.now().date())}
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
            selected_media = st.selectbox("매체 선택", media_list)
            base_fee = st.number_input("수수료 (%)", value=15.0)
            include_vat = st.toggle("VAT (10%) 포함 정산")
            dmp_input = st.text_area("DMP Keywords", value="SKP, LOTTE, TG360, WIFI")
            st.markdown("</div>", unsafe_allow_html=True)
            
        with col_s2:
            st.markdown("<div class='glass-card'>", unsafe_allow_html=True)
            st.markdown("<div class='header-text'>💰 예산 및 기간 설정</div>", unsafe_allow_html=True)
            
            # Show current selected campaign name (Read-only for consistency)
            st.info(f"현재 선택된 캠페인: **{st.session_state.campaign_config['name']}**")
            
            c_budget = st.number_input("총 예산 (원)", value=float(st.session_state.campaign_config['budget']), step=1000000.0)
            c_start = st.date_input("시작일", value=st.session_state.campaign_config['start'])
            c_end = st.date_input("종료일", value=st.session_state.campaign_config['end'])
            
            if st.button("💾 예산 정보 업데이트 (DB)"):
                c_name = st.session_state.campaign_config['name']
                config = {"name": c_name, "budget": c_budget, "start": str(c_start), "end": str(c_end)}
                success, msg = st.session_state.db_manager.save_campaign_config(c_name, config)
                if success: 
                    st.session_state.campaign_config = {"name": c_name, "budget": c_budget, "start": c_start, "end": c_end}
                    st.success("캠페인 예산 정보가 업데이트되었습니다.")
                else: st.error(msg)
            st.markdown("</div>", unsafe_allow_html=True)

        st.markdown("<div class='glass-card'>", unsafe_allow_html=True)
        st.markdown("<div class='header-text'>🎯 필터 및 집계 구조 설정</div>", unsafe_allow_html=True)
        # Rename for internal logic
        df_target = st.session_state.df_raw.rename(columns={'캠페인 이름': '캠페인', '게재 위치': '지면', '광고 소재 이름': '소재'})
        
        f_col1, f_col2 = st.columns(2)
        with f_col1:
            cams = st.multiselect("캠페인 필터 선택", df_target['캠페인'].unique())
        with f_col2:
            group_options = ['날짜', '캠페인', '지면', '소재']
            # Find available columns in the DF
            available_groups = [c for c in group_options if c in df_target.columns]
            group_cols = st.multiselect("데이터 집계 기준 (Group By)", available_groups, default=['날짜', '캠페인'])
            st.caption("💡 '일일 운영' 분석을 사용하시려면 **'날짜'** 기준을 포함해 주세요.")
        
        if st.button("✨ 데이터 가공 시작 (Apply)", type="primary", use_container_width=True):
            df_work = df_target.copy()
            if cams: df_work = df_work[df_work['캠페인'].isin(cams)]
            
            # Numeric cleaning
            for col in ['노출', '클릭', '총 비용']:
                if col in df_work.columns: df_work[col] = df_work[col].apply(clean_numeric)
            
            # Processing (calculate individual costs)
            keywords = [k.strip() for k in dmp_input.split(',')]
            df_processed = calculate_metrics(df_work, base_fee, selected_media, keywords, include_vat)
            
            # Aggregation based on user choice
            if group_cols:
                # Group metrics appropriately
                agg_dict = {
                    '노출': 'sum',
                    '클릭': 'sum',
                    '집행 금액': 'sum'
                }
                # Keep only valid columns for grouping
                actual_groups = [c for c in group_cols if c in df_processed.columns]
                df_processed = df_processed.groupby(actual_groups).agg(agg_dict).reset_index()
            
            # Security Patch: NET 관련 컬럼 삭제
            cols_to_drop = [c for c in ['총 비용', 'has_dmp', 'NET', 'NET가'] if c in df_processed.columns]
            if cols_to_drop:
                df_processed = df_processed.drop(columns=cols_to_drop)
                
            st.session_state.growth_data = st.session_state.db_manager.compare_with_history(df_processed)
            st.session_state.processed_df = df_processed
            st.success("데이터 가공 완료! 다른 탭에서 성과를 확인하세요.")
        st.markdown("</div>", unsafe_allow_html=True)

# --- TAB 2: 일일 운영 (Daily Ops) ---
with tabs[1]:
    if st.session_state.processed_df is None:
        st.info("먼저 '데이터 관리' 탭에서 파일을 업로드하고 '데이터 가공 시작'을 클릭하세요.")
    else:
        cfg = st.session_state.campaign_config
        df = st.session_state.processed_df
        budget_metrics = calculate_budget_metrics(df, cfg['budget'])
        pacing_idx, pacing_status = calculate_pacing(budget_metrics['spent'], cfg['budget'], cfg['start'], cfg['end'])
        
        # Dashboard Header
        m1, m2, m3 = st.columns(3)
        with m1:
            st.markdown(f"<div class='m-card'><div class='m-label'>오늘 누적 소진액</div><div class='m-value'>{budget_metrics['spent']:,.0f}원</div></div>", unsafe_allow_html=True)
        with m2:
            st.markdown(f"<div class='m-card'><div class='m-label'>잔여 예산</div><div class='m-value'>{budget_metrics['remaining']:,.0f}원</div></div>", unsafe_allow_html=True)
        with m3:
            st.markdown(f"<div class='m-card'><div class='m-label'>Pacing Status</div><div class='m-value'>{pacing_status}</div><div class='m-growth'>Index: {pacing_idx:.1f}</div></div>", unsafe_allow_html=True)

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

        # Report Action
        if st.button("📄 일일 운영 HTML 리포트 생성", type="primary", use_container_width=True):
            from report_generator import generate_daily_report_html
            st.session_state.html_report = generate_daily_report_html(df, cfg, theme_color=st.session_state.brand_color, logo_url=st.session_state.logo_url)
            st.success("리포트가 생성되었습니다. '데이터 뷰어' 탭에서 다운로드하거나 아래 버튼을 클릭하세요.")
            st.download_button("📥 HTML 리포트 즉시 다운로드", data=st.session_state.html_report, file_name=f"Daily_Report_{cfg['name']}.html", mime="text/html")

# --- TAB 3: 최종 성과 (Final Performance) ---
with tabs[2]:
    if st.session_state.processed_df is None:
        st.info("먼저 '데이터 관리' 탭에서 데이터를 가공하세요.")
    else:
        df = st.session_state.processed_df
        growth = st.session_state.growth_data or {}
        
        # Metric Grid
        mc1, mc2, mc3, mc4 = st.columns(4)
        def draw_metric(col, label, val, unit, g_key):
            g_val = growth.get(g_key)
            with col:
                st.markdown(f"""
                <div class='m-card'>
                    <div class='m-label'>{label}</div>
                    <div class='m-value'>{val:,.0f}{unit}</div>
                    {"<div class='m-growth growth-up'>▲ " + f"{g_val:.1f}%" + "</div>" if g_val and g_val > 0 else ""}
                    {"<div class='m-growth growth-down'>▼ " + f"{g_val:.1f}%" + "</div>" if g_val and g_val < 0 else ""}
                </div>
                """, unsafe_allow_html=True)

        draw_metric(mc1, "Total Cost", df['집행 금액'].sum(), "원", "집행 금액")
        draw_metric(mc2, "Impressions", df['노출'].sum(), "", "노출")
        draw_metric(mc3, "Clicks", df['클릭'].sum(), "", "클릭")
        ctr = (df['클릭'].sum() / df['노출'].sum() * 100) if df['노출'].sum() > 0 else 0
        draw_metric(mc4, "Avg CTR", ctr, "%", None)

        # Charts
        v1, v2 = st.columns([2, 1])
        with v1:
            st.markdown("<div class='glass-card'>", unsafe_allow_html=True)
            if '날짜' in df.columns and not df.empty:
                trend_df = df.groupby('날짜').agg({'집행 금액': 'sum', '클릭': 'sum'}).reset_index()
                fig = px.area(trend_df, x='날짜', y='집행 금액', title="Spending Trend")
                fig.update_layout(height=400, paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)')
                st.plotly_chart(fig, use_container_width=True)
            else:
                st.warning("표시할 트렌드 데이터가 없습니다. 날짜 정보가 포함된 파일을 업로드했는지 확인하세요.")
            st.markdown("</div>", unsafe_allow_html=True)
        
        with v2:
            st.markdown("<div class='glass-card'>", unsafe_allow_html=True)
            st.markdown("<div class='header-text' style='font-size:1rem'>💡 Insight Notifications</div>", unsafe_allow_html=True)
            anomalies = detect_anomalies(df)
            if anomalies:
                for a in anomalies: st.info(a)
            else: st.success("모든 소재 성과가 안정적입니다.")
            st.markdown("</div>", unsafe_allow_html=True)

        if st.button("🏆 최종 성과 프리미엄 리포트 생성", type="primary", use_container_width=True):
            st.session_state.html_report = generate_premium_html(df, growth_data=growth, theme_color=st.session_state.brand_color, logo_url=st.session_state.logo_url)
            st.success("리포트 생성 완료!")
            st.download_button("📥 성과 리포트 즉시 다운로드", data=st.session_state.html_report, file_name="Final_Performance_Report.html", mime="text/html")

# --- TAB 4: 데이터 뷰어 (Data Viewer) ---
with tabs[3]:
    if st.session_state.processed_df is None:
        st.info("표시할 결과 데이터가 없습니다.")
    else:
        st.markdown("<div class='glass-card'>", unsafe_allow_html=True)
        st.markdown("<div class='header-text'>✨ Processed Data Preview</div>", unsafe_allow_html=True)
        st.dataframe(st.session_state.processed_df, use_container_width=True)
        
        c1, c2, c3 = st.columns(3)
        with c1:
            output = io.BytesIO()
            with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
                st.session_state.processed_df.to_excel(writer, index=False)
            st.download_button("📥 Master Excel 다운로드", data=output.getvalue(), file_name="Master_Data.xlsx")
        with c2:
            if st.button("💾 Cloud DB에 결과 저장"):
                c_name = st.session_state.campaign_config['name']
                success, msg = st.session_state.db_manager.save_data(st.session_state.processed_df, campaign_name=c_name)
                if success: st.success(msg)
                else: st.error(msg)
        with c3:
            if st.button("🧹 전체 초기화 (Start Over)"):
                st.session_state.processed_df = None
                st.session_state.df_raw = None
                st.rerun()
        st.markdown("</div>", unsafe_allow_html=True)

st.markdown("<div class='footer'>© 2026 GFA RAW MASTER PRO | Premium Agency Solution</div>", unsafe_allow_html=True)

