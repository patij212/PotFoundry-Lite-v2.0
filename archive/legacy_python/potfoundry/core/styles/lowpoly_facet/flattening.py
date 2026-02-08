"""Straight-edge flattening logic for LowPolyFacet seams.

This module contains the complex straight-edge flattening algorithms
that create crisp, uniform seam bands.
"""
from __future__ import annotations

from collections.abc import Callable
from typing import Any

import numpy as np

from ....types import NDArrayFloat


def create_straight_edge_blender(
    straight_blend_pow: float,
    straight_start: float,
    strict_no_outward: bool,
) -> Callable:
    """Create a straight-edge blending function.
    
    Args:
        straight_blend_pow: Power for blend concentration
        straight_start: Start threshold for blending
        strict_no_outward: Whether to enforce no outward growth
        
    Returns:
        Blending function

    """
    def _blend_factor(weights: np.ndarray | float) -> np.ndarray | float:
        w_arr = np.asarray(weights, dtype=float)
        w_clamped = np.clip(w_arr, 0.0, 1.0)
        if straight_start >= 0.99:
            w_norm = np.ones_like(w_clamped)
        else:
            denom = max(1e-6, 1.0 - straight_start)
            w_norm = np.clip((w_clamped - straight_start) / denom, 0.0, 1.0)
        blend_arr = w_norm**straight_blend_pow
        return float(blend_arr) if blend_arr.shape == () else blend_arr

    def _straight_blend(
        weight: NDArrayFloat | float,
        original: NDArrayFloat | float,
        uniform_val: float | npt.NDArray[np.float64],
    ) -> Any:
        # Accept either scalar or array uniform target; use directly for vector ops
        uniform_scalar = float(uniform_val) if not isinstance(uniform_val, np.ndarray) else uniform_val
        w_arr = np.asarray(weight, dtype=float)
        orig_arr = np.asarray(original, dtype=float)
        blend_arr = _blend_factor(w_arr)
        adjusted = ((1.0 - blend_arr) * orig_arr) + (blend_arr * uniform_scalar)
        if strict_no_outward:
            adjusted = np.minimum(adjusted, orig_arr)
        return float(adjusted) if adjusted.shape == () else adjusted

    return _straight_blend


def apply_straight_edge_flattening(
    r_base_local: Any,
    r_base_local_in: Any,
    r_base_local_orig: Any,
    r_base_local_in_orig: Any,
    w_bot: Any,
    w_top: Any,
    cut_bot_deg: float,
    cut_top_deg: float,
    r_uniform_bot_target: float | npt.NDArray[np.float64],
    r_uniform_top_target: float | npt.NDArray[np.float64],
    straight_blend_func: Callable,
    straight_smooth: bool,
    opts: dict | None = None,
) -> tuple[Any, Any]:
    """Apply straight-edge flattening to seam bands.
    
    Args:
        r_base_local: Current local base radius
        r_base_local_in: Current inward base radius
        r_base_local_orig: Original local base
        r_base_local_in_orig: Original inward base
        w_bot: Bottom window weights
        w_top: Top window weights
        cut_bot_deg: Bottom cut angle
        cut_top_deg: Top cut angle
        r_uniform_bot_target: Bottom target radius
        r_uniform_top_target: Top target radius
        straight_blend_func: Blending function
        straight_smooth: Whether smooth mode is enabled
        
    Returns:
        Tuple of (r_base_local, r_base_local_in) with flattening applied

    """
    # Smooth mode: softly pull high-radius values toward the uniform targets
    # without creating a hard flat plateau. The original implementation returned
    # early (no-op) which failed tests expecting a modest peak reduction.
    if straight_smooth:
        # Options dict may be absent in legacy call; fall back to defaults.
        strength = float((opts or {}).get("lp_cut_straight_smooth_strength", 0.5))
        strength = max(0.0, min(1.0, strength))
        passes = int((opts or {}).get("lp_cut_straight_smooth_passes", 1))
        passes = max(1, min(8, passes))
        # Convert inputs to numpy arrays for vector blending; preserve scalar behaviour.
        rb_loc = np.asarray(r_base_local, dtype=float)
        rb_loc_in = np.asarray(r_base_local_in, dtype=float)
        w_bot_arr = np.asarray(w_bot, dtype=float)
        w_top_arr = np.asarray(w_top, dtype=float)
        for _ in range(passes):
            # Local adaptive blend weights (only where window active)
            if cut_bot_deg > 0.0:
                wb = np.clip(w_bot_arr, 0.0, 1.0)
                if np.any(wb > 0.0):
                    blend_bot = strength * wb
                    rb_loc = np.where(
                        blend_bot > 0.0,
                        (1.0 - blend_bot) * rb_loc + blend_bot * float(r_uniform_bot_target),
                        rb_loc,
                    )
                    rb_loc_in = np.where(
                        blend_bot > 0.0,
                        (1.0 - blend_bot) * rb_loc_in + blend_bot * float(r_uniform_bot_target),
                        rb_loc_in,
                    )
            if cut_top_deg > 0.0:
                wt = np.clip(w_top_arr, 0.0, 1.0)
                if np.any(wt > 0.0):
                    blend_top = strength * wt
                    rb_loc = np.where(
                        blend_top > 0.0,
                        (1.0 - blend_top) * rb_loc + blend_top * float(r_uniform_top_target),
                        rb_loc,
                    )
                    rb_loc_in = np.where(
                        blend_top > 0.0,
                        (1.0 - blend_top) * rb_loc_in + blend_top * float(r_uniform_top_target),
                        rb_loc_in,
                    )
            # Very light median smoothing each pass (avoids creating plateaus).
            # Only apply when we have enough samples (vector case).
            if rb_loc.ndim == 1 and rb_loc.size >= 5:
                rolled = np.vstack([
                    np.roll(rb_loc, 2),
                    np.roll(rb_loc, 1),
                    rb_loc,
                    np.roll(rb_loc, -1),
                    np.roll(rb_loc, -2),
                ])
                rb_loc = np.median(rolled, axis=0)
                rolled_in = np.vstack([
                    np.roll(rb_loc_in, 2),
                    np.roll(rb_loc_in, 1),
                    rb_loc_in,
                    np.roll(rb_loc_in, -1),
                    np.roll(rb_loc_in, -2),
                ])
                rb_loc_in = np.median(rolled_in, axis=0)
        # Preserve original scalar return semantics without changing variable types
        rb_loc_out: NDArrayFloat | float
        rb_loc_in_out: NDArrayFloat | float
        if rb_loc.shape == ():
            rb_loc_out = float(rb_loc)
        else:
            rb_loc_out = rb_loc
        if rb_loc_in.shape == ():
            rb_loc_in_out = float(rb_loc_in)
        else:
            rb_loc_in_out = rb_loc_in
        return rb_loc_out, rb_loc_in_out

    if cut_bot_deg > 0.0 and (
        np.any(w_bot > 0.0) if isinstance(w_bot, np.ndarray) else (w_bot > 0.0)
    ):
        r_base_local = straight_blend_func(
            w_bot, r_base_local_orig, r_uniform_bot_target,
        )
        r_base_local_in = straight_blend_func(
            w_bot, r_base_local_in_orig, r_uniform_bot_target,
        )

    if cut_top_deg > 0.0 and (
        np.any(w_top > 0.0) if isinstance(w_top, np.ndarray) else (w_top > 0.0)
    ):
        r_base_local = straight_blend_func(
            w_top, r_base_local, r_uniform_top_target,
        )
        r_base_local_in = straight_blend_func(
            w_top, r_base_local_in, r_uniform_top_target,
        )

    return r_base_local, r_base_local_in


def compute_straight_edge_parameters(
    opts: dict,
    straight_edge: bool,
    uniform_ring: bool,
    has_cut: bool,
) -> tuple[bool, bool, bool, float, float]:
    """Compute parameters for straight-edge flattening.
    
    Args:
        opts: Options dictionary
        straight_edge: Whether straight edges are enabled
        uniform_ring: Whether uniform ring is enabled
        has_cut: Whether cuts are present
        
    Returns:
        Tuple of (enable_straight, enable_uniform, straight_smooth, 
                  straight_blend_pow, straight_start)

    """
    flatten_enabled_local = bool(opts.get("lp_enable_flattening", False))
    disable_straight = bool(opts.get("lp_disable_straight_flattening", False))
    enable_straight = straight_edge and not disable_straight
    enable_uniform = uniform_ring and flatten_enabled_local

    straight_smooth = (
        bool(opts.get("lp_cut_straight_smooth_mode", False))
        and enable_straight
        and has_cut
        and not uniform_ring
    )

    if not (enable_straight or enable_uniform) or not has_cut:
        return False, False, False, 0.0, 0.0

    # Compute blend parameters
    straight_blend_pow = max(0.01, float(opts.get("lp_cut_straight_blend_pow", 0.05)))
    straight_start = float(opts.get("lp_cut_straight_lock_threshold", 0.2))
    straight_start = min(max(0.0, straight_start), 0.995)

    # Optional: preserve facet planarity
    if bool(opts.get("lp_cut_straight_preserve_facets", False)):
        straight_start = max(
            straight_start,
            float(opts.get("lp_cut_straight_preserve_lock_threshold", 0.6)),
        )
        straight_blend_pow = max(
            straight_blend_pow,
            float(opts.get("lp_cut_straight_preserve_blend_pow", 2.0)),
        )

    if uniform_ring:
        straight_blend_pow = 1.0
        straight_start = 0.0
        if bool(opts.get("lp_uniform_ring_localize", False)):
            straight_start = max(
                straight_start,
                float(opts.get("lp_uniform_ring_lock_threshold", 0.7)),
            )
            straight_blend_pow = max(
                straight_blend_pow,
                float(opts.get("lp_uniform_ring_blend_pow", 2.0)),
            )

    return enable_straight, enable_uniform, straight_smooth, straight_blend_pow, straight_start
