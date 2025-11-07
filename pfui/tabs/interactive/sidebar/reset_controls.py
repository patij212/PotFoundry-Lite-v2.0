"""Reset controls rendering."""

from __future__ import annotations

import streamlit as st

from pfui.state import reset_all_defaults, reset_style_defaults


def render_reset_controls(on_change: callable) -> None:
    """Render reset buttons.

    Args:
        on_change: Callback to trigger when reset is performed
    """
    st.markdown("---")
    col_reset1, col_reset2 = st.columns(2)
    with col_reset1:
        if st.button(
            "Reset Style Defaults", help="Reset style-specific parameters to defaults"
        ):
            reset_style_defaults()
            st.success("Reset style defaults")
            on_change()
            st.rerun()
    with col_reset2:
        if st.button("Reset All", help="Reset all parameters to defaults"):
            reset_all_defaults()
            st.success("Reset all parameters")
            on_change()
            st.rerun()
