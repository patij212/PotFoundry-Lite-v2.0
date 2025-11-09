"""Style options expander wrapper."""

from __future__ import annotations

import streamlit as st

from pfui.controls import style_controls as _style_controls


def render_style_options(current_style: str) -> None:
    """Render style-specific options for the selected style.

    Args:
        current_style: Currently selected style name
    """
    with st.expander("Style Options"):
        _style_controls(current_style)
