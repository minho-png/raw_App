import pandas as pd
import streamlit as st
import io
from datetime import datetime
from logic import parse_naver_date, get_day_of_week, calculate_metrics, clean_placement, clean_numeric

# --- Page Config ---
st.set_page_config(
    page_title="GFA RAW Master Pro",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="collapsed"
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
        margin-bottom: 3rem;
        font-size: 1.1rem;
    }

    /* Sidebar/Header Styling */
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

    /* File Uploader Clean Up */
    [data-testid="stFileUploader"] {
        border: 1px dashed #cbd5e1;
        border-radius: 12px;
        padding: 10px;
        background: #ffffff;
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

    /* Footer */
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
if 'processed_df' not in st.session_state:
    st.session_state.processed_df = None
if 'df_raw' not in st.session_state:
    st.session_state.df_raw = None
if 'last_uploaded_file' not in st.session_state:
    st.session_state.last_uploaded_file = None

# --- Main Layout ---
st.markdown("<div class='main-title'>GFA RAW MASTER PRO</div>", unsafe_allow_html=True)
st.markdown("<div class='main-subtitle'>네이버 GFA 광고 성과를 완벽한 RAW 데이터로 가공하세요.</div>", unsafe_allow_html=True)

container = st.container()

with container:
    col1, col2 = st.columns([1, 2], gap="large")

    with col1:
        st.markdown("<div class='glass-card'>", unsafe_allow_html=True)
        st.markdown("<div class='header-text'>🛠️ 리포트 설정</div>", unsafe_allow_html=True)
        
        uploaded_file = st.file_uploader("result.csv 업로드", type=['csv', 'xlsx'])
        
        if uploaded_file != st.session_state.last_uploaded_file:
            st.session_state.df_raw = None
            st.session_state.processed_df = None
            st.session_state.last_uploaded_file = uploaded_file

        media_list = ['네이버GFA', '카카오', '구글', '메타']
        selected_media = st.selectbox("집행 매체", media_list)
        base_fee = st.number_input("기본 대행 수수료 (%)", min_value=0.0, max_value=100.0, value=15.0, step=0.5)
        
        if uploaded_file is not None:
            if st.session_state.df_raw is None:
                try:
                    if uploaded_file.name.endswith('.csv'):
                        try:
                            df = pd.read_csv(uploaded_file, encoding='utf-8')
                        except UnicodeDecodeError:
                            df = pd.read_csv(uploaded_file, encoding='cp949')
                    else:
                        df = pd.read_excel(uploaded_file)
                    st.session_state.df_raw = df
                except Exception as e:
                    st.error(f"파일 오류: {e}")
                    st.stop()

            df_base = st.session_state.df_raw.copy()
            
            # Identify Key Columns
            rename_map = {
                '캠페인 이름': '캠페인',
                '게재 위치': '지면',
                '광고 소재 이름': '소재'
            }
            if '캠페인 이름' not in df_base.columns and '캠페인' in df_base.columns:
                pass
            
            df_base = df_base.rename(columns=rename_map)
            
            # Campaign Multi-select
            if '캠페인' in df_base.columns:
                all_campaigns = sorted(df_base['캠페인'].unique().tolist())
                selected_campaigns = st.multiselect("캠페인 다중 선택", options=all_campaigns)
            else:
                st.error("'캠페인 이름' 컬럼을 찾을 수 없습니다.")
                st.stop()
            
            # Grouping Options Prep
            if '기간' in df_base.columns:
                df_base['날짜'] = df_base['기간'].apply(parse_naver_date)
                df_base['요일'] = df_base['날짜'].apply(get_day_of_week)
            
            if '지면' in df_base.columns:
                df_base['지면'] = df_base['지면'].apply(clean_placement)
            
            df_base['매체'] = selected_media
            
            all_cols_for_group = df_base.columns.tolist()
            suggested = [c for c in ['날짜', '광고 그룹 이름', '지면', '소재'] if c in all_cols_for_group]
            selected_groups = st.multiselect("그룹화 기준 설정", options=all_cols_for_group, default=suggested)
            
            st.markdown("<div class='primary-btn'>", unsafe_allow_html=True)
            run_btn = st.button("🚀 RAW MASTER 생성 시작")
            st.markdown("</div>", unsafe_allow_html=True)

            if run_btn:
                with st.spinner("생성 중..."):
                    # Filtering
                    if selected_campaigns:
                        df_work = df_base[df_base['캠페인'].isin(selected_campaigns)].copy()
                    else:
                        df_work = df_base.copy()
                    
                    if not selected_groups:
                        st.warning("최소 한 개 이상의 그룹화 기준이 필요합니다.")
                    else:
                        # Metrics to clean and sum
                        potential_metrics = ['노출', '클릭', '조회', '총 비용']
                        for pm in potential_metrics:
                            if pm in df_work.columns:
                                df_work[pm] = df_work[pm].apply(clean_numeric)
                        
                        # Calculation
                        df_work = calculate_metrics(df_work, base_fee, selected_media)
                        
                        # Metrics found for aggregation (including calculated ones)
                        agg_metrics = ['노출', '클릭', '조회', '집행 금액', 'NET']
                        metrics_to_agg = [m for m in agg_metrics if m in df_work.columns]
                        
                        agg_dict = {m: 'sum' for m in metrics_to_agg}
                        
                        # MANDATORY DIMENSIONS
                        mandatory_dims = ['날짜', '요일', '매체', '캠페인']
                        for d in mandatory_dims:
                            if d in df_work.columns and d not in selected_groups:
                                agg_dict[d] = 'first'
                        
                        # Perform Grouping (Sorted by default)
                        df_result = df_work.groupby(selected_groups, sort=True).agg(agg_dict).reset_index()
                        
                        # Final Column Order
                        fixed_leads = ['날짜', '요일', '매체', '캠페인', '지면', '소재']
                        out_leads = [c for c in fixed_leads if c in df_result.columns]
                        out_metrics = [c for c in agg_metrics if c in df_result.columns]
                        
                        extras = [g for g in selected_groups if g not in out_leads and g not in out_metrics]
                        
                        final_columns = out_leads + extras + out_metrics
                        df_final = df_result[final_columns]

                        
                        if '날짜' in df_final.columns and pd.api.types.is_datetime64_any_dtype(df_final['날짜']):
                            df_final['날짜'] = df_final['날짜'].dt.strftime('%Y-%m-%d')
                        
                        st.session_state.processed_df = df_final
                        st.balloons()


        
        st.markdown("</div>", unsafe_allow_html=True)

    with col2:
        if st.session_state.processed_df is not None:
            st.markdown("<div class='glass-card' style='height: 100%; border-left: 5px solid var(--primary);'>", unsafe_allow_html=True)
            st.markdown("<div class='header-text'>✨ 생성 결과 프리뷰</div>", unsafe_allow_html=True)
            
            # --- Copy & Download Actions ---
            st.markdown("<div class='section-label'>Data Export & Copy</div>", unsafe_allow_html=True)
            
            # Use columns but ensure they don't fight for space
            copy_col, dl_col = st.columns(2)
            
            with copy_col:
                # Optimized for Excel pasting (TSV)
                tsv_data = st.session_state.processed_df.to_csv(index=False, sep='\t')
                with st.popover("📋 클립보드 복사 모드", use_container_width=True):
                    st.markdown("**데이터를 복사하여 엑셀에 바로 붙여넣으세요.**")
                    st.code(tsv_data, language="text")
                    st.caption("우측 상단의 버튼을 클릭하여 복사하세요.")

            with dl_col:
                # Excel Export
                output = io.BytesIO()
                with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
                    st.session_state.processed_df.to_excel(writer, index=False, sheet_name='RAW_Data')
                    workbook = writer.book
                    worksheet = writer.sheets['RAW_Data']
                    header_fmt = workbook.add_format({'bold': True, 'bg_color': '#D7E4BC', 'border': 1})
                    for c, val in enumerate(st.session_state.processed_df.columns):
                        worksheet.write(0, c, val, header_fmt)
                
                st.download_button(
                    label="📥 엑셀(Excel) 다운로드",
                    data=output.getvalue(),
                    file_name=f"GFA_RAW_{datetime.now().strftime('%m%d_%H%M')}.xlsx",
                    mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    use_container_width=True
                )

            st.markdown("<div style='margin-bottom: 20px;'></div>", unsafe_allow_html=True)
            st.dataframe(st.session_state.processed_df, use_container_width=True, height=450)


            st.markdown("</div>", unsafe_allow_html=True)
        else:
            st.markdown("<div class='glass-card' style='height: 100%; display: flex; align-items: center; justify-content: center;'>", unsafe_allow_html=True)
            st.markdown("<div style='color: #94a3b8;'>설정을 완료하고 생성 버튼을 눌러주세요.</div>", unsafe_allow_html=True)
            st.markdown("</div>", unsafe_allow_html=True)

st.markdown("<div class='footer'>© 2026 GFA RAW MASTER PRO</div>", unsafe_allow_html=True)
