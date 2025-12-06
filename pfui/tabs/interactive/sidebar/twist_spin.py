"""Twist and spin controls wrapper.

Currently delegates to `pfui.controls.twist_controls` which renders
twist-related sliders and manages its own change markers. Spin-specific
controls may be added later; schema flags are inspected to decide if
the block should appear.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from pfui._st import get_effective_st as get_st
from pfui.controls import twist_controls as _twist_controls


def render_twist_spin(style_name: str, style_schema: dict[str, Any], on_change: Callable[[], None] | None = None) -> None:
    """Render twist/spin controls if schema indicates support.

    Args:
        style_name: Current style name for widget key scoping
        style_schema: Style schema metadata dict

    """
    # Some style schemas declare explicit flags; others simply include the
    # parameter keys. Treat either case as enabling the controls so they
    # are not accidentally hidden when a schema omits the boolean flag.
    has_spin = bool(style_schema.get("has_spin_controls", False))
    has_twist = bool(style_schema.get("has_twist_controls", False))
    spin_keys = {"spin_turns", "spin_phase_deg", "spin_curve_exp"}
    schema_keys = set(style_schema.keys() if style_schema else [])
    if has_spin or has_twist or (schema_keys & spin_keys):
        st = get_st()
        with st.expander("Twist / Spin", expanded=False):
            # Global twist controls (apply after style function)
            try:
                g_cols = st.columns([1.5, 1.5, 1.0])
                enable_key = "global_spin_enable"
                enabled = bool(st.session_state.get(enable_key, False))
                enabled = g_cols[0].checkbox("Apply global twist to all styles", value=enabled, key=enable_key, help="When enabled, the global twist values below are applied to every style after the style function.", on_change=on_change)
                gs1, gs2 = st.columns([1.5, 1.5])
                # Global param keys
                k1 = "global_spin_turns"
                k2 = "global_spin_phase_deg"
                k3 = "global_spin_curve_exp"
                v_turns = float(st.session_state.get(k1, 0.0) or 0.0)
                v_phase = float(st.session_state.get(k2, 0.0) or 0.0)
                v_curve = float(st.session_state.get(k3, 1.0) or 1.0)
                # Render global sliders
                st.session_state[k1] = float(gs1.slider("Global twist turns", -6.0, 6.0, v_turns, 0.05, key=k1, on_change=on_change))
                st.session_state[k2] = float(gs2.slider("Global twist phase (deg)", -180.0, 180.0, v_phase, 1.0, key=k2, on_change=on_change))
                st.session_state[k3] = float(st.slider("Global twist curve exponent", 0.1, 5.0, v_curve, 0.05, key=k3, on_change=on_change))
            except Exception:
                pass

            try:
                _twist_controls(style_name)
            except Exception:
                # Fail silently - twist controls are optional
                pass
