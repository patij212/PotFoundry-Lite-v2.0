"""Dimensions controls rendering."""

from __future__ import annotations

import streamlit as st

from pfui.app_components.sidebar import render_dimensions as _render_dimensions


def render_dimensions(on_change: callable) -> None:
    """Render dimensions controls.

    Args:
        on_change: Callback to trigger when dimensions change
    """
    with st.expander("Dimensions", expanded=True):
        _render_dimensions(on_change=on_change)
