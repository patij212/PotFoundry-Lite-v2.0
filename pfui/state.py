from __future__ import annotations
import streamlit as st
from .schemas import STYLE_SCHEMAS

def widget_key(style: str, field: str) -> str:
    # Normalizuj styl: tylko małe litery, cyfry, podkreślenia
    import re
    norm_style = re.sub(r"[^a-zA-Z0-9_]", "_", style).lower()
    return f"opt__{norm_style}_{field}"

# ---------- Pending updates machinery ----------
_PENDING_KEY = "__pending_updates__"

def queue_update(updates: dict) -> None:
    """Queue session_state updates for the next run (before widgets render)."""
    if _PENDING_KEY not in st.session_state:
        st.session_state[_PENDING_KEY] = {}
    st.session_state[_PENDING_KEY].update(updates)

def apply_pending_updates() -> None:
    """Apply any queued updates. Call this BEFORE creating any widgets."""
    updates = st.session_state.pop(_PENDING_KEY, None)
    if updates:
        st.session_state.update(updates)

# ---------- Reset helpers (DEFERRED writes) ----------
def reset_style_defaults(style: str) -> None:
    """Queue style-specific defaults; caller should st.rerun() after calling."""
    schema = STYLE_SCHEMAS.get(style, {})
    updates = {}
    for key, meta in schema.items():
        default = meta.get("default") if isinstance(meta, dict) else None
        updates[widget_key(style, key)] = default
    # shared defaults
    updates.update({
        widget_key(style, "flare_center"): 0.5,
        widget_key(style, "flare_sharp"):  6.0,
        widget_key(style, "bell_amp"):     0.0,
        widget_key(style, "bell_center"):  0.5,
        widget_key(style, "bell_width"):   0.22,
        widget_key(style, "spin_turns"):     0.0,
        widget_key(style, "spin_phase_deg"): 0.0,
        widget_key(style, "spin_curve_exp"): 1.0,
    })
    queue_update(updates)

def reset_all_defaults(style: str) -> None:
    """Queue global + style defaults; caller should st.rerun() after calling."""
    queue_update({
        "H":         120.0,
        "top_od":    140.0,
        "bottom_od": 90.0,
        "t_wall":    3.0,
        "t_bottom":  3.0,
        "r_drain":   10.0,
        "expn":      1.1,
    })
    reset_style_defaults(style)
