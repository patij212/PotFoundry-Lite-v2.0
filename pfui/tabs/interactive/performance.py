"""Performance monitoring module for Interactive Designer tab.

Handles displaying performance logs and cache management.
"""

from __future__ import annotations

from typing import Any, cast

import streamlit as st


def render_performance_section() -> None:
    """Render performance monitoring section.

    Displays recent performance logs and provides cache clearing controls
    for development purposes.
    """
    with st.expander("Performance (dev)"):
        ss = cast(dict[str, Any], st.session_state)
        perf_logs = cast(Any, ss.get("_perf_logs", []))
        st.text_area("Recent timings", value="\n".join(perf_logs[-30:]), height=180)
        if st.button("Force clear caches"):
            try:
                st.cache_data.clear()
                st.success("Caches cleared")
            except Exception:
                st.error("Failed to clear caches")
