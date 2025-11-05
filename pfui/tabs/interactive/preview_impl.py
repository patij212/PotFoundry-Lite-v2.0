"""Preview section for Interactive Designer tab.

This module contains all preview rendering logic including array generation,
mesh building, Plotly visualization, PNG fallbacks, and update orchestration.

NOTE: This file contains a large monolithic function that should be further
decomposed. See docs/refactoring/PREVIEW_DECOMPOSITION_STATUS.md for details.
"""

from __future__ import annotations

import hashlib
import json
import tempfile
import time
from pathlib import Path
from typing import Any, Optional, cast

import streamlit as st

from pfui.app_components import render_preview_controls
from pfui.imports import STYLES, WRITE_STL_BINARY, build_pot_mesh
from pfui.preview import make_preview_arrays, render_preview_png_cached
import pfui.schemas as SC
from pfui.state import widget_key

# Import extracted preview modules
try:
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
except ImportError:
    # Fallback implementations if package structure not available
    def initialize_preview_cache(ss):
        ss.setdefault("_last_surface_png", None)
        ss.setdefault("_last_surface_fig_json", None)
        ss.setdefault("_last_mesh_png", None)
        ss.setdefault("_last_mesh_fig_json", None)
        ss.setdefault("_preview_stale", False)
    
    def _to_float_scalar(x: Any) -> float:
        """Coerce x to a float in a defensive way."""
        def _unwrap(v):
            if isinstance(v, (list, tuple)):
                try:
                    return v[0]
                except Exception:
                    return v
            return v
        try:
            v = _unwrap(x)
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
            try:
                return float(x)
            except Exception:
                return 0.0
    
    def _to_int_scalar(x: Any) -> int:
        """Coerce x to an int in a defensive way."""
        return int(_to_float_scalar(x))
    
    # Stub functions for other modules
    def should_update_preview_ui(preview_mode, ss):
        return (True, None) if preview_mode == "auto" else (False, None)
    
    def compute_preview_signatures(*args, **kwargs):
        return (None, None)
    
    def generate_preview_arrays(*args, **kwargs):
        return (None, None, None, 0.0)
    
    def build_preview_mesh(*args, **kwargs):
        return (None, False)
    
    def render_quick_preview_surface(*args, **kwargs):
        pass
    
    def render_full_preview_mesh(*args, **kwargs):
        pass
    
    def render_preview_png_fallback(*args, **kwargs):
        return None
    
    def display_cached_preview(*args, **kwargs):
        pass

# Check if Plotly is available
try:
    import plotly.graph_objects as go
    HAS_PLOTLY = True
except Exception:
    HAS_PLOTLY = False
    go = cast(Any, None)


def render_preview_section(preview_mode: str) -> None:
    """Render the complete preview section.
    
    Args:
        preview_mode: One of "auto", "manual", or "debounced"
    """
    st.subheader("Preview")
    ss = cast(dict[str, Any], st.session_state)
    
    # ==================== PARAMETER EXTRACTION ====================
    # Extract all required parameters from session state
    # These would normally be set by render_preview_controls or sidebar widgets
    style_name = ss.get("style", "PetalWave")
    ui_opts = ss.get("style_opts", {})
    n_theta = ss.get("n_theta", 168)
    n_z = ss.get("n_z", 84)
    preview_detail = ss.get("preview_detail", 2.0)
    
    # Geometry parameters
    H = ss.get("H", 100.0)
    Rt = ss.get("Rt", 50.0)
    Rb = ss.get("Rb", 40.0)
    expn = ss.get("expn", 2.0)
    t_wall = ss.get("t_wall", 2.0)
    t_bottom = ss.get("t_bottom", 2.0)
    r_drain = ss.get("r_drain", 5.0)
    
    # Appearance parameters
    show_inner = ss.get("show_inner", False)
    view_elev = ss.get("view_elev", 20.0)
    view_azim = ss.get("view_azim", -60.0)
    fig_w = ss.get("fig_w", 7.5)
    fig_h = ss.get("fig_h", 7.0)
    dpi = ss.get("dpi", 220)
    place_on_ground = ss.get("place_on_ground", True)
    
    # Preview mode parameters
    interactive_3d = ss.get("interactive_3d", True)
    interactive_mesh = ss.get("interactive_mesh", True)
    
    # ==================== UPDATE DECISION ====================
    # Determine if preview should update based on mode and render UI controls
    try:
        should_update_preview, _ = should_update_preview_ui(preview_mode, ss)
    except NameError:
        # Fallback if module not imported - inline implementation
        should_update_preview = False
        if preview_mode == "auto":
            should_update_preview = True
        else:
            # Minimal manual controls
            col1, col2 = st.columns([3, 1])
            with col1:
                if st.button("🔄 Update Preview", type="primary"):
                    should_update_preview = True
            with col2:
                st.caption("Manual mode" if preview_mode == "manual" else "Debounced mode")
    
    # ==================== STYLE FUNCTION SETUP ====================
    # Style function can handle scalar or vector theta; cast for type-checker
    # Accept scalar float or any array-like for theta input/return to satisfy Pylance without optional numpy typing
    ROuterFn = Callable[
        [Union[float, _ArrayLike], float, float, float, dict], Union[float, _ArrayLike]
    ]
    # Raw style function (may accept scalar or vector theta, and may return scalar or array-like)
    _r_outer_raw = cast(
        ROuterFn, STYLES[style_name][0]
    )  # geometry comes from UI style name
    
    # Use the centralized adapter (imported from pfui.geometry_bridge) so callers
    # across the codebase get consistent behavior. This also avoids duplicating
    # the adapter logic in multiple places.
    from pfui.geometry_bridge import adapt_r_outer_fn
    
    r_outer_fn = adapt_r_outer_fn(_r_outer_raw)
    opts: StyleOpts | dict[str, Any] = dict(ui_opts)
    opts_json = json.dumps(opts, sort_keys=True)
    
    # Apply interactive preview scaling to keep Full Preview responsive
    # Narrow typing: preview_res_scale is expected to be a float; use a direct cast
    preview_scale = _to_float_scalar(ss.get("preview_res_scale", 1.0))
    target_n_theta = max(16, int(n_theta * preview_detail * preview_scale))
    target_n_z = max(8, int(n_z * preview_detail * preview_scale))
    preview_n_theta = max(16, min(168, target_n_theta))
    preview_n_z = max(8, min(168, target_n_z))
    full_n_theta = max(16, min(1024, target_n_theta))
    full_n_z = max(8, min(1024, target_n_z))
    
    # ==================== CACHE INITIALIZATION ====================
    # Initialize preview cache & stale flag so manual mode can keep showing
    # the last generated preview until the user explicitly updates it.
    initialize_preview_cache(ss)
    
    # Early placeholders so we can render the cached preview when needed.
    preview_placeholder = st.empty()
    mesh_placeholder = st.empty()
    
    # Predeclare values so type checker knows they exist regardless of branches
    X: Optional[Any] = None
    Y: Optional[Any] = None
    Z: Optional[Any] = None
    mesh_data: Optional[tuple[Any, Any]] = None
    
    # Only generate preview when allowed (auto mode or Update clicked).
    # In manual mode we must NOT recalculate or render previews automatically.
    preview_exists = False
    
    # ==================== SIGNATURE COMPUTATION ====================
    # Compute geometry and appearance signatures for change detection
    try:
        geom_sig, app_sig = compute_preview_signatures(
            H, Rt, Rb, expn,
            preview_n_theta, preview_n_z,
            full_n_theta, full_n_z,
            style_name, opts_json, ss,
            show_inner, view_elev, view_azim,
            fig_w, fig_h, dpi, place_on_ground
        )
    except NameError:
        # Fallback if module not imported
        geom_sig, app_sig = None, None
    
    # Compare with last-run signatures
    last_geom_sig = cast(Optional[tuple], ss.get("_last_preview_geom_sig"))
    last_app_sig = cast(Optional[tuple], ss.get("_last_preview_app_sig"))
    geom_changed = (geom_sig is None) or (geom_sig != last_geom_sig)
    app_changed = (app_sig is None) or (app_sig != last_app_sig)
    
    # One-shot suppression for non-model reruns (e.g., snapshot pagination)
    if bool(cast(Optional[bool], ss.get("_suppress_preview_once", False))):
        should_update_preview = False
        ss["_suppress_preview_once"] = False
    
    # Centralize cached-vs-regenerate decision into plotting.should_regenerate
    if should_update_preview:
        try:
            # cached_any: whether we have any surface/mesh cached artifacts
            cached_any = any(
                [
                    cast(Optional[bytes], ss.get("_last_surface_png")),
                    cast(Optional[dict], ss.get("_last_surface_fig_json")),
                    cast(Optional[bytes], ss.get("_last_mesh_png")),
                    cast(Optional[dict], ss.get("_last_mesh_fig_json")),
                ]
            )
            # Import the centralized decision helper (keeps imports local and safe)
            from pfui.app_components.plotting import should_regenerate
    
            should_update_preview = should_regenerate(
                geom_sig,
                app_sig,
                last_geom_sig=cast(Optional[tuple], ss.get("_last_preview_geom_sig")),
                last_app_sig=cast(Optional[tuple], ss.get("_last_preview_app_sig")),
                preview_mode=cast(str, ss.get("preview_mode", preview_mode)),
                preview_stale=bool(
                    cast(Optional[bool], ss.get("_preview_stale", False))
                ),
                cached_any=bool(cached_any),
                last_change_ts=cast(Any, ss.get("_last_change_ts", 0.0)),
                debounce_timeout_s=debounce_timeout_seconds,
            )
        except Exception:
            # Best-effort: on error, preserve previous decision (safe fallback)
            pass
    if should_update_preview:
        t0_total = time.time()
        # Initialize to satisfy type checkers in all code paths
        t0_arrays = 0.0
        t1_arrays = 0.0
        X = None
        Y = None
        Z = None
        mesh_data = None
        try:
            with st.spinner("Computing preview…"):
                # ==================== ARRAY GENERATION ====================
                # Generate X, Y, Z arrays with caching and orchestration
                try:
                    X, Y, Z, t_arrays = generate_preview_arrays(
                        H, Rt, Rb, expn,
                        preview_n_theta, preview_n_z,
                        full_n_theta, full_n_z,
                        style_name, opts_json,
                        geom_changed, preview_mode, ss,
                        geom_sig, app_sig,
                        debounce_timeout_seconds,
                        interactive_mesh
                    )
                except NameError:
                    # Fallback if module not imported
                    X, Y, Z = make_preview_arrays(
                        H, Rt, Rb, expn,
                        preview_n_theta, preview_n_z,
                        style_name, opts_json
                    )
                    t_arrays = 0.0
                
                # ==================== MESH BUILDING ====================
                # Build mesh with orchestration and caching
                try:
                    mesh_data, built_via_orchestrator = build_preview_mesh(
                        H, Rt, Rb, expn,
                        preview_n_theta, preview_n_z,
                        full_n_theta, full_n_z,
                        style_name, opts_json,
                        t_wall, t_bottom, r_drain,
                        r_outer_fn, opts,
                        geom_changed, interactive_mesh,
                        preview_mode, ss,
                        geom_sig, app_sig,
                        debounce_timeout_seconds,
                        place_on_ground
                    )
                except NameError:
                    # Fallback if module not imported
                    mesh_data = None
                    built_via_orchestrator = False
                except Exception as _e_mb:
                    ss.setdefault("_debug_logs", []).append(
                        f"Mesh build failed (preview): {_e_mb}"
                    )
                    mesh_data = None
                    built_via_orchestrator = False
                
                # In auto mode we consider the new preview current, so clear stale flag
                if preview_mode == "auto":
                    ss["_preview_stale"] = False
                preview_exists = True
        except Exception as e:
            preview_exists = False
            st.error(f"Preview generation failed: {e}")
        finally:
            try:
                perf = ss.setdefault("_perf_logs", [])
                if preview_exists:
                    perf.append(
                        f"arrays:{(t1_arrays - t0_arrays) * 1000:.1f}ms total_so_far:{(time.time() - t0_total) * 1000:.1f}ms"
                    )
                else:
                    perf.append("arrays:ERROR")
                ss["_perf_logs"] = perf[-40:]
            except Exception:
                pass
            # Remember last successful preview signatures
            try:
                if preview_exists and geom_sig is not None and app_sig is not None:
                    ss["_last_preview_geom_sig"] = geom_sig
                    ss["_last_preview_app_sig"] = app_sig
            except Exception:
                pass
    
    # If we're NOT updating (manual mode and Update not clicked), show the
    # previously cached preview so the UI remains usable.
    if not should_update_preview:
        try:
            display_cached_preview(
                preview_mode,
                interactive_mesh,
                HAS_PLOTLY,
                ss,
                mesh_placeholder,
                preview_placeholder
            )
        except NameError:
            # Fallback if module not imported - show basic cached display
            last_mesh_png = cast(Optional[bytes], ss.get("_last_mesh_png"))
            if last_mesh_png:
                mesh_placeholder.image(last_mesh_png, caption="Full Preview (cached)")
    
    # ==================== PNG FALLBACK RENDERING ====================
    # Generate PNG fallback when Plotly is unavailable or forced
    png_bytes = None
    if should_update_preview:
        try:
            png_bytes = render_preview_png_fallback(
                H, Rt, Rb, expn,
                preview_n_theta, preview_n_z,
                full_n_theta, full_n_z,
                style_name, opts_json,
                fig_w, fig_h, dpi,
                t_wall, show_inner,
                place_on_ground,
                view_elev, view_azim,
                interactive_mesh,
                HAS_PLOTLY,
                ss,
                _to_int_scalar
            )
        except NameError:
            # Fallback if module not imported
            png_bytes = None
    
    # ==================== QUICK PREVIEW (PLOTLY SURFACE) ====================
    # Quick Preview (live) — Plotly surface if available, otherwise static PNG fallback
    try:
        if should_update_preview:
            try:
                render_quick_preview_surface(
                    X, Y, Z,
                    preview_n_theta, preview_n_z,
                    fig_h, place_on_ground, ss,
                    preview_placeholder,
                    _to_float_scalar, _to_int_scalar
                )
            except NameError:
                # Fallback if module not imported - basic surface rendering
                if HAS_PLOTLY and (X is not None) and (Y is not None) and (Z is not None):
                    import plotly.graph_objects as go
                    fig = go.Figure(data=[go.Surface(x=X, y=Y, z=Z)])
                    preview_placeholder.plotly_chart(fig, use_container_width=True)
            
            # PNG fallback when Plotly is unavailable
            if not HAS_PLOTLY:
                ak = "|".join(
                    str(cast(Any, ss.get(k, "")))
                    for k in (
                        "preview_palette",
                        "preview_grad_c1",
                        "preview_grad_c2",
                        "preview_grad_c3",
                        "mesh_ambient",
                        "mesh_diffuse",
                        "mesh_specular",
                        "mesh_roughness",
                        "mesh_fresnel",
                    )
                )
                png_bytes_q = render_preview_png_cached(
                    H, Rt, Rb, expn,
                    preview_n_theta, preview_n_z,
                    style_name, opts_json,
                    fig_w, fig_h, dpi,
                    inner_wall=t_wall if show_inner else None,
                    view_elev=view_elev,
                    view_azim=view_azim,
                    return_png=False,
                    appearance_key=ak,
                )
                if png_bytes_q:
                    preview_placeholder.image(
                        png_bytes_q, caption="Preview", width="stretch"
                    )
    except Exception:
        pass
    
    # Cache the freshly rendered PNG so manual mode can continue showing
    # the last preview until the user updates again.
    try:
        if png_bytes:
            # we stored png_bytes after choosing mesh vs surface above
            # but if interactive_mesh was false this is from surface
            if interactive_mesh:
                ss["_last_mesh_png"] = png_bytes
            else:
                ss["_last_surface_png"] = png_bytes
            ss["_preview_stale"] = False
    except Exception:
        pass
    
    # ==================== FULL PREVIEW (PLOTLY MESH3D) ====================
    # Full Preview (interactive Mesh3d or static fallback). Render only when updating.
    if should_update_preview and interactive_mesh:
        try:
            render_full_preview_mesh(
                H, Rt, Rb, expn,
                preview_n_theta, preview_n_z,
                full_n_theta, full_n_z,
                n_theta, n_z,
                style_name, opts_json,
                t_wall, t_bottom, r_drain,
                r_outer_fn, opts,
                mesh_data, geom_changed,
                preview_mode, ss,
                geom_sig, app_sig,
                debounce_timeout_seconds,
                place_on_ground, fig_h,
                mesh_placeholder, preview_placeholder,
                png_bytes,
                _to_float_scalar, _to_int_scalar
            )
        except NameError:
            # Fallback if module not imported
            mesh_placeholder.info("Full preview module not available")
    
    
