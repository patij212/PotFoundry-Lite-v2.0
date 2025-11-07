"""Signature computation for detecting geometry and appearance changes."""

from __future__ import annotations

from typing import Any, Optional, cast

from .utils import to_float_scalar


def compute_preview_signatures(
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
    ss: dict[str, Any],
    show_inner: bool,
    view_elev: float,
    view_azim: float,
    fig_w: float,
    fig_h: float,
    dpi: int,
    place_on_ground: bool,
) -> tuple[Optional[tuple], Optional[tuple]]:
    """Compute geometry and appearance signatures for change detection.
    
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
        ss: Session state dictionary
        show_inner: Show inner wall
        view_elev: View elevation
        view_azim: View azimuth
        fig_w: Figure width
        fig_h: Figure height
        dpi: DPI
        place_on_ground: Place on ground
        
    Returns:
        Tuple of (geometry_signature, appearance_signature)
    """
    geom_sig: Optional[tuple] = None
    app_sig: Optional[tuple] = None
    
    try:
        # Use plotting helpers to compute signatures (centralized and testable)
        from pfui.app_components.plotting import (
            compute_app_sig,
            compute_geom_sig,
        )
    
        geom_sig = compute_geom_sig(
            H,
            Rt,
            Rb,
            expn,
            preview_n_theta,
            preview_n_z,
            style_name,
            opts_json,
            full_n_theta,
            full_n_z,
        )
    
        app_sig = compute_app_sig(
            cast(Any, ss.get("preview_palette")),
            cast(Any, ss.get("preview_grad_c1")),
            cast(Any, ss.get("preview_grad_c2")),
            cast(Any, ss.get("preview_grad_c3")),
            to_float_scalar(ss.get("mesh_ambient", 0.35)),
            to_float_scalar(ss.get("mesh_diffuse", 0.95)),
            to_float_scalar(ss.get("mesh_specular", 0.25)),
            to_float_scalar(ss.get("mesh_roughness", 0.7)),
            to_float_scalar(ss.get("mesh_fresnel", 0.2)),
            bool(show_inner),
            float(view_elev),
            float(view_azim),
            float(fig_w),
            float(fig_h),
            int(dpi),
            bool(place_on_ground),
        )
    except Exception:
        geom_sig = None
        app_sig = None
    
    return geom_sig, app_sig
