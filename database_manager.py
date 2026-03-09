import pandas as pd
from pymongo import MongoClient
import duckdb
from datetime import datetime
import streamlit as st

class DatabaseManager:
    def __init__(self, uri, database_name="gfa_master_pro"):
        self.uri = uri
        self.database_name = database_name
        self.client = None
        self.db = None
        self.connect()

    def connect(self):
        try:
            self.client = MongoClient(self.uri)
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
            
            if not df.empty and '_id' in df.columns:
                df = df.drop(columns=['_id'])
                
            return df, "Data fetched successfully"
        except Exception as e:
            return None, f"Fetch failed: {str(e)}"

    def run_sql(self, sql_query, data_df):
        try:
            # duckdb can query pandas dataframes directly
            # The dataframe is referenced by its variable name in the query
            # We'll use 'data' as the table name in the query
            result_df = duckdb.query(sql_query).to_df()
            return result_df, "Query successful"
        except Exception as e:
            return None, f"Query failed: {str(e)}"
