"""Profile controls rendering."""

from __future__ import annotations

import streamlit as st

from pfui.app_components.sidebar import (
    render_profile_controls as _render_profile_controls,
)


def render_profile(on_change: callable) -> None:
    """Render profile controls.

    Args:
        on_change: Callback to trigger when profile settings change
    """
    with st.expander("Profile"):
        _render_profile_controls(on_change=on_change)
