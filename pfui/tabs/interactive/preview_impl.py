"""Preview section orchestrator for Interactive Designer tab.

This module provides a thin orchestration layer that delegates all work
to focused, specialized modules. It contains NO business logic - only
coordination and error handling.
"""

from __future__ import annotations
import time
from typing import Any, Optional, cast

import streamlit as st

# Import extracted preview modules
try:
    from .preview.parameter_extraction import extract_preview_parameters, get_preview_resolution
    from .preview.style_setup import setup_preview_style
    from .preview.cache_management import initialize_preview_cache
    from .preview.utils import to_float_scalar as _to_float_scalar, to_int_scalar as _to_int_scalar
    from .preview.update_decision import should_update_preview_ui
    from .preview.signatures import compute_preview_signatures
    from .preview.array_generation import generate_preview_arrays
    from .preview.mesh_building import build_preview_mesh
    from .preview.plotly_surface import render_quick_preview_surface
    from .preview.plotly_mesh import render_full_preview_mesh
    from .preview.png_rendering import render_preview_png_fallback
    from .preview.cached_display import display_cached_preview
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

# Check if Plotly is available
try:
    import plotly.graph_objects as go
    HAS_PLOTLY = True
except Exception:
    HAS_PLOTLY = False


def render_preview_section(preview_mode: str) -> None:
    """Render the complete preview section with full modular architecture.
    
    This is a pure orchestrator that delegates all work to specialized modules.
    It handles coordination, error handling, and fallbacks only.
    
    Args:
        preview_mode: One of "auto", "manual", or "debounced"
    """
    st.subheader("Preview")
    ss = cast(dict[str, Any], st.session_state)
    
    # ==================== MODULE 1: PARAMETER EXTRACTION ====================
    params = extract_preview_parameters(ss)
    if not params:
        st.error("Failed to extract parameters")
        return
    
    # ==================== MODULE 2: STYLE SETUP ====================
    # Calculate resolutions first
    preview_n_theta, preview_n_z, full_n_theta, full_n_z = get_preview_resolution(
        params, ss, _to_float_scalar
    )
    
    # Setup style configuration
    style_config = setup_preview_style(
        params.style_name, params.ui_opts,
        preview_n_theta, preview_n_z,
        full_n_theta, full_n_z
    )
    if not style_config:
        st.error("Failed to setup style")
        return
    
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
        params.fig_w, params.fig_h, params.dpi, params.place_on_ground
    )
    
    # Compare with last signatures
    last_geom_sig = cast(Optional[tuple], ss.get("_last_preview_geom_sig"))
    last_app_sig = cast(Optional[tuple], ss.get("_last_preview_app_sig"))
    geom_changed = (geom_sig is None) or (geom_sig != last_geom_sig)
    
    # One-shot suppression for non-model reruns
    if bool(cast(Optional[bool], ss.get("_suppress_preview_once", False))):
        should_update_preview = False
        ss["_suppress_preview_once"] = False
    
    # Centralized regeneration decision
    if should_update_preview:
        try:
            from pfui.app_components.plotting import should_regenerate
            debounce_timeout_seconds = _to_float_scalar(ss.get("debounce_timeout_seconds", 2.0))
            
            cached_any = any([
                cast(Optional[bytes], ss.get("_last_surface_png")),
                cast(Optional[dict], ss.get("_last_surface_fig_json")),
                cast(Optional[bytes], ss.get("_last_mesh_png")),
                cast(Optional[dict], ss.get("_last_mesh_fig_json")),
            ])
            
            should_update_preview = should_regenerate(
                geom_sig, app_sig,
                last_geom_sig=cast(Optional[tuple], ss.get("_last_preview_geom_sig")),
                last_app_sig=cast(Optional[tuple], ss.get("_last_preview_app_sig")),
                preview_mode=cast(str, ss.get("preview_mode", preview_mode)),
                preview_stale=bool(cast(Optional[bool], ss.get("_preview_stale", False))),
                cached_any=bool(cached_any),
                last_change_ts=cast(Any, ss.get("_last_change_ts", 0.0)),
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
                    params.interactive_mesh
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
                    params.place_on_ground
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
                    HAS_PLOTLY, ss, _to_int_scalar
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
                        f"total:{(time.time() - t0_total) * 1000:.1f}ms"
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
            mesh_placeholder, preview_placeholder
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
            _to_float_scalar, _to_int_scalar
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
    if should_update_preview and params.interactive_mesh:
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
            _to_float_scalar, _to_int_scalar
        )
