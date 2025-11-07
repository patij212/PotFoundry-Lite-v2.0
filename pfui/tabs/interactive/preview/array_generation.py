"""Array generation for preview surfaces."""

from __future__ import annotations

import time
from typing import Any, Optional, cast

import streamlit as st

from pfui.preview import make_preview_arrays


def generate_preview_arrays(
    H: float,
    Rt: float,
    Rb: float,
    expn: float,
    preview_n_theta: int,
    preview_n_z: int,
    full_n_theta: int,
    full_n_z: int,
    style_name: str,
    opts_json: str,
    geom_changed: bool,
    preview_mode: str,
    ss: dict[str, Any],
    geom_sig: Optional[tuple],
    app_sig: Optional[tuple],
    debounce_timeout_seconds: float,
    interactive_mesh: bool,
) -> tuple[Optional[Any], Optional[Any], Optional[Any], float]:
    """Generate X, Y, Z preview arrays with caching.
    
    Args:
        H: Height
        Rt: Top radius
        Rb: Bottom radius
        expn: Expansion factor
        preview_n_theta: Preview angular divisions
        preview_n_z: Preview vertical divisions
        full_n_theta: Full preview angular divisions
        full_n_z: Full preview vertical divisions
        style_name: Style name
        opts_json: Style options as JSON
        geom_changed: Whether geometry changed
        preview_mode: Preview mode
        ss: Session state dictionary
        geom_sig: Geometry signature
        app_sig: Appearance signature
        debounce_timeout_seconds: Debounce timeout
        interactive_mesh: Whether interactive mesh is enabled
        
    Returns:
        Tuple of (X, Y, Z, elapsed_time)
    """
    X: Optional[Any] = None
    Y: Optional[Any] = None
    Z: Optional[Any] = None
    
    t0_arrays = time.time()
    
    # Reuse cached arrays when geometry unchanged
    if (not geom_changed) and all(
        k in st.session_state for k in ("_last_X", "_last_Y", "_last_Z")
    ):
        try:
            X = cast(Any, ss.get("_last_X"))
            Y = cast(Any, ss.get("_last_Y"))
            Z = cast(Any, ss.get("_last_Z"))
        except Exception:
            X = Y = Z = None
    
    if (X is None) or (Y is None) or (Z is None):
        # Use centralized orchestrator for array generation
        try:
            from pfui.app_components.plotting import (
                orchestrate_preview as _orchestrate_preview,
            )

            res = _orchestrate_preview(
                H,
                Rt,
                Rb,
                expn,
                preview_n_theta,
                preview_n_z,
                full_n_theta,
                full_n_z,
                style_name,
                opts_json,
                preview_mode=cast(
                    str, ss.get("preview_mode", preview_mode)
                ),
                preview_stale=bool(
                    cast(Any, ss.get("_preview_stale", False))
                ),
                last_geom_sig=cast(
                    Optional[tuple], ss.get("_last_preview_geom_sig")
                ),
                last_app_sig=cast(
                    Optional[tuple], ss.get("_last_preview_app_sig")
                ),
                geom_sig=geom_sig,
                app_sig=app_sig,
                debounce_timeout_s=debounce_timeout_seconds,
                last_change_ts=cast(Any, ss.get("_last_change_ts", 0.0)),
                interactive_mesh=bool(interactive_mesh),
            )
            arrs = cast(Any, res.get("arrays"))
            if arrs is not None:
                try:
                    X, Y, Z = arrs
                except Exception:
                    X = Y = Z = None
        except Exception:
            # Fall back to direct call if orchestrator fails
            X = Y = Z = None

        if (X is None) or (Y is None) or (Z is None):
            X, Y, Z = make_preview_arrays(
                H,
                Rt,
                Rb,
                expn,
                preview_n_theta,
                preview_n_z,
                style_name,
                opts_json,
            )
        
        # Cache for appearance-only changes
        try:
            ss["_last_X"] = X
            ss["_last_Y"] = Y
            ss["_last_Z"] = Z
        except Exception:
            pass
    
    t1_arrays = time.time()
    elapsed = t1_arrays - t0_arrays
    
    return X, Y, Z, elapsed
