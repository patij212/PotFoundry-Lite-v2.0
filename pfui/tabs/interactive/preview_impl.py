"""Preview section orchestrator for Interactive Designer tab.

This module provides a thin orchestration layer that delegates all work
to focused, specialized modules. It contains NO business logic - only
coordination and error handling.
"""

from __future__ import annotations

import logging
import math
import os
import time
from collections.abc import Callable
from typing import Any, cast

import numpy as np

# Module-level logger for preview operations
_logger = logging.getLogger(__name__)

import pfui.schemas as SC
from pfui._st import get_effective_st as get_st
from pfui.colors import resolve_background_style
from pfui.preview.style_params import STYLE_PARAM_CAPACITY, build_style_param_payload
from pfui.state import get_webgpu_camera_snapshot, webgpu_camera_signature, widget_key

# Predeclare module-level callables with permissive signatures so conditional
# try/except fallbacks below do not create mismatched function variants for
# the type checker. These are intentionally permissive `Callable[..., Any]`
# declarations used only for static typing.
extract_preview_parameters: Callable[[dict[str, Any]], Any]
get_preview_resolution: Callable[..., tuple[int, int, int, int]]
setup_preview_style: Callable[..., Any]
initialize_preview_cache: Callable[[dict[str, Any]], None]
_to_float_scalar: Callable[[Any], float]
_to_int_scalar: Callable[[Any], int]
should_update_preview_ui: Callable[..., tuple[bool, Any]]
compute_preview_signatures: Callable[..., tuple[tuple | None, tuple | None]]
generate_preview_arrays: Callable[..., tuple[Any | None, Any | None, Any | None, float]]
build_preview_mesh: Callable[..., tuple[Any | None, bool]]
render_quick_preview_surface: Callable[..., None]
render_full_preview_mesh: Callable[..., None]
render_preview_png_fallback: Callable[..., Any]
display_cached_preview: Callable[..., None]
inject_camera_capture: Callable[..., None]
render_camera_controls: Callable[..., None]
render_pyvista_full_preview: Callable[..., None]

_WGPU_DEBUG_ENV = "POTFOUNDRY_WGPU_DEBUG"


def _compute_background_theme(ss: dict[str, Any]) -> tuple[str, tuple[float, float, float, float], str]:
    mode = str(ss.get("preview_bg_mode", "gradient"))
    solid = str(ss.get("preview_bg_color", "#242B46"))
    grad_start = str(ss.get("preview_bg_grad_start", solid))
    grad_end = str(ss.get("preview_bg_grad_end", "#060A14"))
    angle = float(ss.get("preview_bg_grad_angle", 180.0))
    return resolve_background_style(mode, solid, grad_start, grad_end, angle)

_DIMENSION_LIVE_FIELDS: tuple[dict[str, Any], ...] = (
    {
        "session_key": "H",
        "label": "Height (mm)",
        "min": 60.0,
        "max": 280.0,
        "step": 5.0,
        "default": 120.0,
        "param_key": "H",
        "param_scale": 1.0,
        "group": "Dimensions",
    },
    {
        "session_key": "top_od",
        "label": "Top OD (mm)",
        "min": 60.0,
        "max": 280.0,
        "step": 5.0,
        "default": 140.0,
        "param_key": "Rt",
        "param_scale": 0.5,
        "group": "Dimensions",
    },
    {
        "session_key": "bottom_od",
        "label": "Bottom OD (mm)",
        "min": 40.0,
        "max": 220.0,
        "step": 5.0,
        "default": 90.0,
        "param_key": "Rb",
        "param_scale": 0.5,
        "group": "Dimensions",
    },
    {
        "session_key": "t_wall",
        "label": "Wall thickness (mm)",
        "min": 1.2,
        "max": 12.0,
        "step": 0.2,
        "default": 3.0,
        "param_key": "t_wall",
        "param_scale": 1.0,
        "group": "Dimensions",
    },
    {
        "session_key": "t_bottom",
        "label": "Bottom slab (mm)",
        "min": 1.5,
        "max": 16.0,
        "step": 0.5,
        "default": 3.0,
        "param_key": "t_bottom",
        "param_scale": 1.0,
        "group": "Dimensions",
    },
    {
        "session_key": "r_drain",
        "label": "Drain hole (mm)",
        "min": 3.0,
        "max": 30.0,
        "step": 0.5,
        "default": 10.0,
        "param_key": "r_drain",
        "param_scale": 1.0,
        "group": "Dimensions",
    },
    {
        "session_key": "expn",
        "label": "Flare exponent",
        "min": 0.6,
        "max": 1.8,
        "step": 0.05,
        "default": 1.1,
        "param_key": "expn",
        "param_scale": 1.0,
        "group": "Dimensions",
    },
)

_TWIST_LIVE_FIELDS: tuple[dict[str, Any], ...] = (
    {
        "session_suffix": "spin_turns",
        "label": "Twist turns",
        "min": -3.0,
        "max": 3.0,
        "step": 0.05,
        "default": 0.0,
        "param_key": "spin_turns",
        "param_scale": 1.0,
        "group": "Twist / Spin",
    },
    {
        "session_suffix": "spin_phase_deg",
        "label": "Twist phase (deg)",
        "min": -180.0,
        "max": 180.0,
        "step": 1.0,
        "default": 0.0,
        "param_key": "spin_phase",
        "param_scale": math.pi / 180.0,
        "group": "Twist / Spin",
    },
    {
        "session_suffix": "spin_curve_exp",
        "label": "Twist curve exponent",
        "min": 0.1,
        "max": 3.5,
        "step": 0.05,
        "default": 1.0,
        "param_key": "spin_curve",
        "param_scale": 1.0,
        "group": "Twist / Spin",
    },
)

_STYLE_PARAM_FIELD_MAP: dict[str, tuple[dict[str, Any], ...]] = {
    "HarmonicRipple": (
        {"key": "hr_petals", "index": 0},
        {"key": "hr_petal_amp", "index": 1},
        {"key": "hr_petal_phase_deg", "index": 2, "scale": math.pi / 180.0},
        {"key": "hr_petal_zgain", "index": 3},
        {"key": "hr_ripple_freq", "index": 4},
        {"key": "hr_ripple_amp", "index": 5},
        {"key": "hr_ripple_phase_deg", "index": 6, "scale": math.pi / 180.0},
        {"key": "hr_ripple_zgain", "index": 7},
        {"key": "hr_bell", "index": 8},
    ),
    "SpiralRidges": (
        {"key": "spiral_k", "index": 0},
        {"key": "spiral_turns", "index": 1},
        {"key": "spiral_amp_min", "index": 2},
        {"key": "spiral_amp_max", "index": 3},
        {"key": "spiral_amp_curve", "index": 4},
        {"key": "spiral_groove_amp", "index": 5},
        {"key": "spiral_groove_mult", "index": 6},
        {"key": "spiral_phase_mult", "index": 7},
    ),
    "SuperellipseMorph": (
        {"key": "se_m_base", "index": 0},
        {"key": "se_m_top", "index": 1},
        {"key": "se_m_curve_exp", "index": 2},
        {"key": "se_c4_amp", "index": 3},
        {"key": "se_c4_phase_deg", "index": 4, "scale": math.pi / 180.0},
        {"key": "se_c8_amp", "index": 5},
        {"key": "se_c8_phase_deg", "index": 6, "scale": math.pi / 180.0},
    ),
    "SuperformulaBlossom": (
        {"key": "sf_m_base", "index": 0},
        {"key": "sf_m_top", "index": 1},
        {"key": "sf_m_curve_exp", "index": 2},
        {"key": "sf_n1", "index": 3},
        {"key": "sf_n1_top", "index": 4},
        {"key": "sf_n2", "index": 5},
        {"key": "sf_n2_top", "index": 6},
        {"key": "sf_n3", "index": 7},
        {"key": "sf_n3_top", "index": 8},
        {"key": "sf_a", "index": 9},
        {"key": "sf_b", "index": 10},
    ),
    "FourierBloom": (
        {"key": "fb_base_cos8_amp", "index": 0},
        {"key": "fb_base_cos8_phase", "index": 1},
        {"key": "fb_base_sin4_amp", "index": 2},
        {"key": "fb_base_sin4_phase", "index": 3},
        {"key": "fb_base_cos12_amp", "index": 4},
        {"key": "fb_base_cos12_phase", "index": 5},
        {"key": "fb_top_cos11_amp", "index": 6},
        {"key": "fb_top_cos11_phase", "index": 7},
        {"key": "fb_top_sin7_amp", "index": 8},
        {"key": "fb_top_sin7_phase", "index": 9},
        {"key": "fb_top_cos22_amp", "index": 10},
        {"key": "fb_top_cos22_phase", "index": 11},
        {"key": "fb_wobble_amp", "index": 12},
        {"key": "fb_wobble_freq", "index": 13},
        {"key": "fb_wobble_zgain", "index": 14},
        {"key": "fb_strength", "index": 15},
    ),
}


def _extract_preview_live_values(ss: dict[str, Any]) -> dict[str, float]:
    """Return the latest uncommitted slider values emitted by the WebGPU component."""
    values: dict[str, float] = {}
    preview_map = ss.get("_webgpu_live_controls_preview_map")
    if isinstance(preview_map, dict):
        for session_key, entry in preview_map.items():
            if not isinstance(entry, dict):
                continue
            value = entry.get("value")
            if isinstance(session_key, str) and isinstance(value, (int, float)):
                values[session_key] = float(value)
        if values:
            return values

    # Backward compatibility: fall back to the legacy list snapshot if needed.
    legacy_preview = ss.get("_webgpu_live_controls_preview")
    if not isinstance(legacy_preview, dict):
        return values
    fields = legacy_preview.get("fields")
    if not isinstance(fields, list):
        return values
    for entry in fields:
        if not isinstance(entry, dict):
            continue
        session_key = entry.get("sessionKey")
        value = entry.get("value")
        if isinstance(session_key, str) and isinstance(value, (int, float)):
            values[session_key] = float(value)
    return values


def _append_style_live_fields(
    fields: list[dict[str, Any]],
    ss: dict[str, Any],
    style_name: str,
    preview_values: dict[str, float],
) -> None:
    style_schema = SC.get_style_schemas().get(style_name, {})
    mapping = _STYLE_PARAM_FIELD_MAP.get(style_name)
    if not mapping:
        return
    group_label = f"{style_name} style"
    for spec in mapping:
        meta = style_schema.get(spec["key"], {})
        if not isinstance(meta, dict):
            continue
        control_type = str(meta.get("type", "float")).lower()
        if control_type not in {"float", "int"}:
            continue
        session_key = widget_key(style_name, spec["key"])
        default_val = meta.get("default", 0.0)
        if session_key in preview_values:
            raw_value = preview_values[session_key]
        else:
            raw_value = ss.get(session_key, default_val)
        try:
            value = float(raw_value)
        except Exception:
            try:
                value = float(default_val)
            except Exception:
                value = 0.0
        v_min = float(meta.get("min", value - 1.0)) if meta.get("min") is not None else value - 1.0
        v_max = float(meta.get("max", value + 1.0)) if meta.get("max") is not None else value + 1.0
        step = float(meta.get("step", 0.1))
        fields.append(
            {
                "id": session_key,
                "sessionKey": session_key,
                "label": meta.get("label", spec["key"]),
                "min": v_min,
                "max": v_max,
                "step": step,
                "value": preview_values.get(session_key, value),
                "group": group_label,
                "styleParamIndex": int(spec["index"]),
                "styleParamScale": float(spec.get("scale", 1.0)),
            },
        )


def _build_live_controls_spec(ss: dict[str, Any], style_name: str, *, enabled: bool = True) -> dict[str, Any]:
    preview_values = _extract_preview_live_values(ss)
    fields: list[dict[str, Any]] = []
    for spec in _DIMENSION_LIVE_FIELDS:
        default_val = spec.get("default", spec["min"])
        session_key = spec["session_key"]
        if session_key in preview_values:
            raw_value = preview_values[session_key]
        else:
            raw_value = ss.get(session_key, default_val)
        try:
            value = float(raw_value)
        except Exception:
            value = float(default_val)
        fields.append(
            {
                "id": session_key,
                "sessionKey": session_key,
                "label": spec["label"],
                "min": float(spec["min"]),
                "max": float(spec["max"]),
                "step": float(spec["step"]),
                "value": value,
                "paramKey": spec.get("param_key"),
                "paramScale": spec.get("param_scale", 1.0),
                "group": spec.get("group", "Dimensions"),
            },
        )

    for spec in _TWIST_LIVE_FIELDS:
        session_key = widget_key(style_name, spec["session_suffix"])
        default_val = spec.get("default", spec["min"])
        if session_key in preview_values:
            raw_value = preview_values[session_key]
        else:
            raw_value = ss.get(session_key, default_val)
        try:
            value = float(raw_value)
        except Exception:
            value = float(default_val)
        fields.append(
            {
                "id": session_key,
                "sessionKey": session_key,
                "label": spec["label"],
                "min": float(spec["min"]),
                "max": float(spec["max"]),
                "step": float(spec["step"]),
                "value": value,
                "paramKey": spec.get("param_key"),
                "paramScale": spec.get("param_scale", 1.0),
                "group": spec.get("group", "Twist / Spin"),
            },
        )

    _append_style_live_fields(fields, ss, style_name, preview_values)

    return {
        "enabled": bool(enabled),
        "style": style_name,
        "fields": fields,
    }


def _wgpu_debug_enabled() -> bool:
    value = os.environ.get(_WGPU_DEBUG_ENV, "").strip().lower()
    return value in {"1", "true", "yes", "on"}


def _estimate_scene_bounds(
    vertices: Any | None,
    *,
    fallback_radius: float,
    min_padding: float = 1.2,
) -> tuple[float, float]:
    """Return (scene_radius, scene_padding) derived from mesh vertices when available."""
    radius = max(1.0, float(fallback_radius))
    padding = max(1.0, float(min_padding))
    if vertices is None:
        return radius, padding

    try:
        verts = np.asarray(vertices, dtype=np.float64)
    except Exception:
        return radius, padding

    if verts.ndim < 2 or verts.shape[0] == 0 or verts.shape[1] < 3:
        return radius, padding

    try:
        xy_sq = np.square(verts[:, 0]) + np.square(verts[:, 1])
        radial_xy = float(np.max(np.sqrt(xy_sq))) if xy_sq.size else 0.0
        z_vals = verts[:, 2]
        z_min = float(np.min(z_vals)) if z_vals.size else 0.0
        z_max = float(np.max(z_vals)) if z_vals.size else 0.0
        z_center = 0.5 * (z_min + z_max)
        radial_3d = np.sqrt(xy_sq + np.square(z_vals - z_center)) if xy_sq.size else np.array([0.0])
        sphere_radius = float(np.max(radial_3d))
        if np.isfinite(sphere_radius) and sphere_radius > 0.0:
            radius = max(radius, sphere_radius)
        else:
            axial_half = max(abs(z_max - z_min) * 0.5, 0.0)
            radius = max(radius, radial_xy, axial_half)

        bbox_major = max(radial_xy, abs(z_max - z_min) * 0.5, 1.0)
        coverage = bbox_major / max(radius, 1e-3)
        padding = max(min_padding, min(1.4, 1.05 + coverage * 0.35))
    except Exception:
        radius = max(radius, 1.0)
    return radius, padding

# Import extracted preview modules
try:
    from .preview.array_generation import generate_preview_arrays
    from .preview.cache_management import initialize_preview_cache
    from .preview.cached_display import display_cached_preview
    from .preview.camera_capture import inject_camera_capture, render_camera_controls
    from .preview.mesh_building import build_preview_mesh
    from .preview.parameter_extraction import (
        extract_preview_parameters,
        get_preview_resolution,
    )
    from .preview.plotly_mesh import render_full_preview_mesh
    from .preview.plotly_surface import render_quick_preview_surface
    from .preview.png_rendering import render_preview_png_fallback
    from .preview.pyvista_renderer import render_pyvista_full_preview
    from .preview.signatures import compute_preview_signatures
    from .preview.style_setup import setup_preview_style
    from .preview.update_decision import should_update_preview_ui
    from .preview.utils import to_float_scalar as _to_float_scalar
    from .preview.utils import to_int_scalar as _to_int_scalar
    MODULES_AVAILABLE = True
except ImportError:
    # Minimal fallback for testing
    MODULES_AVAILABLE = False
    def extract_preview_parameters(ss): return None
    def get_preview_resolution(*args): return (84, 42, 168, 84)
    def setup_preview_style(*args): return None
    def initialize_preview_cache(ss): pass
    def _to_float_scalar(x): return float(x) if x else 0.0
    def _to_int_scalar(x): return int(float(x)) if x else 0
    def should_update_preview_ui(*args): return (True, None)
    def compute_preview_signatures(*args): return (None, None)
    def generate_preview_arrays(*args): return (None, None, None, 0.0)
    def build_preview_mesh(*args): return (None, False)
    def render_quick_preview_surface(*args): pass
    def render_full_preview_mesh(*args): pass
    def render_preview_png_fallback(*args): return None
    def display_cached_preview(*args): pass
    def inject_camera_capture(): pass
    def render_camera_controls(): pass

# Check if Plotly is available
try:
    import plotly  # noqa: F401 - import to verify availability
    HAS_PLOTLY = True
except ImportError:
    HAS_PLOTLY = False

# Check if PyVista is available - use the vetted flags from pyvista_renderer
# which properly check for both pyvista import AND OpenGL runtime context
try:
    from .preview.pyvista_renderer import (
        has_pyvista as _has_pyvista_import,
        has_stpyvista as _has_stpyvista_import,
        has_pyvista_runtime_ok as _has_pyvista_runtime,
    )
    # PyVista is only truly available if all three conditions are met:
    # 1. pyvista can be imported
    # 2. stpyvista can be imported  
    # 3. OpenGL context can be created
    HAS_PYVISTA = _has_pyvista_import and _has_stpyvista_import and _has_pyvista_runtime
except ImportError:
    HAS_PYVISTA = False


def _cleanup_renderer_state(old_renderer: str | None, new_renderer: str, ss: dict[str, Any]) -> None:
    """Clean up stale state when switching between preview renderers.
    
    This function prevents state pollution by clearing renderer-specific
    session state keys when the user changes the renderer selection.
    
    Args:
        old_renderer: Previously active renderer (or None if first render)
        new_renderer: Newly selected renderer
        ss: Session state dictionary
    """
    if old_renderer == new_renderer:
        return
    
    # Clear PyVista-specific state
    if old_renderer == "PyVista":
        keys_to_clear = [
            "_pyvista_camera",
            "_pyvista_mesh_cache",
            "_pyvista_colors_cache",
            "_pyvista_full_done",
            "_pyvista_html_cache",  # Clear cached HTML export
        ]
        for key in keys_to_clear:
            ss.pop(key, None)
        # Close any cached plotters
        for key in list(ss.keys()):
            if key.startswith("_pyvista_plotter_"):
                try:
                    old = ss.get(key)
                    if old is not None:
                        old.close()
                except Exception:
                    pass
                ss.pop(key, None)
    
    # Clear WebGPU-specific state
    if old_renderer == "WebGPU":
        keys_to_clear = [
            "_webgpu_last_render",
            "_webgpu_ready_logged",
            "_webgpu_component_seen",
        ]
        for key in keys_to_clear:
            ss.pop(key, None)
    
    # Clear WebGPU blocking state when switching TO WebGPU
    if new_renderer == "WebGPU":
        try:
            from .preview.webgpu_renderer import _clear_webgpu_blocking_state
            _clear_webgpu_blocking_state()
        except Exception:
            pass
    
    # Clear PyVista runtime state when switching TO PyVista to force fresh context check
    if new_renderer == "PyVista":
        # Remove cached runtime flag so PyVista will re-probe OpenGL context
        ss.pop("_pyvista_runtime_ok", None)
        # Clear any cached mesh/color state
        ss.pop("_pyvista_mesh_cache", None)
        ss.pop("_pyvista_colors_cache", None)
        ss.pop("_pyvista_full_done", None)
    
    # Clear cached Plotly figures (they may have stale appearance)
    ss.pop("_last_mesh_fig_json", None)
    ss.pop("_last_surface_fig_json", None)
    
    # Mark preview as stale to force regeneration with new renderer
    ss["_preview_stale"] = True


def render_preview_section(preview_mode: str) -> None:
    """Render the complete preview section with full modular architecture.
    
    This is a pure orchestrator that delegates all work to specialized modules.
    It handles coordination, error handling, and fallbacks only.
    
    Args:
        preview_mode: One of "auto", "manual", or "debounced"

    """
    st = get_st()
    st.subheader("Preview")
    ss = cast("dict[str, Any]", st.session_state)

    # Show camera controls info
    render_camera_controls()

    # ==================== MODULE 1: PARAMETER EXTRACTION ====================
    params = extract_preview_parameters(ss)
    if not params:
        st.error("Failed to extract parameters")
        return

    # ==================== MODULE 2: STYLE SETUP ====================
    # Calculate resolutions first
    preview_n_theta, preview_n_z, full_n_theta, full_n_z = get_preview_resolution(
        params, ss, _to_float_scalar,
    )

    # Setup style configuration
    style_config = setup_preview_style(
        params.style_name, params.ui_opts,
        preview_n_theta, preview_n_z,
        full_n_theta, full_n_z,
    )
    if not style_config:
        st.error("Failed to setup style")
        return

    # Quick style function radial sample (first ring) for debug visibility
    try:
        import numpy as _np_dbg
        th_sample = _np_dbg.linspace(0.0, 2.0 * _np_dbg.pi, num=16, endpoint=False)
        # Use base radius mid-height for comparison
        z_mid = float(params.H) * 0.5
        # Provide minimal base radius reference (Rb + flare fraction)
        r_base_mid = float(params.Rb + (params.Rt - params.Rb) * (z_mid / max(params.H, 1e-6))**params.expn)
        r_mod = style_config.r_outer_fn(th_sample, z_mid, params.H, params.Rb, style_config.opts)
        r_arr = _np_dbg.asarray(r_mod, dtype=float)
        # Store compact stats in session for debug panel
        st.session_state["_style_radius_sample"] = {
            "style": params.style_name,
            "r_base_mid": r_base_mid,
            "r_min": float(r_arr.min()) if r_arr.size else 0.0,
            "r_max": float(r_arr.max()) if r_arr.size else 0.0,
            "r_span": float(r_arr.max() - r_arr.min()) if r_arr.size else 0.0,
        }
    except Exception:
        st.session_state["_style_radius_sample"] = {"style": params.style_name, "error": True}

    # ==================== MODULE 3: CACHE INITIALIZATION ====================
    initialize_preview_cache(ss)

    # Early placeholders for cached display
    preview_placeholder = st.empty()
    mesh_placeholder = st.empty()

    # ==================== MODULE 4: UPDATE DECISION ====================
    should_update_preview, _ = should_update_preview_ui(preview_mode, ss)

    # ==================== MODULE 5: SIGNATURE COMPUTATION ====================
    geom_sig, app_sig = compute_preview_signatures(
        params.H, params.Rt, params.Rb, params.expn,
        preview_n_theta, preview_n_z,
        full_n_theta, full_n_z,
        params.style_name, style_config.opts_json, ss,
        params.show_inner, params.view_elev, params.view_azim,
        params.fig_w, params.fig_h, params.dpi, params.place_on_ground,
    )

    # Compare with last signatures
    last_geom_sig = cast("tuple | None", ss.get("_last_preview_geom_sig"))
    _last_app_sig = cast("tuple | None", ss.get("_last_preview_app_sig"))
    geom_changed = (geom_sig is None) or (geom_sig != last_geom_sig)

    # One-shot suppression for non-model reruns
    if bool(cast("bool | None", ss.get("_suppress_preview_once", False))):
        should_update_preview = False
        ss["_suppress_preview_once"] = False

    # Centralized regeneration decision
    if should_update_preview:
        try:
            from pfui.app_components.plotting import should_regenerate
            debounce_timeout_seconds = _to_float_scalar(ss.get("debounce_timeout_seconds", 2.0))

            cached_any = any([
                cast("bytes | None", ss.get("_last_surface_png")),
                cast("dict | None", ss.get("_last_surface_fig_json")),
                cast("bytes | None", ss.get("_last_mesh_png")),
                cast("dict | None", ss.get("_last_mesh_fig_json")),
            ])

            should_update_preview = should_regenerate(
                geom_sig, app_sig,
                last_geom_sig=cast("tuple | None", ss.get("_last_preview_geom_sig")),
                last_app_sig=cast("tuple | None", ss.get("_last_preview_app_sig")),
                preview_mode=cast("str", ss.get("preview_mode", preview_mode)),
                preview_stale=bool(cast("bool | None", ss.get("_preview_stale", False))),
                cached_any=bool(cached_any),
                last_change_ts=cast("Any", ss.get("_last_change_ts", 0.0)),
                debounce_timeout_s=debounce_timeout_seconds,
            )
        except Exception:
            pass

    # ==================== MODULES 6-8: PREVIEW GENERATION ====================
    preview_exists = False
    png_bytes = None

    if should_update_preview:
        t0_total = time.time()
        try:
            with st.spinner("Computing preview…"):
                # MODULE 6: Array generation
                X, Y, Z, t_arrays = generate_preview_arrays(
                    params.H, params.Rt, params.Rb, params.expn,
                    preview_n_theta, preview_n_z,
                    full_n_theta, full_n_z,
                    params.style_name, style_config.opts_json,
                    geom_changed, preview_mode, ss,
                    geom_sig, app_sig,
                    _to_float_scalar(ss.get("debounce_timeout_seconds", 2.0)),
                    params.interactive_mesh,
                )

                # MODULE 7: Mesh building
                mesh_data, _ = build_preview_mesh(
                    params.H, params.Rt, params.Rb, params.expn,
                    preview_n_theta, preview_n_z,
                    full_n_theta, full_n_z,
                    params.style_name, style_config.opts_json,
                    params.t_wall, params.t_bottom, params.r_drain,
                    style_config.r_outer_fn, style_config.opts,
                    geom_changed, params.interactive_mesh,
                    preview_mode, ss,
                    geom_sig, app_sig,
                    _to_float_scalar(ss.get("debounce_timeout_seconds", 2.0)),
                    params.place_on_ground,
                )

                # MODULE 8: PNG fallback
                png_bytes = render_preview_png_fallback(
                    params.H, params.Rt, params.Rb, params.expn,
                    preview_n_theta, preview_n_z,
                    full_n_theta, full_n_z,
                    params.style_name, style_config.opts_json,
                    params.fig_w, params.fig_h, params.dpi,
                    params.t_wall, params.show_inner,
                    params.place_on_ground,
                    params.view_elev, params.view_azim,
                    params.interactive_mesh,
                    HAS_PLOTLY, ss, _to_int_scalar,
                )

                # Clear stale flag in auto mode
                if preview_mode == "auto":
                    ss["_preview_stale"] = False
                preview_exists = True

        except Exception as e:
            preview_exists = False
            st.error(f"Preview generation failed: {e}")
        finally:
            # Performance logging
            try:
                if preview_exists:
                    ss.setdefault("_perf_logs", []).append(
                        f"total:{(time.time() - t0_total) * 1000:.1f}ms",
                    )
                    ss["_perf_logs"] = ss["_perf_logs"][-40:]
            except Exception:
                pass

            # Remember signatures
            try:
                if preview_exists and geom_sig and app_sig:
                    ss["_last_preview_geom_sig"] = geom_sig
                    ss["_last_preview_app_sig"] = app_sig
            except Exception:
                pass

    # ==================== MODULE 9: CACHED DISPLAY ====================
    if not should_update_preview:
        display_cached_preview(
            preview_mode, params.interactive_mesh,
            HAS_PLOTLY, ss,
            mesh_placeholder, preview_placeholder,
        )

    # ==================== MODULE 10: QUICK PREVIEW RENDERING ====================
    if should_update_preview:
        render_quick_preview_surface(
            X if preview_exists else None,
            Y if preview_exists else None,
            Z if preview_exists else None,
            preview_n_theta, preview_n_z,
            params.fig_h, params.place_on_ground, ss,
            preview_placeholder,
            _to_float_scalar, _to_int_scalar,
        )

        # Cache PNG
        try:
            if png_bytes:
                if params.interactive_mesh:
                    ss["_last_mesh_png"] = png_bytes
                else:
                    ss["_last_surface_png"] = png_bytes
                ss["_preview_stale"] = False
        except Exception:
            pass

    # ==================== MODULE 11: FULL PREVIEW RENDERING ====================
    _use_pyvista = bool(ss.get("use_pyvista_renderer", HAS_PYVISTA))
    user_renderer = ss.get("renderer", None)
    if user_renderer is None:
        renderer_choice = "PyVista" if HAS_PYVISTA else "Plotly"
    else:
        renderer_choice = str(user_renderer)
    
    # Handle renderer transitions - cleanup stale state when switching
    previous_renderer = ss.get("_active_renderer")
    if previous_renderer and previous_renderer != renderer_choice:
        _cleanup_renderer_state(previous_renderer, renderer_choice, ss)

    live_mode = False
    live_controls_spec: dict[str, Any] | None = None
    if renderer_choice == "WebGPU":
        live_mode = bool(ss.get("webgpu_live_controls", False))
        live_controls_spec = _build_live_controls_spec(ss, params.style_name, enabled=live_mode)

    if should_update_preview and params.interactive_mesh:
        if renderer_choice == "WebGPU":
            try:
                # Defer heavy renderer import until after quick checks
                if mesh_data is not None:
                    Vwg, Fwg = mesh_data
                else:
                    # Build a mesh if not present (preview resolution for speed)
                    from pfui.imports import build_pot_mesh as _bm
                    Vwg, Fwg, _ = _bm(
                        H=params.H, Rt=params.Rt, Rb=params.Rb,
                        t_wall=params.t_wall, t_bottom=params.t_bottom,
                        r_drain=params.r_drain, expn=params.expn,
                        n_theta=params.n_theta, n_z=params.n_z,
                        r_outer_fn=style_config.r_outer_fn,
                        style_opts=style_config.opts,
                    )
                # Safety: avoid attempting WebGPU upload for extremely large meshes
                # which can hang the server during base64 encoding/transport. Allow
                # LOD system fully disabled - WebGPU handles 1M+ triangles at 120FPS
                n_faces = int(Fwg.shape[0]) if Fwg is not None else 0
                ss.setdefault("webgpu_live_controls", False)

                from .preview.webgpu_renderer import render_webgpu_preview as _webgpu
                # WebGPU-specific lightweight controls (camera + zoom)
                # Initialize defaults
                ss.setdefault("webgpu_auto_rotate", False)
                ss.setdefault("webgpu_rotX", 0.35)
                ss.setdefault("webgpu_rotY", 0.0)
                ss.setdefault("webgpu_zoom", 1.0)
                ss.setdefault("webgpu_panX", 0.0)
                ss.setdefault("webgpu_panY", 0.0)
                ss.setdefault("webgpu_camera_nonce", 0)

                c_w1, c_w3 = st.columns([1.2, 1.0])
                with c_w1:
                    st.checkbox(
                        "Auto-rotate",
                        value=bool(ss.get("webgpu_auto_rotate", False)),
                        key="webgpu_auto_rotate",
                        help="Rotate slowly around the pot.",
                    )
                with c_w3:
                    if st.button("Reset view", help="Reset orbit and zoom"):
                        ss["webgpu_rotX"] = 0.35
                        ss["webgpu_rotY"] = 0.0
                        ss["webgpu_zoom"] = 1.0
                        ss["webgpu_panX"] = 0.0
                        ss["webgpu_panY"] = 0.0
                        ss["webgpu_camera_nonce"] = int(ss.get("webgpu_camera_nonce", 0)) + 1

                # Gradient colors (3-stop)
                grad = (
                    ss.get("preview_grad_c1", "#1149FF"),
                    ss.get("preview_grad_c2", "#8801DE"),
                    ss.get("preview_grad_c3", "#124FA0"),
                )

                # Map twist and superformula params from UI/style opts
                try:
                    from pfui.state import widget_key as _wk

                    spin_turns = float(ss.get(_wk(params.style_name, "spin_turns"), 0.0) or 0.0)
                    spin_phase_deg = float(ss.get(_wk(params.style_name, "spin_phase_deg"), 0.0) or 0.0)
                    spin_phase = float(math.radians(spin_phase_deg))
                    spin_curve = float(ss.get(_wk(params.style_name, "spin_curve_exp"), 1.0) or 1.0)
                except Exception:
                    spin_turns, spin_phase, spin_curve = 0.0, 0.0, 1.0

                # Pull superformula-related options from style configuration when present
                try:
                    _opts = dict(style_config.opts)
                except Exception:
                    _opts = {}

                try:
                    sf_m_base = float(_opts.get("sf_m_base", 6.0))
                    sf_m_top = float(_opts.get("sf_m_top", sf_m_base))
                    sf_n1 = float(_opts.get("sf_n1", 0.35))
                    sf_n2 = float(_opts.get("sf_n2", 0.8))
                    sf_n3 = float(_opts.get("sf_n3", 0.8))
                except Exception:
                    sf_m_base, sf_m_top, sf_n1, sf_n2, sf_n3 = 6.0, 10.0, 0.35, 0.8, 0.8

                try:
                    style_id, style_param_block = build_style_param_payload(
                        params.style_name,
                        _opts,
                    )
                except Exception:
                    style_id, style_param_block = 0, [0.0] * STYLE_PARAM_CAPACITY

                # Assemble parameter payload for the WebGPU core
                # Ensure sane draw density on UI-only changes
                _nT = int(params.n_theta) if int(params.n_theta or 0) > 0 else 64
                _nZ = int(params.n_z) if int(params.n_z or 0) > 0 else 32

                bottom_rings = max(2, min(24, int(math.ceil(_nZ * 0.25))))
                rim_rings = max(1, min(8, int(math.ceil(_nZ * 0.1))))

                base_radius = float(max(params.Rt, params.Rb, 1.0))
                half_height = max(float(params.H) * 0.5, 1.0)
                fallback_radius = math.sqrt(base_radius * base_radius + half_height * half_height)
                scene_radius, scene_padding = _estimate_scene_bounds(
                    Vwg,
                    fallback_radius=fallback_radius,
                    min_padding=1.2,
                )

                # LOD fully disabled - WebGPU handles 1M+ triangles at 120FPS without issues

                param_nonce = int(ss.get("_param_update_nonce", 0)) + 1
                ss["_param_update_nonce"] = param_nonce

                camera_state = get_webgpu_camera_snapshot(ss)

                background_style, background_rgba, background_mode = _compute_background_theme(ss)

                wgpu_params = {
                    "H": float(params.H),
                    "Rt": float(params.Rt),
                    "Rb": float(params.Rb),
                    "expn": float(params.expn),
                    "nTheta": _nT,
                    "nZ": _nZ,
                    # Twist
                    "spin_turns": spin_turns,
                    "spin_phase": spin_phase,
                    "spin_curve": spin_curve,
                    # Superformula
                    "sf_m_base": sf_m_base,
                    "sf_m_top": sf_m_top,
                    "sf_n1": sf_n1,
                    "sf_n2": sf_n2,
                    "sf_n3": sf_n3,
                    # Lighting params from Appearance settings
                    "ambient": float(ss.get("mesh_ambient", 0.0)),
                    "diffuse": float(ss.get("mesh_diffuse", 0.0)),
                    "specular": float(ss.get("mesh_specular", 0.40)),
                    "roughness": float(ss.get("mesh_roughness", 0.45)),
                    "fresnel": float(ss.get("mesh_fresnel", 0.25)),
                    # Thickness + segment hints
                    "t_wall": float(params.t_wall),
                    "t_bottom": float(params.t_bottom),
                    "r_drain": float(params.r_drain),
                    "drain": float(params.r_drain),
                    "innerSegments": _nZ,
                    "bottom_rings": bottom_rings,
                    "rim_rings": rim_rings,
                    "styleId": style_id,
                    "styleParams": style_param_block,
                    "sceneRadius": scene_radius,
                    "scenePadding": scene_padding,
                    "interactiveLod": 1.0,  # LOD disabled - always full resolution
                    "interactiveLodEnabled": False,  # LOD disabled
                    "paramUpdate": True,
                    "paramUpdateNonce": param_nonce,
                }
                wgpu_params["__pf_bg_rgba"] = background_rgba
                wgpu_params["__pf_bg_mode"] = background_mode
                wgpu_params.update(camera_state)
                with mesh_placeholder.container():
                    if _wgpu_debug_enabled() and live_controls_spec is not None:
                        st.json({"webgpu_live_controls": live_controls_spec})
                    _webgpu(
                        Vwg,
                        Fwg,
                        params=wgpu_params,
                        height_px=int(max(360, min(1600, params.fig_h * 100))),
                        background_color=background_style,
                        background_rgba=background_rgba,
                        background_mode=background_mode,
                        gradient=grad,
                        widget_key="webgpu_full_preview",
                        canvas_id="wgpu-canvas",
                        live_controls=live_controls_spec,
                    )
                    st.caption(
                        f"WebGPU Preview • {len(Vwg):,} verts • {len(Fwg):,} triangles (shader gradient)",
                    )
                    
                    # CRITICAL: Clear quick preview placeholder now that WebGPU is rendered
                    try:
                        if preview_placeholder is not None:
                            preview_placeholder.empty()
                    except Exception:
                        pass
                    
                    try:
                        cached_params = dict(wgpu_params)
                        cached_params["paramUpdate"] = False
                        cached_params.pop("paramUpdateNonce", None)
                        ss["_webgpu_last_render"] = {
                            "params": cached_params,
                            "height_px": int(max(360, min(1600, params.fig_h * 100))),
                            "background_color": background_style,
                            "background_rgba": background_rgba,
                            "background_mode": background_mode,
                            "gradient": grad,
                            "widget_key": "webgpu_full_preview",
                            "canvas_id": "wgpu-canvas",
                            "caption": (
                                f"WebGPU Preview • {len(Vwg):,} verts • {len(Fwg):,} triangles (shader gradient)"
                            ),
                            "camera_signature": webgpu_camera_signature(camera_state),
                        }
                        ss["_active_renderer"] = "WebGPU"
                    except Exception:
                        pass

            except Exception as e_wgpu:
                st.warning(f"WebGPU renderer failed: {e_wgpu}; falling back to PyVista/Plotly")
                renderer_choice = "PyVista" if HAS_PYVISTA else "Plotly"

    if renderer_choice == "WebGPU" and not (should_update_preview and params.interactive_mesh):
        cached = ss.get("_webgpu_last_render")
        if isinstance(cached, dict):
            try:
                from .preview.webgpu_renderer import (
                    render_webgpu_preview as _webgpu_cached,
                )
            except Exception:
                cached = None
            else:
                cached_params = dict(cached.get("params") or {})
                camera_state = get_webgpu_camera_snapshot(ss)
                cached_signature = tuple(cached.get("camera_signature") or ())
                camera_signature = webgpu_camera_signature(camera_state)
                camera_dirty = camera_signature != cached_signature
                cached_params.update(camera_state)
                cached_params["paramUpdate"] = False
                cached_params.pop("paramUpdateNonce", None)
                fallback_grad = (
                    ss.get("preview_grad_c1", "#1149FF"),
                    ss.get("preview_grad_c2", "#8801DE"),
                    ss.get("preview_grad_c3", "#124FA0"),
                )
                height_px = int(
                    cached.get("height_px")
                    or max(360, min(1600, params.fig_h * 100)),
                )
                background_style, background_rgba, background_mode = _compute_background_theme(ss)
                cached_bg_style = cached.get("background_color")
                if isinstance(cached_bg_style, str):
                    background_style = cached_bg_style
                cached_bg_rgba = cached.get("background_rgba")
                if isinstance(cached_bg_rgba, (list, tuple)) and len(cached_bg_rgba) >= 4:
                    background_rgba = tuple(float(x) for x in cached_bg_rgba[:4])  # type: ignore[assignment]
                cached_bg_mode = cached.get("background_mode")
                if isinstance(cached_bg_mode, str):
                    background_mode = cached_bg_mode
                gradient_cache = cached.get("gradient")
                if isinstance(gradient_cache, (list, tuple)) and len(gradient_cache) >= 3:
                    gradient_tuple = tuple(gradient_cache[:3])  # type: ignore[arg-type]
                else:
                    gradient_tuple = fallback_grad
                widget_key = str(cached.get("widget_key", "webgpu_full_preview"))
                canvas_id = str(cached.get("canvas_id", "wgpu-canvas"))
                if camera_dirty:
                    cached["camera_signature"] = camera_signature
                    try:
                        cached["params"] = dict(cached_params)
                    except Exception:
                        pass
                with mesh_placeholder.container():
                    if _wgpu_debug_enabled() and live_controls_spec is not None:
                        st.json({"webgpu_live_controls": live_controls_spec})
                    _webgpu_cached(
                        None,
                        None,
                        params=cached_params,
                        height_px=height_px,
                        background_color=background_style,
                        background_rgba=background_rgba,
                        background_mode=background_mode,
                        gradient=gradient_tuple,
                        widget_key=widget_key,
                        canvas_id=canvas_id,
                        live_controls=live_controls_spec,
                    )
                    caption_text = cached.get(
                        "caption",
                        f"WebGPU Preview • {int(params.n_theta)} θ • {int(params.n_z)} z (cached)",
                    )
                    if isinstance(caption_text, str):
                        st.caption(caption_text)
                    
                    # CRITICAL: Clear quick preview placeholder for cached WebGPU render
                    try:
                        if preview_placeholder is not None:
                            preview_placeholder.empty()
                    except Exception:
                        pass
                    
                try:
                    ss["_active_renderer"] = "WebGPU"
                except Exception:
                    pass

    # PyVista rendering - aligned with WebGPU guard pattern
    if renderer_choice == "PyVista" and HAS_PYVISTA:
        # Check runtime availability in session state (may have been disabled dynamically)
        pyvista_runtime_ok = bool(ss.get("_pyvista_runtime_ok", HAS_PYVISTA))
        
        if pyvista_runtime_ok:
            # Always render PyVista when selected (it handles its own caching)
            # Unlike WebGPU which has separate fresh/cached paths, PyVista's
            # stpyvista component manages camera state internally
            render_pyvista_full_preview(
                params.H, params.Rt, params.Rb, params.expn,
                params.n_theta, params.n_z,
                params.style_name,
                params.t_wall, params.t_bottom, params.r_drain,
                style_config.r_outer_fn, style_config.opts,
                mesh_data if preview_exists else None,
                params.place_on_ground,
                ss, mesh_placeholder, preview_placeholder,
                _to_float_scalar, _to_int_scalar,
            )
            try:
                ss["_active_renderer"] = "PyVista"
            except Exception:
                pass
        else:
            # PyVista runtime check failed - show error and fall through to Plotly
            st.warning(
                "PyVista OpenGL context unavailable. "
                "Falling back to Plotly renderer. "
                "Try restarting the app or selecting a different renderer."
            )
            # Force fallback to Plotly for this render
            renderer_choice = "Plotly"
    elif renderer_choice == "Plotly":
        render_full_preview_mesh(
            params.H, params.Rt, params.Rb, params.expn,
            preview_n_theta, preview_n_z,
            full_n_theta, full_n_z,
            params.n_theta, params.n_z,
            params.style_name, style_config.opts_json,
            params.t_wall, params.t_bottom, params.r_drain,
            style_config.r_outer_fn, style_config.opts,
            mesh_data if preview_exists else None,
            geom_changed, preview_mode, ss,
            geom_sig, app_sig,
            _to_float_scalar(ss.get("debounce_timeout_seconds", 2.0)),
            params.place_on_ground, params.fig_h,
            mesh_placeholder, preview_placeholder,
            png_bytes,
            _to_float_scalar, _to_int_scalar,
        )
        try:
            ss["_active_renderer"] = "Plotly"
        except Exception:
            pass
