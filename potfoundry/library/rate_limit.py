"""Rate limiting for library publishing.

Provides client-side rate limiting to prevent abuse of the
publishing system.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Optional, Tuple

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
    "check_rate_limit",
    "record_publish",
]


def check_rate_limit() -> Tuple[bool, Optional[str]]:
    """Check if user can publish (client-side rate limiting).

    Enforces:
    - Maximum 5 publishes per 60 seconds (burst limit)
    - Minimum 10 seconds between publishes (spam prevention)

    Returns:
        Tuple of (can_publish, error_message)
    """
    if not HAS_STREAMLIT or st is None:
        return True, None

    # Get publish history from session state
    publish_times = st.session_state.get("_library_publish_times", [])

    # Clean old entries (> 60 seconds ago)
    now = datetime.now().timestamp()
    recent_times = [t for t in publish_times if now - t < 60]

    # Check burst limit (5 per 60 seconds)
    if len(recent_times) >= 5:
        return False, "Rate limit exceeded. Please wait before publishing again."

    # Check minimum interval (10 seconds)
    if recent_times and (now - recent_times[-1]) < 10:
        wait_seconds = int(10 - (now - recent_times[-1]))
        return False, f"Please wait {wait_seconds} seconds before publishing again."

    return True, None


def record_publish() -> None:
    """Record a publish event for rate limiting.

    Appends current timestamp to session state publish history.
    Automatically cleans entries older than 120 seconds.
    
    Note:
        This function mutates Streamlit's session_state and returns None.
    """
    if not HAS_STREAMLIT or st is None:
        return

    publish_times = st.session_state.get("_library_publish_times", [])
    publish_times.append(datetime.now().timestamp())

    # Keep only recent entries
    now = datetime.now().timestamp()
    st.session_state["_library_publish_times"] = [
        t for t in publish_times if now - t < 120
    ]
