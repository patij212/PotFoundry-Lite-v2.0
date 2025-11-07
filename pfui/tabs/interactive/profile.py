"""Profile display module for Interactive Designer tab.

Handles rendering of 2D radial profile visualization.
"""

from __future__ import annotations

from typing import Any

import streamlit as st

from pfui.preview import render_profile


def render_profile_section(
    H: float,
    Rt: float,
    Rb: float,
    expn: float,
    r_outer_fn: Any,
    opts: dict,
    t_wall: float,
) -> None:
    """Render 2D radial profile section.

    Displays a 2D visualization of the pot's radial profile.

    Args:
        H: Total height in mm
        Rt: Top radius in mm
        Rb: Bottom radius in mm
        expn: Expansion exponent
        r_outer_fn: Outer radius style function
        opts: Style options dictionary
        t_wall: Wall thickness in mm
    """
    with st.expander("2D radial profile"):
        render_profile(H, Rt, Rb, expn, r_outer_fn, dict(opts), t_wall)
