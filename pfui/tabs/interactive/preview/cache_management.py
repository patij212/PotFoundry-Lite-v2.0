"""Cache management for preview rendering."""

from __future__ import annotations

from typing import Any

import streamlit as st


def initialize_preview_cache(ss: dict[str, Any]) -> None:
    """Initialize preview cache keys in session state.

    Sets up separate caches for surface (fast) and mesh (exact) previews,
    and initializes the stale flag for manual mode.

    Args:
        ss: Session state dictionary
    """
    # Keep separate caches for surface (fast) and mesh (exact) previews
    ss.setdefault("_last_surface_png", None)
    ss.setdefault("_last_surface_fig_json", None)
    ss.setdefault("_last_mesh_png", None)
    ss.setdefault("_last_mesh_fig_json", None)
    ss.setdefault("_preview_stale", False)


def clear_preview_cache(ss: dict[str, Any]) -> None:
    """Clear all preview caches from session state.

    Clears both Streamlit cache and session-cached arrays/figures.

    Args:
        ss: Session state dictionary
    """
    try:
        st.cache_data.clear()
    except Exception:
        pass

    # Clear session-cached arrays and figures
    for k in (
        "_last_X",
        "_last_Y",
        "_last_Z",
        "_last_mesh_V",
        "_last_mesh_F",
        "_last_mesh_fig_json",
        "_last_surface_fig_json",
        "_last_mesh_png",
        "_last_surface_png",
    ):
        try:
            if k in ss:
                del ss[k]
        except Exception:
            pass
    ss["_preview_stale"] = True
