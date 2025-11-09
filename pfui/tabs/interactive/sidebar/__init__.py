"""Sidebar section orchestration for Interactive Designer tab.

This module orchestrates all sidebar input controls by delegating to
focused sub-modules for better maintainability.
"""

from __future__ import annotations

from typing import Any, Optional, cast

import streamlit as st

from pfui.app_components.utils import resolve_schema_key
import pfui.schemas as SC
from pfui.units import units_selector

from .dimensions import render_dimensions
from .model_name import render_model_name_controls
from .presets import render_presets
from .profile_controls import render_profile
from .reset_controls import render_reset_controls
from .style_options import render_style_options
from .style_selector import render_style_selector
from .twist_spin import render_twist_spin
from .utils import create_change_marker
from .mesh_resolution import render_mesh_resolution


def render_sidebar_section(on_change_callback: Optional[callable] = None) -> None:
    """Render the complete sidebar section with all input controls.
    
    Args:
        on_change_callback: Optional callback to trigger when inputs change
    """
    # Get style schemas
    styles = SC.get_style_schemas()
    
    # Narrow the runtime-typed session state to a mapping for type-checker
    ss = cast(dict[str, Any], st.session_state)
    
    # Units at a fixed, stable location
    units_selector()

    st.header("Model")
    
    # Timestamp used to implement debounced preview updates
    if "_last_change_ts" not in ss:
        ss["_last_change_ts"] = 0.0

    # Create change marker function
    _mark_changed = create_change_marker(on_change_callback)

    # --- Model Name Section ---
    render_model_name_controls(ss)

    # --- Style Selector ---
    current_style = render_style_selector(ss, on_change=_mark_changed)
    # resolve_schema_key only requires the style name; it looks up schemas internally
    schema_key = resolve_schema_key(current_style)
    style_schema = styles.get(schema_key, {}) if schema_key else {}

    # --- Dimensions Section ---
    render_dimensions(current_style, _mark_changed)

    # --- Twist / Spin Section ---
    render_twist_spin(current_style, style_schema, on_change=_mark_changed)

    # --- Profile Section ---
    render_profile(current_style, _mark_changed)

    # --- Mesh resolution sliders ---
    try:
        render_mesh_resolution(ss, on_change=_mark_changed)
    except Exception:
        # Don't block the sidebar if resolution controls fail
        pass

    # --- Style Options Section ---
    render_style_options(current_style)

    # --- Presets Section ---
    render_presets(ss, on_change=_mark_changed)

    # --- Reset Buttons ---
    render_reset_controls(on_change=_mark_changed)
