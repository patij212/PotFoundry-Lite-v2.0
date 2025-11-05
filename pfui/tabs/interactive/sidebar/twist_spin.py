"""Twist and spin controls rendering."""

from __future__ import annotations

from typing import Any

import streamlit as st

from pfui.controls import twist_controls as _twist_controls


def render_twist_spin(
    style_schema: dict[str, Any],
    on_change: callable
) -> None:
    """Render twist and spin controls if supported by style.
    
    Args:
        style_schema: Style schema dictionary
        on_change: Callback to trigger when twist/spin changes
    """
    # Compute which twist/spin controls are relevant for this style
    has_spin = style_schema.get("has_spin_controls", False)
    has_twist = style_schema.get("has_twist_controls", False)
    show_twist_spin = has_spin or has_twist
    
    # If the style supports both, show them in the same expander.
    # Otherwise, show twist (common default) if has_twist is True.
    if show_twist_spin:
        with st.expander("Twist / Spin"):
            _twist_controls(on_change=on_change, has_spin=has_spin, has_twist=has_twist)
