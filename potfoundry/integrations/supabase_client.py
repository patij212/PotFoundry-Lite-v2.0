"""Supabase client integration for Public Library Publishing.

Provides graceful degradation when Supabase is not configured.
Wraps storage and database operations with error handling and retries.
"""
from __future__ import annotations

import os
import time
from typing import Any, Dict, List, Optional
from dataclasses import dataclass

try:
    import streamlit as st
    HAS_STREAMLIT = True
except ImportError:
    HAS_STREAMLIT = False
    st = None  # type: ignore


@dataclass
class SupabaseConfig:
    """Supabase connection configuration."""
    url: str
    key: str
    bucket: str


class LibraryError(Exception):
    """Base exception for library operations."""
    pass


class NotConfiguredError(LibraryError):
    """Raised when Supabase is not configured."""
    pass


class UploadError(LibraryError):
    """Raised when file upload fails."""
    pass


class DatabaseError(LibraryError):
    """Raised when database operation fails."""
    pass


class NotConfiguredClient:
    """Placeholder client when Supabase is not configured."""
    
    def upload_bytes(self, *args, **kwargs):
        raise NotConfiguredError("Supabase not configured")
    
    def upsert_row(self, *args, **kwargs):
        raise NotConfiguredError("Supabase not configured")
    
    def select_rows(self, *args, **kwargs):
        raise NotConfiguredError("Supabase not configured")
    
    def is_configured(self) -> bool:
        return False


class SupabaseClient:
    """Wrapper for Supabase operations with retry logic."""
    
    def __init__(self, config: SupabaseConfig):
        """Initialize Supabase client.
        
        Args:
            config: Supabase connection configuration
        """
        self.config = config
        self._client = None
        self._init_client()
    
    def _init_client(self):
        """Initialize Supabase Python client."""
        try:
            # Try to import supabase-py
            from supabase import create_client, Client
            self._client = create_client(self.config.url, self.config.key)
        except ImportError:
            # Fallback: use requests for direct API calls
            import requests
            self._client = None
            self._session = requests.Session()
            self._session.headers.update({
                "apikey": self.config.key,
                "Authorization": f"Bearer {self.config.key}",
            })
    
    def is_configured(self) -> bool:
        """Check if client is properly configured."""
        return self._client is not None or hasattr(self, '_session')
    
    def upload_bytes(
        self,
        path: str,
        data: bytes,
        content_type: str = "application/octet-stream",
        gzip: bool = False,
        max_retries: int = 3
    ) -> str:
        """Upload bytes to Supabase Storage.
        
        Args:
            path: Storage path (e.g., "stl/abc123.stl")
            data: File contents as bytes
            content_type: MIME type
            gzip: Whether data is gzipped (sets Content-Encoding header)
            max_retries: Maximum retry attempts
            
        Returns:
            Public URL of uploaded file
            
        Raises:
            UploadError: If upload fails after retries
        """
        headers = {"Content-Type": content_type}
        if gzip:
            headers["Content-Encoding"] = "gzip"
        
        for attempt in range(max_retries):
            try:
                if self._client:
                    # Use supabase-py client
                    response = self._client.storage.from_(self.config.bucket).upload(
                        path, data, file_options={"content-type": content_type}
                    )
                    # Get public URL
                    url = self._client.storage.from_(self.config.bucket).get_public_url(path)
                    return url
                else:
                    # Use direct API call
                    url = f"{self.config.url}/storage/v1/object/{self.config.bucket}/{path}"
                    response = self._session.post(url, data=data, headers=headers)
                    response.raise_for_status()
                    
                    # Return public URL
                    public_url = f"{self.config.url}/storage/v1/object/public/{self.config.bucket}/{path}"
                    return public_url
            
            except Exception as e:
                if attempt == max_retries - 1:
                    raise UploadError(f"Upload failed after {max_retries} attempts: {e}")
                
                # Exponential backoff
                wait_time = 2 ** attempt * 0.5
                time.sleep(wait_time)
        
        raise UploadError("Upload failed")
    
    def upsert_row(self, table: str, row: Dict[str, Any], max_retries: int = 3) -> Dict[str, Any]:
        """Insert or update row in Supabase table.
        
        Args:
            table: Table name
            row: Row data as dictionary
            max_retries: Maximum retry attempts
            
        Returns:
            Inserted/updated row data
            
        Raises:
            DatabaseError: If operation fails after retries
        """
        for attempt in range(max_retries):
            try:
                if self._client:
                    # Use supabase-py client
                    response = self._client.table(table).upsert(row).execute()
                    return response.data[0] if response.data else row
                else:
                    # Use direct API call
                    url = f"{self.config.url}/rest/v1/{table}"
                    headers = {"Prefer": "return=representation", "Content-Type": "application/json"}
                    response = self._session.post(url, json=row, headers=headers)
                    response.raise_for_status()
                    
                    result = response.json()
                    return result[0] if isinstance(result, list) and result else row
            
            except Exception as e:
                if attempt == max_retries - 1:
                    raise DatabaseError(f"Database upsert failed after {max_retries} attempts: {e}")
                
                wait_time = 2 ** attempt * 0.5
                time.sleep(wait_time)
        
        raise DatabaseError("Upsert failed")
    
    def select_rows(
        self,
        table: str,
        filters: Optional[Dict[str, Any]] = None,
        order_by: str = "created_at",
        order_desc: bool = True,
        limit: int = 24,
        offset: int = 0,
        max_retries: int = 3
    ) -> List[Dict[str, Any]]:
        """Select rows from Supabase table.
        
        Args:
            table: Table name
            filters: Column filters (e.g., {"style": "HarmonicRipple"})
            order_by: Column to sort by
            order_desc: Sort descending if True
            limit: Maximum rows to return
            offset: Number of rows to skip
            max_retries: Maximum retry attempts
            
        Returns:
            List of row dictionaries
            
        Raises:
            DatabaseError: If operation fails after retries
        """
        for attempt in range(max_retries):
            try:
                if self._client:
                    # Use supabase-py client
                    query = self._client.table(table).select("*")
                    
                    # Apply filters
                    if filters:
                        for col, val in filters.items():
                            if col == "tags" and isinstance(val, list):
                                # Array contains filter
                                for tag in val:
                                    query = query.contains(col, [tag])
                            elif col == "title_search":
                                # Full-text search
                                query = query.ilike("title", f"%{val}%")
                            else:
                                query = query.eq(col, val)
                    
                    # Order and paginate
                    query = query.order(order_by, desc=order_desc)
                    query = query.limit(limit).offset(offset)
                    
                    response = query.execute()
                    return response.data
                else:
                    # Use direct API call
                    url = f"{self.config.url}/rest/v1/{table}"
                    params = {
                        "limit": limit,
                        "offset": offset,
                        "order": f"{order_by}.{'desc' if order_desc else 'asc'}",
                    }
                    
                    # Apply filters
                    if filters:
                        for col, val in filters.items():
                            if col == "title_search":
                                params["title"] = f"ilike.%{val}%"
                            elif col != "tags":
                                params[col] = f"eq.{val}"
                    
                    response = self._session.get(url, params=params)
                    response.raise_for_status()
                    return response.json()
            
            except Exception as e:
                if attempt == max_retries - 1:
                    raise DatabaseError(f"Database select failed after {max_retries} attempts: {e}")
                
                wait_time = 2 ** attempt * 0.5
                time.sleep(wait_time)
        
        raise DatabaseError("Select failed")


def get_client() -> SupabaseClient | NotConfiguredClient:
    """Get Supabase client instance (singleton pattern).
    
    Returns:
        SupabaseClient if configured, NotConfiguredClient otherwise
    """
    # Check for feature flag disable
    if os.environ.get("DISABLE_LIBRARY") == "1":
        return NotConfiguredClient()
    
    # Try to load from Streamlit secrets
    if HAS_STREAMLIT and st is not None:
        try:
            secrets = st.secrets.get("connections", {}).get("supabase", {})
            if secrets and "url" in secrets and "key" in secrets:
                config = SupabaseConfig(
                    url=secrets["url"],
                    key=secrets["key"],
                    bucket=secrets.get("bucket", "pots")
                )
                return SupabaseClient(config)
        except Exception:
            pass
    
    # Try environment variables
    url = os.environ.get("SUPABASE_URL") or os.environ.get("STREAMLIT_SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY") or os.environ.get("STREAMLIT_SUPABASE_KEY")
    bucket = os.environ.get("SUPABASE_BUCKET", "pots")
    
    if url and key:
        config = SupabaseConfig(url=url, key=key, bucket=bucket)
        return SupabaseClient(config)
    
    # Not configured
    return NotConfiguredClient()


# Module-level singleton
_client_instance: Optional[SupabaseClient | NotConfiguredClient] = None


def get_singleton_client() -> SupabaseClient | NotConfiguredClient:
    """Get cached Supabase client instance.
    
    Returns:
        Cached client instance
    """
    global _client_instance
    if _client_instance is None:
        _client_instance = get_client()
    return _client_instance
