"""
LowPolyFacet style package.

Complete implementation using extracted helper modules for maintainability.
"""

from __future__ import annotations

import math
from typing import Dict, cast

import numpy as np
import numpy.typing as npt

from ....types import NDArrayFloat
from .core import compute_basic_facet_radius
from .experimental import (
    apply_avg3_antialiasing,
    apply_edge_trimming,
    apply_lift_valleys_antialiasing,
    apply_med5_antialiasing,
    apply_median3_antialiasing,
    apply_outward_mode,
    apply_uniform_ring_guard,
)
from .flattening import (
    apply_straight_edge_flattening,
    compute_straight_edge_parameters,
    create_straight_edge_blender,
)
from .parameters import extract_params, has_cuts, has_edge_cut
from .seams import (
    apply_seam_cuts_with_smooth_limiting,
    apply_seam_limits,
    compute_seam_angles_and_slopes,
    compute_seam_radii,
    compute_straight_edge_targets,
    compute_tier_boundaries,
    compute_window_parameters,
    compute_window_weights,
    create_facet_mod_helpers,
    create_smooth_helpers,
)
from .utils import base_radius

__all__ = ["r_outer_lowpoly_facet", "base_radius"]

# Constants
TAU = 2.0 * math.pi


def r_outer_lowpoly_facet(
    theta: npt.ArrayLike | float,
    z: float,
    r0: float | npt.NDArray[np.float64],
    H: float,
    opts: Dict,
) -> float | npt.NDArray[np.float64]:
    """Generate outer radius for lowpoly facet style.

    Creates low-poly faceted appearance with optional tier-based cuts,
    edge trimming, and advanced print-safe features.

    Args:
        theta: Angular coordinate(s) in radians (scalar or array)
        z: Height coordinate in mm (scalar)
        r0: Base radius at height z in mm (scalar or array)
        H: Total pot height in mm
        opts: Style options dictionary containing lp_* parameters

    Returns:
        Computed outer radius (scalar if theta is scalar, array otherwise)
    """
    # Extract and validate parameters
    params = extract_params(opts)

    # Check for complex features
    needs_complex = params.use_outward or has_cuts(params) or has_edge_cut(params)

    # Fast path for simple faceting
    if not needs_complex:
        t = z / H if H > 0 else 0.0
        tier_idx = int(min(params.tiers - 1, max(0, math.floor(t * params.tiers))))
        tri_s, f, p = compute_basic_facet_radius(theta, r0, params, tier_idx)
        out = r0 * f
        return float(out) if np.isscalar(theta) else out

    # Complex path with seam handling
    t = z / H if H > 0 else 0.0
    th = np.asarray(theta, dtype=float)

    # Compute tier index and basic faceting
    tier_idx = int(min(params.tiers - 1, max(0, math.floor(t * params.tiers))))
    tri_s, f, p = compute_basic_facet_radius(theta, r0, params, tier_idx)

    # Compute local base with current facet modulation
    f_dir_current = (
        (1.0 + params.amp * tri_s)
        if params.outward_dir
        else (1.0 - params.amp * (1.0 - tri_s))
    )
    r_base_local = r0 * f_dir_current
    r_base_local_orig = (
        r_base_local.copy()
        if isinstance(r_base_local, np.ndarray)
        else float(r_base_local)
    )

    # Also compute inward-mode base as guard
    r_base_local_in = r0 * (1.0 - params.amp * (1.0 - tri_s))
    r_base_local_in_orig = (
        r_base_local_in.copy()
        if isinstance(r_base_local_in, np.ndarray)
        else float(r_base_local_in)
    )

    # If no tier-based features, apply simple modulation
    if params.tiers < 1 or not (has_cuts(params) or params.use_outward):
        r_tmp = r_base_local

        # Apply edge trimming if enabled
        if has_edge_cut(params):
            smooth_max_func, smooth_min_func = create_smooth_helpers()
            r_tmp = apply_edge_trimming(
                r_tmp,
                tri_s,
                params.edge_cut_mm,
                params.edge_cut_sharp,
                params.outward_dir,
                params.print_safe,
                smooth_min_func,
            )

        return float(r_tmp) if np.isscalar(theta) else cast(NDArrayFloat, r_tmp)

    # Full tier-based seam handling
    k, z_bot, z_top = compute_tier_boundaries(z, H, params.tiers)

    # Create facet modulation helpers
    facet_mod_for_tier, facet_mod_scalar = create_facet_mod_helpers(
        th,
        params.facets,
        params.jitter_amt,
        params.phase,
        p,
        params.amp,
        params.outward_dir,
    )

    # Compute seam radii
    R_start_bot, R_start_top = compute_seam_radii(
        z_bot, z_top, H, r0, k, params.tiers, facet_mod_for_tier, opts
    )

    # Compute angles and slopes
    m_bot, m_top = compute_seam_angles_and_slopes(
        params.cut_bot_deg, params.cut_top_deg, params.print_safe
    )

    # Create smooth helpers
    smooth_max_func, smooth_min_func = create_smooth_helpers()

    # Compute window parameters
    (
        z_win,
        cut_cap_mm,
        facet_span_mm,
        cut_soft_mm,
        s_bot,
        s_top,
        depth_bot0,
        depth_top0,
    ) = compute_window_parameters(
        H,
        params.tiers,
        params.bevel,
        params.outward_dir,
        params.print_safe,
        r0,
        params.amp,
        m_bot,
        m_top,
        opts,
    )

    # Compute window weights
    w_bot, w_top, w_bot_scalar, w_top_scalar = compute_window_weights(
        z, z_bot, z_top, z_win
    )

    # Compute seam limits
    r_lim_bot, r_lim_top = apply_seam_limits(
        r0,
        r_base_local,
        depth_bot0,
        depth_top0,
        w_bot,
        w_top,
        params.uniform_ring,
        params.straight_edge,
    )

    # Compute straight-edge targets
    r_uniform_bot_target, r_uniform_top_target, uniform_flat_target = (
        compute_straight_edge_targets(
            r0,
            depth_bot0,
            depth_top0,
            params.cut_bot_deg,
            params.cut_top_deg,
            params.uniform_ring,
            r_base_local_in_orig,
        )
    )

    # Apply straight-edge flattening if enabled
    (
        enable_straight,
        enable_uniform,
        straight_smooth,
        straight_blend_pow,
        straight_start,
    ) = compute_straight_edge_parameters(
        opts, params.straight_edge, params.uniform_ring, has_cuts(params)
    )

    if enable_straight or enable_uniform:
        strict_no_outward = params.use_outward and has_cuts(params)
        straight_blend_func = create_straight_edge_blender(
            straight_blend_pow, straight_start, strict_no_outward
        )

        r_base_local, r_base_local_in = apply_straight_edge_flattening(
            r_base_local,
            r_base_local_in,
            r_base_local_orig,
            r_base_local_in_orig,
            w_bot,
            w_top,
            params.cut_bot_deg,
            params.cut_top_deg,
            r_uniform_bot_target,
            r_uniform_top_target,
            straight_blend_func,
            straight_smooth,
            opts,
        )

        # Update limits after flattening
        if params.cut_bot_deg > 0.0 and params.outward_dir:
            r_lim_bot = np.maximum(r_lim_bot, r_uniform_bot_target)
        if params.cut_top_deg > 0.0 and params.outward_dir:
            r_lim_top = np.maximum(r_lim_top, r_uniform_top_target)

    # Apply seam cuts with smooth limiting
    r_tmp = apply_seam_cuts_with_smooth_limiting(
        r_base_local, r_lim_bot, r_lim_top, s_bot, s_top, smooth_min_func
    )

    # Apply anti-aliasing if configured
    if w_bot_scalar > 0.0 or w_top_scalar > 0.0:
        r_tmp = apply_lift_valleys_antialiasing(
            r_tmp, w_bot, w_top, w_bot_scalar, w_top_scalar, r_base_local_in_orig, opts
        )
        r_tmp = apply_median3_antialiasing(
            r_tmp, w_bot, w_top, w_bot_scalar, w_top_scalar, r_base_local_in_orig, opts
        )
        r_tmp = apply_med5_antialiasing(
            r_tmp, w_bot, w_top, w_bot_scalar, w_top_scalar, r_base_local_in_orig, opts
        )
        r_tmp = apply_avg3_antialiasing(
            r_tmp, w_bot, w_top, w_bot_scalar, w_top_scalar, r_base_local_in_orig, opts
        )

    # Apply edge trimming if enabled
    if has_edge_cut(params):
        r_tmp = apply_edge_trimming(
            r_tmp,
            tri_s,
            params.edge_cut_mm,
            params.edge_cut_sharp,
            params.outward_dir,
            params.print_safe,
            smooth_min_func,
        )

    # Apply outward mode if enabled
    if params.use_outward:
        dz_bot = np.maximum(0.0, z - z_bot)
        dz_top = np.maximum(0.0, z_top - z)
        r_tmp = apply_outward_mode(
            r_tmp,
            R_start_bot,
            R_start_top,
            dz_bot,
            dz_top,
            m_bot,
            m_top,
            s_bot,
            s_top,
            w_bot,
            w_top,
            w_bot_scalar,
            w_top_scalar,
            r0,
            params.cut_bot_deg,
            params.cut_top_deg,
            has_cuts(params),
            smooth_max_func,
        )

    # Enforce exact seam clamp at the seam plane so max radius matches expected theoretical limit.
    # This compensates for minor smoothing that can pull values below r0 - depth.
    try:
        if params.straight_edge and not params.uniform_ring:
            # At bottom seam: w_bot_scalar ~1.0 when z == z_bot; similarly for top.
            if w_bot_scalar >= 0.999 and params.cut_bot_deg > 0.0:
                r_tmp = np.maximum(r_tmp, r_uniform_bot_target)
            if w_top_scalar >= 0.999 and params.cut_top_deg > 0.0:
                r_tmp = np.maximum(r_tmp, r_uniform_top_target)
    except Exception:
        pass

    # Apply uniform ring guard
    r_out = apply_uniform_ring_guard(r_tmp, r_base_local_in_orig, params.uniform_ring)

    # Attach debug sample if enabled
    if bool(opts.get("lp_debug_enabled", False)):
        opts["_lp_debug_sample"] = {
            "theta": float(th[0]) if isinstance(th, np.ndarray) else float(th),
            "z": float(z),
            "r_out": float(r_out[0]) if isinstance(r_out, np.ndarray) else float(r_out),
        }

    # Preserve scalar return behavior
    return float(r_out) if np.isscalar(theta) else cast(NDArrayFloat, r_out)
