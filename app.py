import pandas as pd
# Deployment Trigger: v1.0.4
import streamlit as st
import io
from database_manager import DatabaseManager
from report_generator import generate_premium_html, generate_pdf_report, PDF_SUPPORT
from datetime import datetime
from logic import parse_naver_date, get_day_of_week, calculate_metrics, clean_placement, clean_numeric

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
    :root {
        --primary: #00c73c;
        --secondary: #008729;
        --bg: #f8fafc;
        --card-bg: rgba(255, 255, 255, 0.9);
        --text-main: #0f172a;
        --text-sub: #64748b;
        --border-color: rgba(0, 0, 0, 0.05);
    }

    * {
        font-family: 'Pretendard Variable', 'Inter', sans-serif !important;
    }

    .stApp {
        background: radial-gradient(circle at top left, #f8fafc, #e2e8f0);
        color: var(--text-main);
    }

    /* Professional Glass Cards */
    .glass-card {
        background: var(--card-bg);
        border: 1px solid var(--border-color);
        border-radius: 16px;
        padding: 1.5rem;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
        margin-bottom: 20px;
    }

    /* Refined Title */
    .main-title {
        font-size: 2.5rem;
        font-weight: 800;
        letter-spacing: -0.05rem;
        background: linear-gradient(135deg, var(--text-main), var(--secondary));
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        text-align: center;
        margin-top: 1rem;
    }

    .main-subtitle {
        text-align: center;
        color: var(--text-sub);
        font-weight: 500;
        margin-bottom: 2rem;
        font-size: 1.1rem;
    }

    /* Header Styling */
    .header-text {
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--text-main);
        margin-bottom: 1.5rem;
        padding-bottom: 0.5rem;
        border-bottom: 2px solid var(--primary);
        display: inline-block;
    }

    /* Buttons Unified Style */
    .stButton>button, .stDownloadButton>button {
        width: 100% !important;
        border-radius: 10px !important;
        height: 3.2em !important;
        background: #ffffff !important;
        color: var(--text-main) !important;
        border: 1px solid #e2e8f0 !important;
        font-weight: 600 !important;
        font-size: 0.95rem !important;
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
        box-shadow: 0 1px 3px rgba(0,0,0,0.05) !important;
    }

    .stButton>button:hover, .stDownloadButton>button:hover {
        border-color: var(--primary) !important;
        color: var(--primary) !important;
        background: rgba(0, 199, 60, 0.02) !important;
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0, 199, 60, 0.1) !important;
    }

    /* Action Buttons (Primary) */
    .primary-btn button {
        background: var(--primary) !important;
        color: white !important;
        border: none !important;
    }

    .primary-btn button:hover {
        background: var(--secondary) !important;
        color: white !important;
    }

    .section-label {
        font-size: 0.8rem;
        font-weight: 700;
        color: var(--text-sub);
        text-transform: uppercase;
        letter-spacing: 0.025rem;
        margin-bottom: 0.5rem;
        margin-top: 1rem;
    }

    .footer {
        text-align: center;
        margin-top: 4rem;
        padding: 2rem;
        color: var(--text-sub);
        font-size: 0.85rem;
        border-top: 1px solid #e2e8f0;
    }
</style>
""", unsafe_allow_html=True)

# --- Initialization ---
if 'processed_df' not in st.session_state: st.session_state.processed_df = None
if 'df_raw' not in st.session_state: st.session_state.df_raw = None
if 'last_uploaded_file' not in st.session_state: st.session_state.last_uploaded_file = None
if 'db_manager' not in st.session_state: st.session_state.db_manager = DatabaseManager()

# --- Sidebar for DB Connection Status ---
with st.sidebar:
    st.markdown("<div class='glass-card'>", unsafe_allow_html=True)
    st.markdown("<div class='header-text'>🔗 DB Status</div>", unsafe_allow_html=True)
    
    db_mgr = st.session_state.db_manager
    if db_mgr.conn_success:
        st.success("Connected to MongoDB")
    else:
        st.error(f"DB Error: {db_mgr.conn_msg}")
        with st.expander("Setup Help"):
            st.info("`.streamlit/secrets.toml` 파일에 `MONGODB_URI`를 설정하세요.")
    
    if st.button("🔄 Reconnect"):
        st.session_state.db_manager = DatabaseManager()
        st.rerun()
    st.markdown("</div>", unsafe_allow_html=True)

if 'db_data' not in st.session_state: st.session_state.db_data = None
if 'sql_result' not in st.session_state: st.session_state.sql_result = None

# --- Main Layout ---
st.markdown("<div class='main-title'>GFA RAW MASTER PRO</div>", unsafe_allow_html=True)
st.markdown("<div class='main-subtitle'>네이버 GFA 광고 성과를 완벽한 RAW 데이터로 가공하고 리포트를 생성하세요.</div>", unsafe_allow_html=True)

# --- Tabs ---
tab1, tab2, tab3 = st.tabs(["📊 RAW 데이터 가공", "📑 성과 분석 리포트", "🔍 데이터베이스 익스플로러"])

# --- Tab 1: RAW 데이터 가공 ---
with tab1:
    col1, col2 = st.columns([1, 3])
    
    with col1:
        st.markdown("<div class='glass-card'>", unsafe_allow_html=True)
        st.markdown("<div class='header-text'>🛠️ 가공 설정</div>", unsafe_allow_html=True)
        
        uploaded_file = st.file_uploader("result.csv 업로드", type=['csv', 'xlsx'])
        if uploaded_file != st.session_state.last_uploaded_file:
            st.session_state.df_raw = None
            st.session_state.processed_df = None
            st.session_state.last_uploaded_file = uploaded_file

        media_list = ['네이버GFA', '카카오', '구글', '메타']
        selected_media = st.selectbox("집행 매체", media_list, index=0)
        base_fee = st.number_input("기본 대행 수수료 (%)", min_value=0.0, max_value=100.0, value=15.0, step=0.5)
        
        with st.expander("🔍 DMP 키워드 관리"):
            dmp_input = st.text_area("DMP 키워드 (쉼표로 구분)", value="SKP, LOTTE, TG360, WIFI, 실내 위치")
            dmp_keywords = [k.strip() for k in dmp_input.split(',')]

        if uploaded_file is not None:
            if st.session_state.df_raw is None:
                try:
                    if uploaded_file.name.endswith('.csv'):
                        try: df = pd.read_csv(uploaded_file, encoding='utf-8')
                        except UnicodeDecodeError: df = pd.read_csv(uploaded_file, encoding='cp949')
                    else: df = pd.read_excel(uploaded_file)
                    st.session_state.df_raw = df
                except Exception as e: st.error(f"파일 오류: {e}")

            df_base = st.session_state.df_raw.copy()
            rename_map = {'캠페인 이름': '캠페인', '게재 위치': '지면', '광고 소재 이름': '소재'}
            df_base = df_base.rename(columns=rename_map)
            
            if '캠페인' in df_base.columns:
                all_campaigns = sorted(df_base['캠페인'].unique().tolist())
                selected_campaigns = st.multiselect("캠페인 선택", options=all_campaigns)
            
            if '기간' in df_base.columns:
                df_base['날짜'] = df_base['기간'].apply(parse_naver_date)
                df_base['요일'] = df_base['날짜'].apply(get_day_of_week)
            
            df_base['매체'] = selected_media
            
            all_cols = df_base.columns.tolist()
            suggested = [c for c in ['날짜', '광고 그룹 이름', '지면', '소재'] if c in all_cols]
            selected_groups = st.multiselect("그룹화 기준", options=all_cols, default=suggested)
            
            st.markdown("<div class='primary-btn'>", unsafe_allow_html=True)
            run_btn = st.button("🚀 RAW MASTER 생성")
            st.markdown("</div>", unsafe_allow_html=True)
        st.markdown("</div>", unsafe_allow_html=True)

    with col2:
        if uploaded_file and 'run_btn' in locals() and run_btn:
            with st.status("📊 데이터 처리 중...", expanded=True) as status:
                df_work = df_base[df_base['캠페인'].isin(selected_campaigns)].copy() if selected_campaigns else df_base.copy()
                
                potential_metrics = ['노출', '클릭', '조회', '총 비용']
                for pm in potential_metrics:
                    if pm in df_work.columns: df_work[pm] = df_work[pm].apply(clean_numeric)
                
                df_work = calculate_metrics(df_work, base_fee, selected_media, dmp_keywords)
                
                agg_metrics = ['노출', '클릭', '조회', '집행 금액', 'NET']
                metrics_to_agg = [m for m in agg_metrics if m in df_work.columns]
                agg_dict = {m: 'sum' for m in metrics_to_agg}
                
                mandatory_dims = ['날짜', '요일', '매체', '캠페인']
                for d in mandatory_dims:
                    if d in df_work.columns and d not in selected_groups: agg_dict[d] = 'first'
                
                df_result = df_work.groupby(selected_groups, sort=True).agg(agg_dict).reset_index()
                
                fixed_leads = ['날짜', '요일', '매체', '캠페인', '지면', '소재']
                out_leads = [c for c in fixed_leads if c in df_result.columns]
                out_metrics = [c for c in agg_metrics if c in df_result.columns]
                extras = [g for g in selected_groups if g not in out_leads and g not in out_metrics]
                
                final_columns = out_leads + extras + out_metrics
                df_final = df_result[final_columns]
                
                if '날짜' in df_final.columns and pd.api.types.is_datetime64_any_dtype(df_final['날짜']):
                    df_final['날짜'] = df_final['날짜'].dt.strftime('%Y-%m-%d')
                
                st.session_state.processed_df = df_final
                status.update(label="✅ 가공 완료!", state="complete", expanded=False)
                st.balloons()

        if st.session_state.processed_df is not None:
            st.markdown("<div class='glass-card'>", unsafe_allow_html=True)
            st.markdown("<div class='header-text'>✨ 가공 결과 프리뷰</div>", unsafe_allow_html=True)
            
            # Formatting for display
            display_df = st.session_state.processed_df.copy()
            # 숫자에 콤마 적용
            numeric_cols = display_df.select_dtypes(include=['number']).columns
            format_dict = {col: "{:,.0f}" for col in numeric_cols}
            
            st.dataframe(display_df.style.format(format_dict), use_container_width=True, height=400)
            
            col_dl1, col_dl2, col_db = st.columns(3)
            with col_dl1:
                output = io.BytesIO()
                with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
                    st.session_state.processed_df.to_excel(writer, index=False, sheet_name='RAW_Data')
                st.download_button("📥 엑셀 다운로드", data=output.getvalue(), file_name=f"GFA_RAW_{datetime.now().strftime('%m%d')}.xlsx", mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
            
            with col_dl2:
                tsv_data = st.session_state.processed_df.to_csv(index=False, sep='\t', header=False)
                with st.popover("📋 클립보드 복사", use_container_width=True):
                    st.code(tsv_data, language="text")
                    st.caption("복사하여 엑셀에 붙여넣으세요.")
            
            with col_db:
                if st.button("💾 DB 저장", type="primary"):
                    success, msg = st.session_state.db_manager.save_data(st.session_state.processed_df)
                    if success: st.success(msg)
                    else: st.error(msg)
            st.markdown("</div>", unsafe_allow_html=True)
        else:
            st.markdown("<div class='glass-card' style='text-align:center; padding: 5rem;'>데이터를 업로드하고 가공 버튼을 눌러주세요.</div>", unsafe_allow_html=True)

# --- Tab 2: 성과 분석 리포트 ---
with tab2:
    if st.session_state.processed_df is not None:
        st.markdown("<div class='glass-card'>", unsafe_allow_html=True)
        st.markdown("<div class='header-text'>📑 리포트 생성 및 다운로드</div>", unsafe_allow_html=True)
        
        rep_col1, rep_col2 = st.columns([1, 1])
        with rep_col1:
            report_title = st.text_input("리포트 제목", value="GFA 캠페인 성과 분석 리포트")
        
        if st.button("📊 리포트 데이터 생성", key="gen_rep_btn"):
            with st.spinner("리포트 생성 중..."):
                html_report = generate_premium_html(st.session_state.processed_df, title=report_title)
                st.session_state.html_report = html_report
                st.success("리포트가 생성되었습니다! 아래 버튼을 통해 다운로드하세요.")
        
        if 'html_report' in st.session_state:
            st.markdown("<div class='section-label'>Download Options</div>", unsafe_allow_html=True)
            down_col1, down_col2 = st.columns(2)
            with down_col1:
                st.download_button("📄 HTML 리포트 다운로드", data=st.session_state.html_report, file_name=f"Report_{datetime.now().strftime('%m%d')}.html", mime="text/html")
            with down_col2:
                if PDF_SUPPORT:
                    pdf_data = generate_pdf_report(st.session_state.html_report)
                    if pdf_data:
                        st.download_button("📕 PDF 리포트 다운로드", data=pdf_data, file_name=f"Report_{datetime.now().strftime('%m%d')}.pdf", mime="application/pdf")
                    else:
                        st.error("PDF 생성 중 오류가 발생했습니다.")
                else:
                    st.info("PDF 기능은 현재 환경에서 지원되지 않습니다 (추가 라이브러리 설치 필요).")
        st.markdown("</div>", unsafe_allow_html=True)
    else:
        st.info("먼저 'RAW 데이터 가공' 탭에서 데이터를 가공해주세요.")

# --- Tab 3: 데이터베이스 익스플로러 ---
with tab3:
    st.markdown("<div class='glass-card'>", unsafe_allow_html=True)
    st.markdown("<div class='header-text'>🔎 SQL 데이터 조회</div>", unsafe_allow_html=True)
    
    col_db1, col_db2 = st.columns([1, 2])
    with col_db1:
        coll_name = st.text_input("조회할 컬렉션", value="raw_master_results")
        if st.button("🔄 데이터 불러오기"):
            df_db, msg = st.session_state.db_manager.fetch_data(coll_name)
            if df_db is not None: 
                st.session_state.db_data = df_db
                st.success(f"로드 완료 ({len(df_db)} 행)")
            else: st.error(msg)
            
    if st.session_state.db_data is not None:
        sql_input = st.text_area("SQL Query (Table name: 'data')", value="SELECT * FROM data LIMIT 10", height=100)
        if st.button("⚡ 쿼리 실행"):
            res_df, msg = st.session_state.db_manager.run_sql(sql_input, st.session_state.db_data)
            if res_df is not None: st.session_state.sql_result = res_df
            else: st.error(msg)
            
        if st.session_state.sql_result is not None:
            st.dataframe(st.session_state.sql_result, use_container_width=True)
    st.markdown("</div>", unsafe_allow_html=True)

st.markdown("<div class='footer'>© 2026 GFA RAW MASTER PRO</div>", unsafe_allow_html=True)
