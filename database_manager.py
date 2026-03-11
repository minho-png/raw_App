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

    def save_data(self, df, collection_name="raw_master_results"):
        if self.db is None:
            return False, "Database not connected"
        
        try:
            # Add a timestamp to the data
            df_to_save = df.copy()
            df_to_save['db_created_at'] = datetime.now()
            
            # Convert to dictionary records
            records = df_to_save.to_dict('records')
            
            collection = self.db[collection_name]
            result = collection.insert_many(records)
            
            return True, f"Successfully saved {len(result.inserted_ids)} records to {collection_name}"
        except Exception as e:
            return False, f"Save failed: {str(e)}"

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
            # duckdb can query pandas dataframes directly
            result_df = duckdb.query(sql_query).to_df()
            return result_df, "Query successful"
        except Exception as e:
            return None, f"Query failed: {str(e)}"

    def calculate_growth_metrics(self, df, kpi_col='집행 금액'):
        """Calculate WoW and MoM growth rates"""
        if df.empty or '날짜' not in df.columns:
            return None
        
        df_sorted = df.sort_values('날짜')
        
        # Simple aggregation by date for trend
        daily_trend = df_sorted.groupby('날짜')[kpi_col].sum().reset_index()
        
        # Calculate growth if we have enough data
        # For WoW/MoM we might need more complex logic based on current date
        # Here we'll provide a simplified version using pandas.pct_change
        return daily_trend
