from __future__ import annotations

from typing import Any, Callable, Dict, cast

import streamlit as st


def render_dimensions(*, mark_changed: Callable[[], None], style_key: str) -> Dict[str, Any]:
    """Render the "Dimensions (mm)" expander and return structured values.

    This mirrors the existing UI block in `app.py` but is isolated so the
    sidebar can be migrated incrementally. It updates `st.session_state`
    in-place and returns a dict with canonical keys used by the app.

    Args:
        mark_changed: callback to call when a value changes (keeps session-state semantics).
        style_key: style-scoped key used by some widgets.

    Returns:
        Dict with keys: H, top_od, bottom_od, t_wall, t_bottom, r_drain, Rt, Rb, _dim_issues
    """
    # Local defensive coercions (kept upstream-compatible)
    def _unwrap_scalar(v: Any) -> Any:
        if isinstance(v, (list, tuple)):
            try:
                return v[0]
            except Exception:
                return v
        return v

    def _to_float_scalar(x: Any) -> float:
        try:
            v = _unwrap_scalar(x)
            if isinstance(v, (int, float)):
                return float(v)
            if isinstance(v, (str, bytes)):
                try:
                    return float(v)
                except Exception:
                    return 0.0
            try:
                return float(v)
            except Exception:
                return 0.0
        except Exception:
            return 0.0

    ss = cast(dict[str, Any], st.session_state)
    from pfui.health import validate_dimensions  # local import to avoid heavy startup cost

    with st.expander("Dimensions (mm)", expanded=True):
        H = float(
            st.number_input(
                "Height",
                60.0,
                240.0,
                _to_float_scalar(ss.get("H", 120.0)),
                5.0,
                key="H",
                help="Overall height of the pot measured from the base to the rim.",
                on_change=mark_changed,
            )
        )

        top_od = float(
            st.number_input(
                "Top OD",
                60.0,
                240.0,
                _to_float_scalar(ss.get("top_od", 140.0)),
                5.0,
                key="top_od",
                help="Outer diameter at the rim (OD = outside diameter).",
                on_change=mark_changed,
            )
        )
        bottom_od = float(
            st.number_input(
                "Bottom OD",
                40.0,
                200.0,
                _to_float_scalar(ss.get("bottom_od", 90.0)),
                5.0,
                key="bottom_od",
                help="Outer diameter at the base. Increase for more stability or reduce for a sleeker profile.",
                on_change=mark_changed,
            )
        )
        t_wall = float(
            st.number_input(
                "Wall thickness",
                2.0,
                8.0,
                _to_float_scalar(ss.get("t_wall", 3.0)),
                0.5,
                key="t_wall",
                help="Thickness of the pot wall. Typical FDM prints work well around 2.5–3.0 mm.",
                on_change=mark_changed,
            )
        )
        t_bottom = float(
            st.number_input(
                "Bottom slab",
                2.0,
                10.0,
                _to_float_scalar(ss.get("t_bottom", 3.0)),
                0.5,
                key="t_bottom",
                help="Thickness of the bottom solid slab. Thicker improves rigidity and weight.",
                on_change=mark_changed,
            )
        )
        r_drain = float(
            st.number_input(
                "Drain hole",
                3.0,
                30.0,
                _to_float_scalar(ss.get("r_drain", 10.0)),
                1.0,
                key="r_drain",
                help="Radius of the drainage hole. Ensure it remains smaller than inner radius at the base.",
                on_change=mark_changed,
            )
        )

        Rt, Rb = 0.5 * top_od, 0.5 * bottom_od

        # Inline validation with actionable suggestions (kept identical to app.py)
        try:
            _dim_issues = validate_dimensions(H, top_od, bottom_od, t_wall, t_bottom, r_drain)
        except Exception:
            _dim_issues = []
        if _dim_issues:
            for i, issue in enumerate(_dim_issues):
                if issue.level == "error":
                    st.error(issue.message)
                elif issue.level == "warn":
                    st.warning(issue.message)
                else:
                    st.info(issue.message)
                if issue.suggestion:
                    cfx1, cfx2 = st.columns([1, 6])
                    with cfx1:
                        if st.button("Fix", key=f"fix_{issue.field}_{i}"):
                            for k, v in issue.suggestion.items():
                                try:
                                    ss[k] = v
                                except Exception:
                                    pass
                            try:
                                st.rerun()
                            except Exception:
                                pass
                    with cfx2:
                        st.caption("Apply suggested safe values.")

    return {
        "H": H,
        "top_od": top_od,
        "bottom_od": bottom_od,
        "t_wall": t_wall,
        "t_bottom": t_bottom,
        "r_drain": r_drain,
        "Rt": Rt,
        "Rb": Rb,
        "_dim_issues": _dim_issues,
    }


__all__ = ["render_dimensions"]


def render_profile_controls(*, mark_changed: Callable[[], None], style_key: str) -> Dict[str, Any]:
    """Render the "Profile / Curve" controls and return structured values.

    Mirrors the Profile / Curve expander in `app.py` and updates
    `st.session_state` via Streamlit widgets. Returns a dict with
    canonical keys used by the app: expn, flare_center, flare_sharp,
    bell_amp, bell_center, bell_width.
    """
    def _unwrap_scalar(v: Any) -> Any:
        if isinstance(v, (list, tuple)):
            try:
                return v[0]
            except Exception:
                return v
        return v

    def _to_float_scalar(x: Any) -> float:
        try:
            v = _unwrap_scalar(x)
            if isinstance(v, (int, float)):
                return float(v)
            if isinstance(v, (str, bytes)):
                try:
                    return float(v)
                except Exception:
                    return 0.0
            try:
                return float(v)
            except Exception:
                return 0.0
        except Exception:
            return 0.0

    ss = cast(dict[str, Any], st.session_state)
    from pfui.state import widget_key

    with st.expander("Profile / Curve", expanded=True):
        expn = float(
            st.slider(
                "Flare exponent",
                0.7,
                1.6,
                _to_float_scalar(ss.get("expn", 1.1)),
                0.05,
                key=widget_key(style_key, "expn"),
                on_change=mark_changed,
                help="Controls how quickly the wall expands from base to rim. >1 favors the top, <1 favors the base.",
            )
        )

        c1, c2, c3 = st.columns(3)
        k1 = widget_key(style_key, "flare_center")
        k2 = widget_key(style_key, "flare_sharp")
        k3 = widget_key(style_key, "bell_amp")
        flare_center = float(
            c1.slider(
                "Flare center (0–1)",
                0.1,
                0.9,
                _to_float_scalar(ss.get(k1, 0.5)),
                0.01,
                key=k1,
                on_change=mark_changed,
                help="Where along the height the flare concentrates. 0=base, 1=top.",
            )
        )
        flare_sharp = float(
            c2.slider(
                "Flare sharpness",
                1.0,
                12.0,
                _to_float_scalar(ss.get(k2, 6.0)),
                0.1,
                key=k2,
                on_change=mark_changed,
                help="Higher values make the flare transition more abrupt.",
            )
        )
        bell_amp = float(
            c3.slider(
                "Bell amplitude",
                0.0,
                0.5,
                _to_float_scalar(ss.get(k3, 0.0)),
                0.01,
                key=k3,
                on_change=mark_changed,
                help="Adds a soft ring-shaped bulge; set to 0 to disable.",
            )
        )
        c4, c5 = st.columns(2)
        k4 = widget_key(style_key, "bell_center")
        k5 = widget_key(style_key, "bell_width")
        bell_center = float(
            c4.slider(
                "Bell center (0–1)",
                0.1,
                0.9,
                _to_float_scalar(ss.get(k4, 0.5)),
                0.01,
                key=k4,
                on_change=mark_changed,
                help="Height position of the bell-shaped bulge.",
            )
        )
        bell_width = float(
            c5.slider(
                "Bell width",
                0.05,
                0.5,
                _to_float_scalar(ss.get(k5, 0.22)),
                0.01,
                key=k5,
                on_change=mark_changed,
                help="Controls how wide the bell bulge spreads.",
            )
        )

    return {
        "expn": expn,
        "flare_center": flare_center,
        "flare_sharp": flare_sharp,
        "bell_amp": bell_amp,
        "bell_center": bell_center,
        "bell_width": bell_width,
    }


__all__ = ["render_dimensions", "render_profile_controls"]
