# pfui/state.py
from __future__ import annotations
import streamlit as st

from .schemas import STYLE_SCHEMAS   # << changed

def widget_key(style: str, field: str) -> str:
    return f"opt__{style}_{field}"

def reset_style_defaults(style: str) -> None:
    schema = STYLE_SCHEMAS.get(style, {})
    for key, meta in schema.items():
        st.session_state[widget_key(style, key)] = meta.get("default")
    st.session_state[widget_key(style, "flare_center")] = 0.5
    st.session_state[widget_key(style, "flare_sharp")]  = 6.0
    st.session_state[widget_key(style, "bell_amp")]     = 0.0
    st.session_state[widget_key(style, "bell_center")]  = 0.5
    st.session_state[widget_key(style, "bell_width")]   = 0.22
    st.session_state[widget_key(style, "spin_turns")]     = 0.0
    st.session_state[widget_key(style, "spin_phase_deg")] = 0.0
    st.session_state[widget_key(style, "spin_curve_exp")] = 1.0

def reset_all_defaults(style: str) -> None:
    st.session_state["H"]         = 120.0
    st.session_state["top_od"]    = 140.0
    st.session_state["bottom_od"] = 90.0
    st.session_state["t_wall"]    = 3.0
    st.session_state["t_bottom"]  = 3.0
    st.session_state["r_drain"]   = 10.0
    st.session_state["expn"]      = 1.1
    reset_style_defaults(style)
