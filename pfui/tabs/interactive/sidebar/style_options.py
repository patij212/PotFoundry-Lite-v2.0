"""Style options expander rendering."""

from __future__ import annotations

import streamlit as st

from pfui.controls import style_controls as _style_controls


def render_style_options(current_style: str, on_change: callable) -> None:
    """Render style-specific options.
    
    Args:
        current_style: Currently selected style name
        on_change: Callback to trigger when options change
    """
    with st.expander("Style Options"):
        # Render style-specific controls using the extracted style_controls
        _style_controls(current_style, on_change=on_change)
