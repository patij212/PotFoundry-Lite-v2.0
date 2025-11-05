"""Interactive Designer tab - main UI for PotFoundry.

This module contains the complete Interactive Designer tab logic,
extracted from app.py to improve modularity and maintainability.

The tab has been fully modularized with components extracted to:
- pfui/tabs/interactive/sidebar.py - All sidebar input controls
- pfui/tabs/interactive/preview.py - Preview rendering and orchestration  
- pfui/tabs/interactive/export.py - STL export and library publishing
- pfui/tabs/interactive/metrics.py - Mesh statistics
- pfui/tabs/interactive/performance.py - Performance logs
- pfui/tabs/interactive/profile.py - 2D profile visualization
"""

from __future__ import annotations

from typing import Any, cast

import streamlit as st

# Import modular components
from pfui.app_components import render_appearance_settings, render_snapshots
from pfui.health import _design_health, _health_badge
from pfui.state import widget_key
from pfui.tabs.interactive import (
    render_export_section,
    render_metrics_section,
    render_performance_section,
    render_preview_section,
    render_profile_section,
    render_sidebar_section,
)


def render_interactive_tab(
    _has_library: bool = False,
    _library_read_only: bool = False,
) -> None:
    """Render the complete Interactive Designer tab.
    
    This is the main UI for designing and previewing pots interactively.
    All major sections have been extracted to focused modules.
    
    Args:
        _has_library: Whether library is configured
        _library_read_only: Whether library is in read-only mode
    """
    # Get session state reference
    ss = cast(dict[str, Any], st.session_state)
    
    # ------------------ SIDEBAR (all inputs) ------------------
    with st.sidebar:
        render_sidebar_section()

    # --------------- PREVIEW & EXPORT CONTROLS ---------------
    with st.expander("Preview & Export", expanded=True):
        col1, col2 = st.columns(2)
        with col1:
            preview_mode = st.radio(
                "Preview Mode",
                options=["manual", "auto", "debounced"],
                index=0,
                horizontal=True,
                key=widget_key("preview_mode"),
                help=(
                    "**Manual**: Click 'Update Preview' button to refresh\n\n"
                    "**Auto**: Preview updates immediately on every change\n\n"
                    "**Debounced**: Preview auto-updates after you stop editing (requires JavaScript)"
                ),
            )
        with col2:
            mesh_quality = st.radio(
                "Preview Quality",
                options=["quick", "full"],
                index=0,
                horizontal=True,
                key=widget_key("mesh_quality"),
                help=(
                    "**Quick**: Fast surface preview\n\n"
                    "**Full**: Complete triangular mesh (slower but accurate)"
                ),
            )

    # ---------------- HEALTH & WARNINGS ----------------
    health_data = _design_health()
    health_code = health_data.get("health", "unknown")
    _health_badge(health_code)

    # -------------------- PREVIEW ----------------------
    render_preview_section(preview_mode)

    # -------------------- METRICS ----------------------
    render_metrics_section()

    # -------------------- APPEARANCE / PREVIEW SETTINGS --------------------
    render_appearance_settings()

    # -------------------- SNAPSHOTS --------------------
    render_snapshots()

    # ---------------------- EXPORT ---------------------
    render_export_section(
        _has_library=_has_library,
        _library_read_only=_library_read_only,
    )

    # ----------------- 2D PROFILE ----------------------
    render_profile_section()

    # --------------- PERFORMANCE (DEV) ----------------
    render_performance_section()
