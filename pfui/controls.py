from __future__ import annotations
from typing import Any, Dict
import streamlit as st

from .schemas import STYLE_SCHEMAS   # << changed
from .state import widget_key


def style_controls(style: str) -> Dict[str, Any]:
    schema = STYLE_SCHEMAS.get(style, {})
    if not schema:
        st.info("This style has no specific controls. Use Advanced options below or JSON override.")
        return {}
    colN = max(2, min(4, len(schema)))
    cols = st.columns(colN)
    out: Dict[str, Any] = {}
    for i, (key, meta) in enumerate(schema.items()):
        c = cols[i % colN]
        wkey = widget_key(style, key)
        # Pobierz wartość z session_state lub domyślną
        if wkey in st.session_state:
            value = st.session_state[wkey]
        else:
            value = meta["default"]
        # Limit value to allowed range
        if meta["type"] == "int":
            value = int(max(meta["min"], min(meta["max"], value)))
            out[key] = int(c.slider(meta["label"], int(meta["min"]), int(meta["max"]), value, int(meta["step"]), key=wkey))
        else:
            value = float(max(meta["min"], min(meta["max"], value)))
            out[key] = float(c.slider(meta["label"], float(meta["min"]), float(meta["max"]), value, float(meta["step"]), key=wkey))
    return out


def adv_shape_controls(style: str) -> Dict[str, Any]:
    st.caption("These affect the base profile shared by all styles.")
    c1, c2, c3 = st.columns(3)
    k1 = widget_key(style, "flare_center")
    k2 = widget_key(style, "flare_sharp")
    k3 = widget_key(style, "bell_amp")
    flare_center = float(c1.slider("Flare center", 0.1, 0.9, st.session_state.get(k1, 0.5), 0.01, key=k1))
    flare_sharp  = float(c2.slider("Flare sharpness", 1.0, 12.0, st.session_state.get(k2, 6.0), 0.1, key=k2))
    bell_amp     = float(c3.slider("Bell amplitude", 0.0, 0.5, st.session_state.get(k3, 0.0), 0.01, key=k3))

    c4, c5 = st.columns(2)
    k4 = widget_key(style, "bell_center")
    k5 = widget_key(style, "bell_width")
    bell_center  = float(c4.slider("Bell center", 0.1, 0.9, st.session_state.get(k4, 0.5), 0.01, key=k4))
    bell_width   = float(c5.slider("Bell width", 0.05, 0.5, st.session_state.get(k5, 0.22), 0.01, key=k5))

    return {
        "flare_center": flare_center,
        "flare_sharp":  flare_sharp,
        "bell_amp":     bell_amp,
        "bell_center":  bell_center,
        "bell_width":   bell_width,
    }


def twist_controls(style: str) -> Dict[str, Any]:
    c1, c2, c3 = st.columns(3)
    k1 = widget_key(style, "spin_turns")
    k2 = widget_key(style, "spin_phase_deg")
    k3 = widget_key(style, "spin_curve_exp")
    # Allow negative twist (e.g. from -3 to 3)
    # Coerce stored values to float to avoid Streamlit type mismatch if an int slipped in
    v_turns = float(st.session_state.get(k1, 0.0) or 0.0)
    v_phase = float(st.session_state.get(k2, 0.0) or 0.0)
    v_curve = float(st.session_state.get(k3, 1.0) or 1.0)
    spin_turns = float(c1.slider("Twist turns (negative = left, positive = right)", -3.0, 3.0, v_turns, 0.05, key=k1))
    spin_phase = float(c2.slider("Twist phase (deg, offset)", -180.0, 180.0, v_phase, 1.0, key=k2))
    spin_curve = float(c3.slider("Twist curve exponent", 0.1, 3.0, v_curve, 0.05, key=k3))
    return {"spin_turns": spin_turns, "spin_phase_deg": spin_phase, "spin_curve_exp": spin_curve}