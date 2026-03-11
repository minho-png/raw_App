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
    merge_raw_data, detect_anomalies
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
if 'logo_url' not in st.session_state: st.session_state.logo_url = None

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

# --- Step Navigator ---
steps = ["Upload", "Settings", "Preview", "Insight"]
step_cols = st.columns(len(steps))
current_idx = st.session_state.current_step - 1

step_html = "<div class='stepper-box'>"
for i, s in enumerate(steps):
    active_class = "active" if i == current_idx else ""
    step_html += f"<div class='step-item {active_class}'><span class='step-num'>{i+1}</span><br>{s}</div>"
step_html += "</div>"
st.markdown(step_html, unsafe_allow_html=True)

# --- STEP 1: Upload ---
if st.session_state.current_step == 1:
    st.markdown("<div class='glass-card'>", unsafe_allow_html=True)
    st.markdown("<div class='header-text'>📤 Data Upload</div>", unsafe_allow_html=True)
    uploaded_files = st.file_uploader("result.csv 파일들을 선택하세요", type=['csv'], accept_multiple_files=True)
    
    if uploaded_files:
        if st.button("Next: Configure", type="primary"):
            dfs = [load_data_with_encoding(f) for f in uploaded_files]
            st.session_state.df_raw = merge_raw_data(dfs)
            st.session_state.current_step = 2
            st.rerun()
    st.markdown("</div>", unsafe_allow_html=True)

# --- STEP 2: Settings ---
elif st.session_state.current_step == 2:
    col_s1, col_s2 = st.columns([1, 1])
    with col_s1:
        st.markdown("<div class='glass-card'>", unsafe_allow_html=True)
        st.markdown("<div class='header-text'>⚙️ Processing Options</div>", unsafe_allow_html=True)
        media_list = ['네이버GFA', '카카오', '구글', '메타']
        selected_media = st.selectbox("매체 선택", media_list)
        base_fee = st.number_input("수수료 (%)", value=15.0)
        include_vat = st.toggle("VAT (10%) 포함 정산")
        dmp_input = st.text_area("DMP Keywords", value="SKP, LOTTE, TG360, WIFI")
        st.markdown("</div>", unsafe_allow_html=True)
        
    with col_s2:
        st.markdown("<div class='glass-card'>", unsafe_allow_html=True)
        st.markdown("<div class='header-text'>🎯 Target Filters</div>", unsafe_allow_html=True)
        # Rename for internal logic
        df_target = st.session_state.df_raw.rename(columns={'캠페인 이름': '캠페인', '게재 위치': '지면', '광고 소재 이름': '소재'})
        
        if '캠페인' in df_target.columns:
            cams = st.multiselect("Select Campaigns", df_target['캠페인'].unique())
        else:
            cams = []
            st.warning("캠페인 이름 열을 찾을 수 없습니다.")
        
        if st.button("Generate Master Data", type="primary"):
            df_work = df_target.copy()
            if cams: df_work = df_work[df_work['캠페인'].isin(cams)]
            
            # Numeric cleaning
            for col in ['노출', '클릭', '총 비용']:
                if col in df_work.columns: df_work[col] = df_work[col].apply(clean_numeric)
            
            # Processing
            keywords = [k.strip() for k in dmp_input.split(',')]
            df_processed = calculate_metrics(df_work, base_fee, selected_media, keywords, include_vat)
            
            # Security Patch: 최종 결과물에서 '총 비용' 및 내부 컬럼 삭제
            # 사용자는 오직 '집행 금액'만 볼 수 있어야 함
            cols_to_drop = [c for c in ['총 비용', 'has_dmp', 'NET', 'NET가'] if c in df_processed.columns]
            if cols_to_drop:
                df_processed = df_processed.drop(columns=cols_to_drop)
                
            # History Comparison
            st.session_state.growth_data = st.session_state.db_manager.compare_with_history(df_processed)
            st.session_state.processed_df = df_processed
            st.session_state.current_step = 3
            st.rerun()
        st.markdown("</div>", unsafe_allow_html=True)

# --- STEP 3: Preview ---
elif st.session_state.current_step == 3:
    st.markdown("<div class='glass-card'>", unsafe_allow_html=True)
    st.markdown("<div class='header-text'>✨ Data Preview & Export</div>", unsafe_allow_html=True)
    st.dataframe(st.session_state.processed_df.head(100), use_container_width=True)
    
    c1, c2, c3 = st.columns(3)
    with c1:
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
            st.session_state.processed_df.to_excel(writer, index=False)
        st.download_button("📥 Download Excel", data=output.getvalue(), file_name="Master_Data.xlsx")
    with c2:
        if st.button("💾 Save to Cloud DB"):
            success, msg = st.session_state.db_manager.save_data(st.session_state.processed_df)
            if success: st.success(msg)
            else: st.error(msg)
    with c3:
        if st.button("Go to Analysis →", type="primary"):
            st.session_state.current_step = 4
            st.rerun()
    st.markdown("</div>", unsafe_allow_html=True)

# --- STEP 4: Insight Dashboard ---
elif st.session_state.current_step == 4:
    # Metric Row
    df = st.session_state.processed_df
    m1, m2, m3, m4 = st.columns(4)
    growth = st.session_state.growth_data or {}
    
    def metric_card(col, label, val, unit="", growth_val=None):
        with col:
            st.markdown(f"""
            <div class='m-card'>
                <div class='m-label'>{label}</div>
                <div class='m-value'>{val:,.0f}{unit}</div>
                {"<div class='m-growth growth-up'>▲ " + f"{growth_val:.1f}%" + " (WoW)</div>" if growth_val and growth_val > 0 else ""}
                {"<div class='m-growth growth-down'>▼ " + f"{growth_val:.1f}%" + " (WoW)</div>" if growth_val and growth_val < 0 else ""}
            </div>
            """, unsafe_allow_html=True)

    metric_card(m1, "Execution Cost", df['집행 금액'].sum(), "원", growth.get('집행 금액'))
    metric_card(m2, "Impressions", df['노출'].sum(), "", growth.get('노출'))
    metric_card(m3, "Clicks", df['클릭'].sum(), "", growth.get('클릭'))
    ctr = (df['클릭'].sum() / df['노출'].sum() * 100) if df['노출'].sum() > 0 else 0
    metric_card(m4, "Avg CTR", ctr, "%")

    # Visuals
    v1, v2 = st.columns([2, 1])
    with v1:
        st.markdown("<div class='glass-card'>", unsafe_allow_html=True)
        if '날짜' in df.columns:
            # Group by data if needed
            trend_df = df.groupby('날짜').agg({'집행 금액': 'sum', '클릭': 'sum'}).reset_index()
            fig = px.area(trend_df, x='날짜', y='집행 금액', title="Spending Trend")
            fig.update_layout(height=350, margin=dict(l=20, r=20, t=40, b=20), paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)')
            st.plotly_chart(fig, use_container_width=True)
        st.markdown("</div>", unsafe_allow_html=True)
    
    with v2:
        st.markdown("<div class='glass-card'>", unsafe_allow_html=True)
        anomalies = detect_anomalies(df)
        st.markdown("<div class='header-text' style='font-size:1rem'>💡 Insights</div>", unsafe_allow_html=True)
        if anomalies:
            for a in anomalies: st.info(a)
        else:
            st.success("지표가 모두 안정적입니다.")
        st.markdown("</div>", unsafe_allow_html=True)

    # Report Downloader
    st.markdown("<div class='glass-card' style='text-align:center'>", unsafe_allow_html=True)
    if st.button("🎨 Generate Premium Report", type="primary"):
        html = generate_premium_html(df, 
                                     growth_data=growth, 
                                     theme_color=st.session_state.brand_color,
                                     logo_url=st.session_state.logo_url)
        st.session_state.html_report = html
        st.success("Report Generated!")
    
    if 'html_report' in st.session_state:
        c_down1, c_down2 = st.columns(2)
        with c_down1:
            st.download_button("📄 HTML Report", data=st.session_state.html_report, file_name="GFA_Report.html", mime="text/html")
        with c_down2:
            if PDF_SUPPORT:
                pdf = generate_pdf_report(st.session_state.html_report)
                st.download_button("📕 PDF Report", data=pdf, file_name="GFA_Report.pdf", mime="application/pdf")
    st.markdown("</div>", unsafe_allow_html=True)

if st.button("🏠 Start Over"):
    st.session_state.current_step = 1
    st.session_state.processed_df = None
    st.session_state.df_raw = None
    st.rerun()

st.markdown("<div class='footer'>© 2026 GFA RAW MASTER PRO</div>", unsafe_allow_html=True)

