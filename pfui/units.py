# pfui/units.py
from __future__ import annotations
from typing import Optional, cast
import streamlit as st

_MM_PER_IN = 25.4


def _mm_to_in(x: float) -> float:
    return x / _MM_PER_IN


def _in_to_mm(x: float) -> float:
    return x * _MM_PER_IN


def get_units(key: str = "ui__units") -> str:
    """Return current display units ('mm'|'in')."""
    # st.session_state.get() is typed as Any; cast to str for mypy while preserving runtime behavior
    return cast(str, st.session_state.get(key, "mm"))


def units_selector(*, key: str = "ui__units", location: str = "sidebar") -> str:
    """
    Renders a single units selector (guarded so it can be called multiple times
    without creating duplicate widgets). The widget key is customizable to avoid
    collisions.
    """
    mount_flag = f"{key}__mounted"
    if st.session_state.get(mount_flag):
        return cast(str, st.session_state.get(key, "mm"))

    host = st.sidebar if location == "sidebar" else st
    current = st.session_state.get(key, "mm")
    choice = host.selectbox(
        "Display units",
        options=["mm", "in"],
        index=0 if current == "mm" else 1,
        key=key,
        help="Values display in these units; geometry stays in mm internally.",
    )
    st.session_state[mount_flag] = True
    return choice


def unit_number_input(
    label: str,
    *,
    min_value: Optional[float] = None,
    max_value: Optional[float] = None,
    value: float = 0.0,
    step: Optional[float] = None,
    format_mm: str = "%.1f",
    format_in: str = "%.2f",
    key: Optional[str] = None,
    help: Optional[str] = None,
    location: str = "sidebar",
) -> float:
    """
    Number input that shows values in the selected units, but **returns mm**.
    """
    host = st.sidebar if location == "sidebar" else st
    units = get_units()

    if units == "in":
        conv = _mm_to_in
        inv = _in_to_mm
        fmt = format_in
    else:

        def conv(x):
            return x

        def inv(x):
            return x

        fmt = format_mm

    def _c(x):
        return None if x is None else conv(float(x))

    out = host.number_input(
        label,
        min_value=_c(min_value),
        max_value=_c(max_value),
        value=conv(float(value)),
        step=_c(step),
        format=fmt,
        key=key,
        help=help,
    )
    try:
        return float(inv(out))
    except Exception:
        return float(value)


def unit_slider(
    label: str,
    *,
    min_value: float,
    max_value: float,
    value: float,
    step: Optional[float] = None,
    key: Optional[str] = None,
    help: Optional[str] = None,
    location: str = "sidebar",
) -> float:
    """
    Slider that shows values in the selected units, but **returns mm**.
    """
    host = st.sidebar if location == "sidebar" else st
    units = get_units()

    if units == "in":
        conv = _mm_to_in
        inv = _in_to_mm
    else:

        def conv(x):
            return x

        def inv(x):
            return x

    val = host.slider(
        label,
        min_value=float(conv(min_value)),
        max_value=float(conv(max_value)),
        value=float(conv(value)),
        step=None if step is None else float(conv(step)),
        key=key,
        help=help,
    )
    return float(inv(val))
