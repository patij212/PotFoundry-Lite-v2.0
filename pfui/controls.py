from __future__ import annotations
from typing import Any, Dict
import streamlit as st

import importlib

# Avoid importing the heavy/fragile `pfui.schemas` module at module import time.
# Load on-demand at runtime to keep focused mypy runs and editor diagnostics small.
STYLE_SCHEMAS: dict = {}


def _ensure_style_schemas() -> dict:
    global STYLE_SCHEMAS
    if not STYLE_SCHEMAS:
        try:
            mod = importlib.import_module('pfui.schemas')
            STYLE_SCHEMAS.update(getattr(mod, 'get_style_schemas', lambda: {})() or {})
        except Exception:
            STYLE_SCHEMAS = {}
    return STYLE_SCHEMAS
# Intentional late import: we import widget_key after the _ensure_style_schemas
# helper to avoid importing heavy modules (like pfui.state/pfui.schemas) at
# module-import time which can trigger editor/type-checker traversal. Keep
# this import delayed for runtime to reduce mypy/Pylance noise.
from .state import widget_key  # ruff: noqa: E402


def _render_control(style: str, key: str, meta: Dict[str, Any]) -> Any:
    """Render a single control based on meta and return its value."""
    import streamlit as st  # local alias
    wkey = widget_key(style, key)
    mtype = meta.get("type", "float")
    default = meta.get("default")
    value = st.session_state.get(wkey, default)

    if mtype == "bool":
        try:
            checked = bool(value)
        except Exception:
            checked = bool(default)
        return bool(st.checkbox(meta.get("label", key), value=checked, key=wkey, help=meta.get("help", "")))

    if mtype in ("int", "float"):
        # Establish safe numeric bounds
        def _to_float(x, fallback):
            try:
                return float(x)
            except Exception:
                return float(fallback)
        default_num = _to_float(default if default is not None else 0.0, 0.0)
        if mtype == "int":
            # Ensure numeric types are explicit for mypy: coerce meta values to float then to int
            minv_i: int = int(round(float(meta.get("min", int(default_num) - 10))))
            maxv_i: int = int(round(float(meta.get("max", int(default_num) + 10))))
            step_i: int = int(round(float(meta.get("step", 1))))
            if maxv_i <= minv_i:
                maxv_i = minv_i + max(1, step_i)
            cur = int(round(_to_float(value, default_num)))
            cur = max(minv_i, min(maxv_i, cur))
            return int(st.slider(meta.get("label", key), minv_i, maxv_i, cur, step_i, key=wkey, help=meta.get("help", "")))
        else:
            # Float branch: coerce values to float for consistent typing
            minv_f: float = float(meta.get("min", default_num - 1.0))
            maxv_f: float = float(meta.get("max", default_num + 1.0))
            step_f: float = float(meta.get("step", 0.01))
            if maxv_f <= minv_f:
                maxv_f = minv_f + (step_f if step_f > 0 else 1.0)
            cur = _to_float(value, default_num)
            cur = max(minv_f, min(maxv_f, cur))
            return float(st.slider(meta.get("label", key), minv_f, maxv_f, cur, step_f, key=wkey, help=meta.get("help", "")))

    if mtype == "select":
        options = meta.get("options", []) or []
        if not options:
            return st.text_input(meta.get("label", key), value=str(value) if value is not None else "", key=wkey, help=meta.get("help", ""))
        default_choice = value if value in options else (options[0] if options else None)
        try:
            idx = options.index(default_choice) if default_choice in options else 0
        except Exception:
            idx = 0
        return st.selectbox(meta.get("label", key), options=options, index=idx, key=wkey, help=meta.get("help", ""))

    # Fallback
    return st.text_input(meta.get("label", key), value=str(value) if value is not None else "", key=wkey, help=meta.get("help", ""))


def style_controls(style: str) -> Dict[str, Any]:
    """Display style-specific parameter controls in Streamlit UI.

    Purpose:
        Reduce clutter by grouping controls into focused sections per style while
        preserving all available options. Unknown/new keys are rendered in a catch-all.

    Args:
        style: Name of the style to display controls for

    Returns:
        Dict[str, Any]: map of option key -> selected value
    """
    schema = _ensure_style_schemas().get(style, {})
    if not schema:
        st.info("This style has no specific controls. Use Advanced options below or JSON override.")
        return {}

    # ---------------- LowPolyFacet: fine-grained grouping ----------------
    if style == "LowPolyFacet":
        out_lp: Dict[str, Any] = {}

        shape_keys = [
            "lp_facets", "lp_tiers", "lp_amp", "lp_bevel", "lp_phase_deg", "lp_jitter",
            "lp_facet_dir", "lp_outward_mode",
        ]
        seam_cut_keys = [
            "lp_cut_bot_deg", "lp_cut_top_deg", "lp_link_cut_angles",
            "lp_cut_cap_mm", "lp_cut_depth_frac_of_facet", "lp_cut_z_window_frac",
            "lp_cut_softness_mm", "lp_uniform_ring", "lp_uniform_ring_localize",
            "lp_uniform_ring_lock_threshold", "lp_uniform_ring_blend_pow",
            "lp_cut_straight_edges", "lp_cut_straight_smooth_mode",
            "lp_cut_straight_smooth_strength", "lp_cut_straight_smooth_passes",
        ]
        edge_diag_keys = [
            "lp_edge_cut_mm", "lp_edge_cut_sharp",
            "lp_edge_solidify_enable", "lp_edge_solidify_strength", "lp_edge_solidify_thresh", "lp_edge_solidify_passes",
            "lp_diagonal_smooth_passes", "lp_seam_sampling_boost", "lp_seam_lock_strength",
        ]
        print_debug_keys = [
            "lp_print_safe_mode", "lp_debug_seam",
        ]

        with st.expander("Facet shape", expanded=True):
            cols = st.columns(3)
            for i, k in enumerate([kk for kk in shape_keys if kk in schema]):
                with cols[i % 3]:
                    out_lp[k] = _render_control(style, k, schema[k])

        with st.expander("Seam cuts", expanded=False):
            cols = st.columns(3)
            for i, k in enumerate([kk for kk in seam_cut_keys if kk in schema]):
                with cols[i % 3]:
                    out_lp[k] = _render_control(style, k, schema[k])
            # Convenience: link cut angles mirrors bottom to top
            try:
                if out_lp.get("lp_link_cut_angles"):
                    out_lp["lp_cut_top_deg"] = int(out_lp.get("lp_cut_bot_deg", 0) or 0)
            except Exception:
                pass

        with st.expander("Edge clarity & diagonals", expanded=False):
            cols = st.columns(3)
            for i, k in enumerate([kk for kk in edge_diag_keys if kk in schema]):
                with cols[i % 3]:
                    out_lp[k] = _render_control(style, k, schema[k])

        with st.expander("Print & debug", expanded=False):
            cols = st.columns(3)
            for i, k in enumerate([kk for kk in print_debug_keys if kk in schema]):
                with cols[i % 3]:
                    out_lp[k] = _render_control(style, k, schema[k])

        # Render any remaining/unknown keys so future additions are not hidden
        consumed = set(shape_keys) | set(seam_cut_keys) | set(edge_diag_keys) | set(print_debug_keys)
        remaining = [k for k in schema.keys() if k not in consumed]
        if remaining:
            with st.expander("Additional parameters", expanded=False):
                cols2 = st.columns(3)
                for i, k in enumerate(remaining):
                    with cols2[i % 3]:
                        out_lp[k] = _render_control(style, k, schema[k])

        return out_lp

    # ---------------- SuperformulaBlossom: focused grouping ----------------
    if style == "SuperformulaBlossom":
        out_sf: Dict[str, Any] = {}

        shape_keys = [
            "sf_strength",
            "sf_m_base", "sf_m_top", "sf_m_curve_exp",
            "sf_a", "sf_b",
            "sf_n1", "sf_n1_top", "sf_n2", "sf_n2_top", "sf_n3", "sf_n3_top",
        ]
        tame_sharp_keys = [
            "sf_edge_tame_strength", "sf_edge_tame_k",
            "sf_auto_tame", "sf_auto_tame_thresh", "sf_auto_tame_amount",
            "sf_edge_sharp",
        ]
        edge_diag_keys = [
            "sf_edge_solidify_enable", "sf_edge_solidify_strength", "sf_edge_solidify_passes",
            "sf_edge_solidify_sigma_s", "sf_edge_solidify_sigma_r", "sf_edge_solidify_micro_thresh",
            "sf_edge_solidify_protect_grad", "sf_edge_solidify_preserve_q",
            "sf_spike_clip_enable", "sf_spike_clip_quantile", "sf_spike_clip_amount", "sf_spike_clip_window",
            "sf_spike_mad_enable", "sf_spike_mad_k", "sf_spike_mad_amount", "sf_spike_mad_window",
            "sf_spike_mad_z_boost_enable", "sf_spike_mad_z_start", "sf_spike_mad_z_power", "sf_spike_mad_k_drop_frac", "sf_spike_mad_amount_boost",
            "sf_diagonal_smooth_passes",
        ]
        peak_snap_keys = [
            "sf_peak_snap_enable", "sf_peak_snap_window", "sf_peak_snap_quantile", "sf_peak_snap_amount",
        ]
        flow_core_keys = [
            "sf_edge_flow_reconstruct_enable", "sf_edge_flow_mode",
            "sf_edge_flow_amount", "sf_edge_flow_window", "sf_edge_flow_quantile",
            "sf_edge_flow_valley_only", "sf_edge_flow_theta_snap",
        ]
        flow_ridge_keys = [
            "sf_edge_flow_peak_q", "sf_edge_flow_slopes_max",
            "sf_edge_flow_paths_band", "sf_edge_flow_max_paths",
        ]
        flow_align_keys = [
            "sf_edge_flow_twist_compensate", "sf_edge_flow_auto_deoffset", "sf_edge_flow_deoffset_max",
            "sf_edge_flow_anchor_enable", "sf_edge_flow_anchor_radius",
        ]

        with st.expander("Blossom shape", expanded=True):
            cols = st.columns(3)
            for i, k in enumerate([kk for kk in shape_keys if kk in schema]):
                with cols[i % 3]:
                    out_sf[k] = _render_control(style, k, schema[k])

        with st.expander("Tame & sharpen", expanded=False):
            cols = st.columns(3)
            for i, k in enumerate([kk for kk in tame_sharp_keys if kk in schema]):
                with cols[i % 3]:
                    out_sf[k] = _render_control(style, k, schema[k])

        with st.expander("Edge clarity & diagonals", expanded=False):
            cols = st.columns(3)
            for i, k in enumerate([kk for kk in edge_diag_keys if kk in schema]):
                with cols[i % 3]:
                    out_sf[k] = _render_control(style, k, schema[k])

        with st.expander("Edge reconstruction (peaks)", expanded=False):
            cols = st.columns(3)
            for i, k in enumerate([kk for kk in peak_snap_keys if kk in schema]):
                with cols[i % 3]:
                    out_sf[k] = _render_control(style, k, schema[k])

        with st.expander("Edge reconstruction (2D flow)", expanded=False):
            st.caption("Core")
            cols = st.columns(3)
            for i, k in enumerate([kk for kk in flow_core_keys if kk in schema]):
                with cols[i % 3]:
                    out_sf[k] = _render_control(style, k, schema[k])
            # Ridge/path options
            keys2 = [kk for kk in flow_ridge_keys if kk in schema]
            if keys2:
                st.caption("Ridge/path options")
                cols2 = st.columns(3)
                for i, k in enumerate(keys2):
                    with cols2[i % 3]:
                        out_sf[k] = _render_control(style, k, schema[k])
            # Alignment/safety options
            keys3 = [kk for kk in flow_align_keys if kk in schema]
            if keys3:
                st.caption("Alignment & safety")
                cols3 = st.columns(3)
                for i, k in enumerate(keys3):
                    with cols3[i % 3]:
                        out_sf[k] = _render_control(style, k, schema[k])

        # Any future/unknown keys
        consumed = (
            set(shape_keys)
            | set(tame_sharp_keys)
            | set(edge_diag_keys)
            | set(peak_snap_keys)
            | set(flow_core_keys)
            | set(flow_ridge_keys)
            | set(flow_align_keys)
        )
        remaining = [k for k in schema.keys() if k not in consumed]
        if remaining:
            with st.expander("Additional parameters", expanded=False):
                cols2 = st.columns(3)
                for i, k in enumerate(remaining):
                    with cols2[i % 3]:
                        out_sf[k] = _render_control(style, k, schema[k])
        return out_sf

    # ---------------- Default: simple, compact grid ----------------
    colN = max(2, min(4, len(schema)))
    cols = st.columns(colN)
    out_default: Dict[str, Any] = {}
    for i, (key, meta) in enumerate(schema.items()):
        with cols[i % colN]:
            out_default[key] = _render_control(style, key, meta)
    return out_default


def adv_shape_controls(style: str) -> Dict[str, Any]:
    """Display advanced shape parameter controls for base profile.
    
    Args:
        style: Style name (used for widget keys)
        
    Returns:
        Dictionary of advanced shape parameters
    """
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
    # Mark preview stale when changing twist controls (debounced/manual modes)
    def _mark_changed():
        try:
            st.session_state["_last_change_ts"] = __import__("time").time()
            mode = st.session_state.get("preview_mode", "manual")
            st.session_state["_preview_stale"] = (mode in ("manual", "debounced"))
        except Exception:
            pass

    spin_turns = float(c1.slider("Twist turns (negative = left, positive = right)", -3.0, 3.0, v_turns, 0.05, key=k1, on_change=_mark_changed))
    spin_phase = float(c2.slider("Twist phase (deg, offset)", -180.0, 180.0, v_phase, 1.0, key=k2, on_change=_mark_changed))
    spin_curve = float(c3.slider("Twist curve exponent", 0.1, 3.0, v_curve, 0.05, key=k3, on_change=_mark_changed))
    return {"spin_turns": spin_turns, "spin_phase_deg": spin_phase, "spin_curve_exp": spin_curve}
