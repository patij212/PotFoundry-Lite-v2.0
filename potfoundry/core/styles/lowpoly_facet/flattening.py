"""
Straight-edge flattening logic for LowPolyFacet seams.

This module contains the complex straight-edge flattening algorithms
that create crisp, uniform seam bands.
"""
from __future__ import annotations

from typing import Any, Callable, Dict

import numpy as np
import numpy.typing as npt

from ....types import NDArrayFloat


def create_straight_edge_blender(
    straight_blend_pow: float,
    straight_start: float,
    strict_no_outward: bool
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
        uniform_val: float,
    ) -> Any:
        uniform_scalar = float(uniform_val)
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
    r_uniform_bot_target: float,
    r_uniform_top_target: float,
    straight_blend_func: Callable,
    straight_smooth: bool
) -> Tuple[Any, Any]:
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
    if straight_smooth:
        return r_base_local, r_base_local_in
    
    if cut_bot_deg > 0.0 and (
        np.any(w_bot > 0.0) if isinstance(w_bot, np.ndarray) else (w_bot > 0.0)
    ):
        r_base_local = straight_blend_func(
            w_bot, r_base_local_orig, r_uniform_bot_target
        )
        r_base_local_in = straight_blend_func(
            w_bot, r_base_local_in_orig, r_uniform_bot_target
        )
    
    if cut_top_deg > 0.0 and (
        np.any(w_top > 0.0) if isinstance(w_top, np.ndarray) else (w_top > 0.0)
    ):
        r_base_local = straight_blend_func(
            w_top, r_base_local, r_uniform_top_target
        )
        r_base_local_in = straight_blend_func(
            w_top, r_base_local_in, r_uniform_top_target
        )
    
    return r_base_local, r_base_local_in


def compute_straight_edge_parameters(
    opts: Dict,
    straight_edge: bool,
    uniform_ring: bool,
    has_cut: bool
) -> Tuple[bool, bool, bool, float, float]:
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
