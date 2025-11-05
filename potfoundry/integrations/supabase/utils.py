"""Utility functions for Supabase client configuration and validation.

Provides helper functions for:
- Configuration validation
- TLS certificate verification control
- Streamlit secrets integration
"""

from __future__ import annotations

import os
from typing import TYPE_CHECKING, Optional

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


__all__ = [
    "is_disabled_via_secrets",
    "should_skip_tls_verify",
    "emit_tls_override_warning",
    "looks_like_invalid_key",
]


# Global flag to track TLS warning emission
_tls_warning_emitted: bool = False


def is_disabled_via_secrets() -> bool:
    """Check if library is disabled via Streamlit secrets.
    
    Returns:
        True if DISABLE_LIBRARY secret is set to "1"
    """
    if HAS_STREAMLIT and st is not None:
        try:
            val = str(st.secrets.get("DISABLE_LIBRARY", "0")).strip()
            return val == "1"
        except Exception:
            return False
    return False


def should_skip_tls_verify() -> bool:
    """Return True when TLS verification should be skipped (explicit opt-in).
    
    Checks environment variables and Streamlit secrets for TLS skip flags.
    
    Returns:
        True if TLS verification should be skipped
    """
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


def emit_tls_override_warning() -> None:
    """Warn once that TLS verification has been disabled.
    
    Emits warning to Streamlit UI if available, otherwise prints to console.
    Uses global flag to ensure warning is only shown once.
    """
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


def looks_like_invalid_key(key: Optional[str]) -> bool:
    """Return True when a key is definitely invalid (placeholder/empty).

    Accepts both JWT-like keys (eyJ...) and srv- prefixed keys.
    
    Args:
        key: API key to validate
        
    Returns:
        True if key appears invalid or is a placeholder
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
