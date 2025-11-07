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
    all_styles = sorted(STYLES.keys()) if isinstance(STYLES, dict) else []
    
    st.selectbox(
        "Style",
        options=all_styles,
        key=widget_key("style"),
        on_change=on_change,
        help="Choose the decorative style for your pot.",
    )
    
    return ss.get("style", "")
