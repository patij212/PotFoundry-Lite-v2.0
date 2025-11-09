"""Style selector widget."""

from __future__ import annotations

from typing import Any

import streamlit as st

from pfui.imports import STYLES
from pfui.state import widget_key


def render_style_selector(ss: dict[str, Any], on_change: callable) -> str:
    """Render style selection widget.
    
    Args:
        ss: Session state dictionary
        on_change: Callback to trigger when style changes
        
    Returns:
        Selected style name
    """
    # STYLES may be a lazy proxy (not a plain dict). Call .keys() defensively.
    try:
        all_styles = sorted(list(STYLES.keys()))
    except Exception:
        try:
            # Fallback: attempt to treat STYLES as a mapping via iteration
            all_styles = sorted([k for k in STYLES])
        except Exception:
            all_styles = []

    st.selectbox(
        "Style",
        options=all_styles,
        key=widget_key("style"),
        on_change=on_change,
        help="Choose the decorative style for your pot.",
    )

    # Synchronize canonical style key with widget value
    try:
        selected = ss.get(widget_key("style"))
        if isinstance(selected, str) and selected:
            ss["style"] = selected
        elif all_styles:
            ss["style"] = all_styles[0]
    except Exception:
        if all_styles:
            ss["style"] = all_styles[0]

    return ss.get("style", all_styles[0] if all_styles else "")
