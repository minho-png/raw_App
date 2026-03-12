import pandas as pd
from pymongo import MongoClient
import duckdb
from datetime import datetime
import streamlit as st
import certifi

class DatabaseManager:
    def __init__(self, uri=None, database_name="gfa_master_pro"):
        # Use st.secrets if URI is not provided
        if uri is None and "MONGODB_URI" in st.secrets:
            self.uri = st.secrets["MONGODB_URI"]
        else:
            self.uri = uri
            
        self.database_name = database_name
        self.client = None
        self.db = None
        self.conn_success = False
        self.conn_msg = "Not connected"
        
        if self.uri:
            self.conn_success, self.conn_msg = self.connect()
        else:
            self.conn_msg = "MONGODB_URI not found in secrets"

    def connect(self):
        try:
            ca = certifi.where()
            self.client = MongoClient(self.uri, tlsCAFile=ca)
            # Test connection
            self.client.admin.command('ping')
            self.db = self.client[self.database_name]
            return True, "Successfully connected to MongoDB"
        except Exception as e:
            return False, f"Connection failed: {str(e)}"

    def save_data(self, df, campaign_name=None, collection_name="raw_master_results"):
        """Save performance data to DB. Additionally separates settlement data into a different collection."""
        if self.db is None:
            return False, "Database not connected"
        
        try:
            df_to_save = df.copy()
            df_to_save['db_created_at'] = datetime.now()
            if campaign_name:
                df_to_save['db_campaign_name'] = campaign_name
            
            # --- Collection 1: Settlement Data (settlement_master_data) ---
            # Extract settlement specific columns and save independently
            settlement_cols = ['날짜', 'db_campaign_name', '매체', 'DMP종류', 'NET가', '집행 금액']
            s_exist = [c for c in settlement_cols if c in df_to_save.columns]
            
            if len(s_exist) > 2: # Has data beyond just tracking info
                df_settlement = df_to_save[s_exist].copy()
                self.db['settlement_master_data'].insert_many(df_settlement.to_dict('records'))
            
            # --- Collection 2: Marketing Performance Data (raw_master_results) ---
            # Remove settlement-specific sensitive columns from general logs
            perf_cols_to_drop = [c for c in ['NET', 'NET가', 'has_dmp', 'DMP종류', '초도_수수료율'] if c in df_to_save.columns]
            if perf_cols_to_drop:
                df_to_save = df_to_save.drop(columns=perf_cols_to_drop)
            
            records = df_to_save.to_dict('records')
            collection = self.db[collection_name]
            result = collection.insert_many(records)
            
            return True, f"Successfully saved {len(result.inserted_ids)} records to {collection_name} and updated settlement data."
        except Exception as e:
            return False, f"Save failed: {str(e)}"

    def get_settlement_data(self, campaign_name, start_date=None, end_date=None, collection_name="settlement_master_data"):
        """
        특정 캠페인과 기간의 DMP별 NET가 합계 데이터를 'settlement_master_data' 컬렉션에서 가져옵니다.
        """
        if self.db is None:
            return None, "Database not connected"
            
        try:
            collection = self.db[collection_name]
            
            # 기본 쿼리: 캠페인명 기준
            query = {"db_campaign_name": campaign_name}
            
            # 기간 필터 추가
            if start_date and end_date:
                query["날짜"] = {
                    "$gte": start_date if isinstance(start_date, str) else start_date.strftime("%Y-%m-%d"),
                    "$lte": end_date if isinstance(end_date, str) else end_date.strftime("%Y-%m-%d")
                }
            
            cursor = collection.find(query)
            df = pd.DataFrame(list(cursor))
            
            if df.empty:
                return pd.DataFrame(), "No data found for the given criteria"
                
            if '_id' in df.columns:
                df = df.drop(columns=['_id'])
                
            # 수치형 변환
            cols_to_fix = ['NET가', '집행 금액']
            for c in cols_to_fix:
                if c in df.columns:
                    df[c] = pd.to_numeric(df[c], errors='coerce').fillna(0)
            
            return df, "Settlement data fetched successfully"
            
        except Exception as e:
            return None, f"Failed to fetch settlement data: {str(e)}"

    def fetch_data(self, collection_name="raw_master_results"):
        if self.db is None:
            return None, "Database not connected"
        
        try:
            collection = self.db[collection_name]
            cursor = collection.find({})
            df = pd.DataFrame(list(cursor))
            
            if not df.empty:
                if '_id' in df.columns:
                    df = df.drop(columns=['_id'])
                # Ensure date column is datetime
                if '날짜' in df.columns:
                    df['날짜'] = pd.to_datetime(df['날짜'])
                
            return df, "Data fetched successfully"
        except Exception as e:
            return None, f"Fetch failed: {str(e)}"

    def run_sql(self, sql_query, data_df):
        try:
            # Explicitly register the dataframe as a table named 'data'
            # This ensures duckdb can find it regardless of local scope
            con = duckdb.connect(database=':memory:')
            con.register('data', data_df)
            result_df = con.execute(sql_query).df()
            return result_df, "Query successful"
        except Exception as e:
            return None, f"Query failed: {str(e)}"

    def save_campaign_config(self, campaign_name, config_data):
        if self.db is None:
            return False, "Database not connected"
        try:
            collection = self.db["campaign_configs"]
            # Update or insert (upsert)
            collection.update_one(
                {"campaign_name": campaign_name},
                {"$set": {**config_data, "updated_at": datetime.now()}, 
                 "$setOnInsert": {"created_at": datetime.now()}},
                upsert=True
            )
            return True, f"Campaign config saved for {campaign_name}"
        except Exception as e:
            return False, f"Failed to save campaign config: {str(e)}"

    def get_campaign_config(self, campaign_name):
        if self.db is None:
            return None, "Database not connected"
        try:
            collection = self.db["campaign_configs"]
            config = collection.find_one({"campaign_name": campaign_name})
            if config:
                if '_id' in config: del config['_id']
                return config, "Config found"
            return None, "Config not found"
        except Exception as e:
            return None, f"Failed to fetch campaign config: {str(e)}"

    # --- Campaign Targets (Expectation Benchmarking) ---

    def save_campaign_targets(self, campaign_name, targets):
        """
        캠페인별 기대 CPC, CTR 목표를 저장합니다.
        """
        if self.db is None: return False, "Database not connected"
        try:
            settings_col = self.db['campaign_targets']
            settings_col.update_one(
                {'campaign_name': campaign_name},
                {'$set': {
                    'campaign_name': campaign_name,
                    'target_cpc': targets.get('target_cpc', 0),
                    'target_ctr': targets.get('target_ctr', 0),
                    'updated_at': datetime.now()
                }},
                upsert=True
            )
            return True, "Targets saved"
        except Exception as e:
            return False, f"Error saving targets: {e}"

    def get_campaign_targets(self, campaign_name):
        """
        특정 캠페인의 목표치를 조회합니다.
        """
        if self.db is None: return None
        try:
            settings_col = self.db['campaign_targets']
            return settings_col.find_one({'campaign_name': campaign_name})
        except Exception as e:
            print(f"Error fetching targets: {e}")
            return None

    def list_campaigns(self):
        if self.db is None:
            return [], "Database not connected"
        try:
            collection = self.db["campaign_configs"]
            cursor = collection.find({}, {"campaign_name": 1})
            campaigns = [doc["campaign_name"] for doc in cursor]
            return sorted(campaigns), "Campaigns listed"
        except Exception as e:
            return [], f"Failed to list campaigns: {str(e)}"

    def delete_campaign(self, campaign_name):
        """
        캠페인과 연관된 모든 데이터(설정, 목표, 성과)를 삭제합니다.
        """
        if self.db is None:
            return False, "Database not connected"
        try:
            self.db["campaign_configs"].delete_one({"campaign_name": campaign_name})
            self.db["campaign_targets"].delete_one({"campaign_name": campaign_name})
            del_result = self.db["raw_master_results"].delete_many({"db_campaign_name": campaign_name})
            
            return True, f"'{campaign_name}' 삭제 성공 (데이터 {del_result.deleted_count}건 포함)"
        except Exception as e:
            return False, f"삭제 실패: {str(e)}"

    def calculate_growth_metrics(self, current_df, historical_df=None):
        """Calculate WoW (Week-over-Week) growth rates"""
        if current_df.empty or '날짜' not in current_df.columns:
            return None
            
        current_sum = current_sum = current_df.agg({'집행 금액': 'sum', '노출': 'sum', '클릭': 'sum'})
        
        if historical_df is not None and not historical_df.empty:
            hist_sum = historical_df.agg({'집행 금액': 'sum', '노출': 'sum', '클릭': 'sum'})
            
            growth = {}
            for col in ['집행 금액', '노출', '클릭']:
                if hist_sum[col] > 0:
                    growth[col] = (current_sum[col] - hist_sum[col]) / hist_sum[col] * 100
                else:
                    growth[col] = 0.0
            return growth
        return None

    def compare_with_history(self, current_df):
        """Fetch matching historical data (e.g., same period last week) and compare"""
        if self.db is None or current_df.empty or '날짜' not in current_df.columns:
            return None
            
        try:
            # 1. Determine date range of current data
            min_date = current_df['날짜'].min()
            max_date = current_df['날짜'].max()
            
            # 2. Calculate last week's range
            from datetime import timedelta
            last_week_min = min_date - timedelta(days=7)
            last_week_max = max_date - timedelta(days=7)
            
            # 3. Query MongoDB for last week's data
            collection = self.db["raw_master_results"]
            query = {
                "날짜": {
                    "$gte": last_week_min,
                    "$lte": last_week_max
                }
            }
            cursor = collection.find(query)
            hist_df = pd.DataFrame(list(cursor))
            
            if hist_df.empty:
                return None
                
            if '_id' in hist_df.columns:
                hist_df = hist_df.drop(columns=['_id'])
            
            # 4. Calculate growth
            return self.calculate_growth_metrics(current_df, hist_df)
            
        except Exception as e:
            print(f"Comparison failed: {e}")
            return None
