"""Supabase client integration for Public Library Publishing.

Provides graceful degradation when Supabase is not configured.
Wraps storage and database operations with error handling and retries.
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Dict, List, Optional

if TYPE_CHECKING:
    import streamlit as st

    HAS_STREAMLIT = True
else:
    try:
        import streamlit as st

        HAS_STREAMLIT = True
    except Exception:
        HAS_STREAMLIT = False
        st = None

_tls_warning_emitted: bool = False
from typing import cast

# NOTE: supabase_client uses `requests` as a lightweight runtime fallback when
# `supabase` (supabase-py) is not installed. Historically mypy reported
# `import-untyped` / `import-not-found` for `requests` in CI/dev. We add a
# targeted ignore for import-not-found where requests is imported dynamically
# below; we also added `types-requests` to `requirements-dev.txt` so dev
# environments can install the stubs to fully silence mypy locally.


@dataclass
class SupabaseConfig:
    """Supabase connection configuration.

    key may be a service_role for full access or anon key for read-only.
    """

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

    def delete_rows(self, *args, **kwargs):
        raise NotConfiguredError("Supabase not configured")

    def update_rows(self, *args, **kwargs):
        raise NotConfiguredError("Supabase not configured")


class SupabaseClient:
    """Wrapper for Supabase operations with retry logic."""

    def __init__(self, config: SupabaseConfig, *, read_only: bool = False):
        """Initialize Supabase client.

        Args:
            config: Supabase connection configuration
        """
        self.config = config
        self.read_only = read_only
        self._client: Any = None
        self._init_client()

    def _init_client(self):
        """Initialize Supabase Python client."""
        skip_tls = _should_skip_tls_verify()
        try:
            if self.read_only or skip_tls:
                # Force direct API when read-only or TLS override is requested
                raise ImportError("force direct api for readonly or tls override")
            # Try to import supabase-py for full-access mode
            from supabase import create_client

            self._client = create_client(self.config.url, self.config.key)
        except ImportError:
            # Direct API calls
            import requests

            self._client = None
            self._session = requests.Session()
            # Always set apikey; Authorization only if not read_only
            headers = {"apikey": self.config.key}
            if not self.read_only:
                headers["Authorization"] = f"Bearer {self.config.key}"
            self._session.headers.update(headers)
            # Reasonable timeouts
            self._timeout = (5, 15)  # connect, read seconds
            self._skip_tls_verify = skip_tls
            if skip_tls:
                self._session.verify = False
                try:
                    import urllib3

                    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
                except Exception:
                    pass
                _emit_tls_override_warning()

    def is_configured(self) -> bool:
        """Check if client is properly configured."""
        return self._client is not None or hasattr(self, "_session")

    def upload_bytes(
        self,
        path: str,
        data: bytes,
        content_type: str = "application/octet-stream",
        gzip: bool = False,
        max_retries: int = 3,
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
        if self.read_only:
            raise NotConfiguredError(
                "Supabase configured read-only; publishing disabled"
            )
        headers = {"Content-Type": content_type}
        if gzip:
            headers["Content-Encoding"] = "gzip"
        # Encourage explicit caching policy and allow upsert to avoid conflicts on duplicate publishes
        headers["Cache-Control"] = "public, max-age=31536000, immutable"
        # For storage API, enabling upsert prevents 409/400 conflicts if object exists
        headers["x-upsert"] = "true"

        for attempt in range(max_retries):
            try:
                client_obj = getattr(self, "_client", None)
                if client_obj is not None:
                    # Use supabase-py client (typed dynamically)
                    client_any = cast(Any, client_obj)
                    client_any.storage.from_(self.config.bucket).upload(
                        path, data, file_options={"content-type": content_type}
                    )
                    # Get public URL
                    url = client_any.storage.from_(self.config.bucket).get_public_url(
                        path
                    )
                    # Ensure we return a concrete str for mypy
                    return str(url)
                else:
                    # Use direct API call
                    url = f"{self.config.url}/storage/v1/object/{self.config.bucket}/{path}"
                    resp = self._session.post(
                        url,
                        data=data,
                        headers=headers,
                        timeout=getattr(self, "_timeout", None),
                    )
                    try:
                        resp.raise_for_status()
                    except Exception as e:
                        # Include response body for easier debugging
                        raise UploadError(
                            f"HTTP {resp.status_code}: {resp.text}"
                        ) from e

                    # Return public URL
                    public_url = f"{self.config.url}/storage/v1/object/public/{self.config.bucket}/{path}"
                    return public_url

            except Exception as e:
                if attempt == max_retries - 1:
                    raise UploadError(
                        f"Upload failed after {max_retries} attempts: {e}"
                    )

                # Exponential backoff
                wait_time = 2**attempt * 0.5
                time.sleep(wait_time)

        raise UploadError("Upload failed")

    def upsert_row(
        self, table: str, row: Dict[str, Any], max_retries: int = 3
    ) -> Dict[str, Any]:
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
        if self.read_only:
            raise NotConfiguredError(
                "Supabase configured read-only; publishing disabled"
            )
        for attempt in range(max_retries):
            try:
                client_obj = getattr(self, "_client", None)
                if client_obj is not None:
                    # Use supabase-py client
                    client_any = cast(Any, client_obj)
                    response = client_any.table(table).upsert(row).execute()
                    resp_data = cast(
                        List[Dict[str, Any]], getattr(response, "data", [])
                    )
                    return resp_data[0] if resp_data else row
                else:
                    # Use direct API call
                    url = f"{self.config.url}/rest/v1/{table}"
                    # Upsert semantics for PostgREST require on_conflict and Prefer resolution
                    params = {"on_conflict": "id"}
                    headers = {
                        "Prefer": "resolution=merge-duplicates,return=representation",
                        "Content-Type": "application/json",
                    }
                    resp = self._session.post(
                        url, params=cast(Any, params), json=row, headers=headers
                    )
                    resp.raise_for_status()

                    result = resp.json()
                    # resp.json() is dynamically typed; cast to expected structure for mypy
                    result_typed = cast(List[Dict[str, Any]], result)
                    return (
                        result_typed[0]
                        if isinstance(result_typed, list) and result_typed
                        else row
                    )

            except Exception as e:
                if attempt == max_retries - 1:
                    raise DatabaseError(
                        f"Database upsert failed after {max_retries} attempts: {e}"
                    )

                wait_time = 2**attempt * 0.5
                time.sleep(wait_time)

        raise DatabaseError("Upsert failed")

    def update_rows(
        self,
        table: str,
        filters: Dict[str, Any],
        changes: Dict[str, Any],
        max_retries: int = 3,
    ) -> int:
        """Update rows in a table matching filters with provided changes.

        Returns number of rows updated.
        """
        if self.read_only:
            raise NotConfiguredError("Supabase configured read-only; update disabled")
        for attempt in range(max_retries):
            try:
                client_obj = getattr(self, "_client", None)
                if client_obj is not None:
                    client_any = cast(Any, client_obj)
                    query = client_any.table(table).update(changes)
                    for col, val in (filters or {}).items():
                        query = query.eq(col, val)
                    resp = query.execute()
                    try:
                        resp_data = cast(
                            List[Dict[str, Any]], getattr(resp, "data", [])
                        )
                        return len(resp_data or [])
                    except Exception:
                        return 0
                else:
                    url = f"{self.config.url}/rest/v1/{table}"
                    params = {}
                    if filters:
                        for col, val in filters.items():
                            params[col] = f"eq.{val}"
                    headers = {
                        "Prefer": "return=representation",
                        "Content-Type": "application/json",
                    }
                    resp = self._session.patch(
                        url, params=cast(Any, params), json=changes, headers=headers
                    )
                    resp.raise_for_status()
                    try:
                        data = resp.json()
                        data_typed = cast(List[Dict[str, Any]], data)
                        return len(data_typed) if isinstance(data_typed, list) else 0
                    except Exception:
                        return 0
            except Exception as e:
                if attempt == max_retries - 1:
                    raise DatabaseError(
                        f"Database update failed after {max_retries} attempts: {e}"
                    )
                time.sleep(2**attempt * 0.5)
        raise DatabaseError("Update failed")

    def select_rows(
        self,
        table: str,
        filters: Optional[Dict[str, Any]] = None,
        order_by: str = "created_at",
        order_desc: bool = True,
        limit: int = 24,
        offset: int = 0,
        max_retries: int = 3,
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
                client_obj = getattr(self, "_client", None)
                if client_obj is not None:
                    # Use supabase-py client
                    client_any = cast(Any, client_obj)
                    query = client_any.table(table).select("*")

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
                    resp_data = cast(
                        List[Dict[str, Any]], getattr(response, "data", [])
                    )
                    return resp_data
                else:
                    # Use direct API call
                    url = f"{self.config.url}/rest/v1/{table}"
                    params = {
                        "select": "*",
                        "limit": limit,
                        "offset": offset,
                        "order": f"{order_by}.{'desc' if order_desc else 'asc'}",
                    }

                    # Apply filters
                    if filters:
                        for col, val in filters.items():
                            if col == "title_search" and isinstance(val, str) and val:
                                # PostgREST pattern uses * as wildcard to avoid URL encoding
                                # https://postgrest.org/en/stable/api.html#operators
                                params["title"] = f"ilike.*{val}*"
                            elif col == "tags" and isinstance(val, list) and val:
                                # Basic contains: require first tag to be present (text[] contains)
                                first = str(val[0])
                                params["tags"] = f"cs.{{{first}}}"
                            else:
                                params[col] = f"eq.{val}"

                    # Prefer public read without Authorization if possible. We'll clone headers and drop Authorization.
                    resp = self._session.get(
                        url,
                        params=cast(Any, params),
                        timeout=getattr(self, "_timeout", None),
                    )
                    if resp.status_code == 401:
                        # Retry without Authorization to leverage public SELECT policy
                        import requests

                        tmp_session = requests.Session()
                        # Keep apikey for project routing, but no Authorization so it uses anon role
                        tmp_session.headers.update(
                            {
                                "apikey": self.config.key,
                            }
                        )
                        if getattr(self, "_skip_tls_verify", False):
                            tmp_session.verify = False
                        resp = tmp_session.get(
                            url,
                            params=cast(Any, params),
                            timeout=getattr(self, "_timeout", None),
                        )
                    resp.raise_for_status()
                    data = resp.json()
                    return cast(List[Dict[str, Any]], data)

            except Exception as e:
                if attempt == max_retries - 1:
                    raise DatabaseError(
                        f"Database select failed after {max_retries} attempts: {e}"
                    )

                wait_time = 2**attempt * 0.5
                time.sleep(wait_time)

        raise DatabaseError("Select failed")

    def delete_rows(
        self,
        table: str,
        filters: Dict[str, Any],
        max_retries: int = 3,
    ) -> int:
        """Delete rows from a table matching filters. Returns number of rows deleted.

        Supports simple equality filters (e.g., {"id": "..."}).
        """
        if self.read_only:
            raise NotConfiguredError("Supabase configured read-only; delete disabled")
        for attempt in range(max_retries):
            try:
                client_obj = getattr(self, "_client", None)
                if client_obj is not None:
                    client_any = cast(Any, client_obj)
                    query = client_any.table(table).delete()
                    for col, val in (filters or {}).items():
                        query = query.eq(col, val)
                    resp = query.execute()
                    # supabase-py returns count only if requested; best-effort length
                    try:
                        resp_data = cast(
                            List[Dict[str, Any]], getattr(resp, "data", [])
                        )
                        return len(resp_data or [])
                    except Exception:
                        return 0
                else:
                    # REST API
                    url = f"{self.config.url}/rest/v1/{table}"
                    params = {}
                    if filters:
                        for col, val in filters.items():
                            params[col] = f"eq.{val}"
                    headers = {"Prefer": "return=representation"}
                    resp = self._session.delete(
                        url, params=cast(Any, params), headers=headers
                    )
                    resp.raise_for_status()
                    try:
                        data = resp.json()
                        return len(data) if isinstance(data, list) else 0
                    except Exception:
                        return 0
            except Exception as e:
                if attempt == max_retries - 1:
                    raise DatabaseError(
                        f"Database delete failed after {max_retries} attempts: {e}"
                    )
                time.sleep(2**attempt * 0.5)
        raise DatabaseError("Delete failed")


def _is_disabled_via_secrets() -> bool:
    if HAS_STREAMLIT and st is not None:
        try:
            val = str(st.secrets.get("DISABLE_LIBRARY", "0")).strip()
            return val == "1"
        except Exception:
            return False
    return False


def _should_skip_tls_verify() -> bool:
    """Return True when TLS verification should be skipped (explicit opt-in)."""
    for key in (
        "SUPABASE_SKIP_TLS_VERIFY",
        "STREAMLIT_SUPABASE_SKIP_TLS_VERIFY",
        "SUPABASE_ALLOW_INSECURE",
    ):
        val = os.environ.get(key)
        if isinstance(val, str) and val.strip().lower() in {"1", "true", "yes", "on"}:
            return True
    if HAS_STREAMLIT and st is not None:
        try:
            secrets = st.secrets.get("connections", {}).get("supabase", {})
            raw = secrets.get("skip_tls_verify") or secrets.get("allow_insecure_tls")
            if isinstance(raw, bool):
                return raw
            if isinstance(raw, str) and raw.strip().lower() in {
                "1",
                "true",
                "yes",
                "on",
            }:
                return True
        except Exception:
            return False
    return False


def _emit_tls_override_warning() -> None:
    """Warn once that TLS verification has been disabled."""
    global _tls_warning_emitted
    if _tls_warning_emitted:
        return
    _tls_warning_emitted = True
    message = (
        "⚠️ Supabase TLS certificate verification is disabled. "
        "Only use this in trusted environments."
    )
    if HAS_STREAMLIT and st is not None:
        try:
            st.warning(message)
            return
        except Exception:
            pass
    print(message)


def _looks_like_invalid_key(key: Optional[str]) -> bool:
    """Return True when a key is definitely invalid (placeholder/empty).

    Accept both JWT-like keys (eyJ...) and srv- prefixed keys.
    """
    if not key:
        return True
    k = str(key).strip()
    if not k or "REPLACE_WITH" in k:
        return True
    # Accept common formats: JWT (eyJ...) or 'srv-' prefixed
    if k.startswith("eyJ") or k.startswith("srv-"):
        return False
    # Fallback: accept anything reasonably long
    return len(k) < 20


def get_client() -> SupabaseClient | NotConfiguredClient:
    """Get Supabase client instance (singleton pattern).

    Preference order:
    1) Environment variables (Codespaces secrets)
    2) Streamlit secrets (service key or anon read-only)
    3) Env anon read-only fallback

    Returns:
        SupabaseClient if configured, NotConfiguredClient otherwise
    """
    # Check for feature flag disable
    if os.environ.get("DISABLE_LIBRARY") == "1" or _is_disabled_via_secrets():
        return NotConfiguredClient()

    # 1) Environment variables first (Codespaces secrets)
    url = os.environ.get("SUPABASE_URL") or os.environ.get("STREAMLIT_SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY") or os.environ.get("STREAMLIT_SUPABASE_KEY")
    bucket = os.environ.get("SUPABASE_BUCKET", "pots")

    if url and key and not _looks_like_invalid_key(key):
        config = SupabaseConfig(url=url, key=key, bucket=bucket)
        return SupabaseClient(config)

    # 2) Streamlit secrets
    if HAS_STREAMLIT and st is not None:
        try:
            secrets = st.secrets.get("connections", {}).get("supabase", {})
            if secrets and "url" in secrets and "key" in secrets:
                # Validate key before constructing client
                if _looks_like_invalid_key(secrets.get("key")):
                    # Try read-only if anon key is provided under ALT keys
                    anon = (
                        str(secrets.get("anon", "")).strip()
                        or str(secrets.get("anon_key", "")).strip()
                    )
                    if anon:
                        cfg = SupabaseConfig(
                            url=str(secrets["url"]).strip(),
                            key=anon,
                            bucket=str(secrets.get("bucket", "pots")).strip() or "pots",
                        )
                        return SupabaseClient(cfg, read_only=True)
                    # If secrets look invalid, fall through to env/anon instead of blocking
                else:
                    config = SupabaseConfig(
                        url=str(secrets["url"]).strip(),
                        key=str(secrets["key"]).strip(),
                        bucket=str(secrets.get("bucket", "pots")).strip() or "pots",
                    )
                    return SupabaseClient(config)
        except Exception:
            pass

    # 3) Fallback: read-only with anon key from environment
    anon_env: Optional[str] = os.environ.get("SUPABASE_ANON_KEY") or os.environ.get(
        "STREAMLIT_SUPABASE_ANON_KEY"
    )
    if url and anon_env:
        cfg = SupabaseConfig(url=url, key=anon_env, bucket=bucket)
        return SupabaseClient(cfg, read_only=True)

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
    if _client_instance is None or (
        hasattr(_client_instance, "is_configured")
        and not _client_instance.is_configured()
    ):
        _client_instance = get_client()
    return _client_instance
