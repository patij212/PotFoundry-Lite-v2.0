"""Experimental features for LowPolyFacet style.

This module contains advanced experimental features including
anti-aliasing, edge trimming, and outward mode processing.
"""
from __future__ import annotations

from typing import Any

import numpy as np
import numpy.typing as npt

from ....types import NDArrayFloat
from ...geometry_helpers import (
    avg3,
    lift_valleys,
    med5,
    median3_circular,
)


def apply_edge_trimming(
    r_vals: float | NDArrayFloat,
    tri_s: npt.NDArray[np.float64],
    edge_cut_mm: float,
    edge_cut_sharp: float,
    outward_dir: bool,
    print_safe: bool,
    smooth_min_func: Any,
) -> float | NDArrayFloat:
    """Apply edge trimming near facet boundaries.
    
    Args:
        r_vals: Current radius values
        tri_s: Smoothed triangle wave
        edge_cut_mm: Edge cut amount in mm
        edge_cut_sharp: Edge cut sharpness factor
        outward_dir: Whether facets are outward
        print_safe: Whether print-safe mode is enabled
        smooth_min_func: Smooth minimum function
        
    Returns:
        Radius with edge trimming applied

    """
    w_edge = (1.0 - tri_s) ** edge_cut_sharp
    edge_cut_eff = edge_cut_mm * (0.75 if outward_dir else 1.0)
    if print_safe:
        edge_cut_eff *= 0.85

    s_edge = max(1e-6, 0.25 * max(1e-3, edge_cut_eff))
    r_edge_cap = np.maximum(1e-6, r_vals - edge_cut_eff * w_edge)
    return smooth_min_func(r_vals, r_edge_cap, s_edge)


def apply_lift_valleys_antialiasing(
    r_vals: npt.NDArray[np.float64],
    w_bot: Any,
    w_top: Any,
    w_bot_scalar: float,
    w_top_scalar: float,
    r_base_local_in_orig: Any,
    opts: dict,
) -> npt.NDArray[np.float64]:
    """Apply lift valleys anti-aliasing.
    
    Args:
        r_vals: Current radius array
        w_bot: Bottom window weights
        w_top: Top window weights
        w_bot_scalar: Bottom weight scalar
        w_top_scalar: Top weight scalar
        r_base_local_in_orig: Original inward base
        opts: Options dictionary
        
    Returns:
        Anti-aliased radius array

    """
    try:
        lift_passes = max(0, int(opts.get("lp_lift_valleys_passes", 0)))
        lift_strength = max(0.0, min(1.0, float(opts.get("lp_lift_valleys_strength", 0.5))))

        if lift_passes > 0 and lift_strength > 0.0:
            arr = np.asarray(r_vals, dtype=float)
            w_any_bot = np.asarray(w_bot, dtype=float) if w_bot_scalar > 0.0 else 0.0
            w_any_top = np.asarray(w_top, dtype=float) if w_top_scalar > 0.0 else 0.0
            w_any = np.maximum(w_any_bot, w_any_top)

            if np.any(w_any > 0.0):
                base_guard = np.asarray(r_base_local_in_orig, dtype=float)
                if base_guard.shape == ():
                    base_guard = np.full_like(arr, float(base_guard))

                lift_gamma = float(opts.get("lp_lift_valleys_gamma", 1.0))
                target_val = float(np.mean(base_guard)) if getattr(base_guard, "ndim", 0) != 0 else float(base_guard)
                for _ in range(lift_passes):
                    lifted = lift_valleys(arr, w_any, target_val, lift_strength, lift_gamma)
                    blend = np.power(np.clip(w_any, 0.0, 1.0), 1.2)
                    arr = (1.0 - lift_strength * blend) * arr + (lift_strength * blend) * lifted
                    arr = np.minimum(arr, base_guard)

                return arr
    except Exception:
        pass

    return r_vals


def apply_median3_antialiasing(
    r_vals: npt.NDArray[np.float64],
    w_bot: Any,
    w_top: Any,
    w_bot_scalar: float,
    w_top_scalar: float,
    r_base_local_in_orig: Any,
    opts: dict,
) -> npt.NDArray[np.float64]:
    """Apply median3 circular anti-aliasing.
    
    Args:
        r_vals: Current radius array
        w_bot: Bottom window weights
        w_top: Top window weights
        w_bot_scalar: Bottom weight scalar
        w_top_scalar: Top weight scalar
        r_base_local_in_orig: Original inward base
        opts: Options dictionary
        
    Returns:
        Anti-aliased radius array

    """
    try:
        med3_passes = max(0, int(opts.get("lp_median3_passes", 0)))
        med3_strength = max(0.0, min(1.0, float(opts.get("lp_median3_strength", 1.0))))

        if med3_passes > 0 and med3_strength > 0.0:
            arr = np.asarray(r_vals, dtype=float)
            w_any_bot = np.asarray(w_bot, dtype=float) if w_bot_scalar > 0.0 else 0.0
            w_any_top = np.asarray(w_top, dtype=float) if w_top_scalar > 0.0 else 0.0
            w_any = np.maximum(w_any_bot, w_any_top)

            if np.any(w_any > 0.0):
                base_guard = np.asarray(r_base_local_in_orig, dtype=float)
                if base_guard.shape == ():
                    base_guard = np.full_like(arr, float(base_guard))

                for _ in range(med3_passes):
                    smoothed = median3_circular(arr)
                    blend = np.power(np.clip(w_any, 0.0, 1.0), 1.2)
                    arr = (1.0 - med3_strength * blend) * arr + (med3_strength * blend) * smoothed
                    arr = np.minimum(arr, base_guard)

                return arr
    except Exception:
        pass

    return r_vals


def apply_med5_antialiasing(
    r_vals: npt.NDArray[np.float64],
    w_bot: Any,
    w_top: Any,
    w_bot_scalar: float,
    w_top_scalar: float,
    r_base_local_in_orig: Any,
    opts: dict,
) -> npt.NDArray[np.float64]:
    """Apply median5 circular anti-aliasing.
    
    Args:
        r_vals: Current radius array
        w_bot: Bottom window weights
        w_top: Top window weights
        w_bot_scalar: Bottom weight scalar
        w_top_scalar: Top weight scalar
        r_base_local_in_orig: Original inward base
        opts: Options dictionary
        
    Returns:
        Anti-aliased radius array

    """
    try:
        med5_passes = max(0, int(opts.get("lp_median5_passes", 0)))
        med5_strength = max(0.0, min(1.0, float(opts.get("lp_median5_strength", 1.0))))

        if med5_passes > 0 and med5_strength > 0.0:
            arr = np.asarray(r_vals, dtype=float)
            w_any_bot = np.asarray(w_bot, dtype=float) if w_bot_scalar > 0.0 else 0.0
            w_any_top = np.asarray(w_top, dtype=float) if w_top_scalar > 0.0 else 0.0
            w_any = np.maximum(w_any_bot, w_any_top)

            if np.any(w_any > 0.0):
                base_guard = np.asarray(r_base_local_in_orig, dtype=float)
                if base_guard.shape == ():
                    base_guard = np.full_like(arr, float(base_guard))

                for _ in range(med5_passes):
                    smoothed = med5(arr)
                    blend = np.power(np.clip(w_any, 0.0, 1.0), 1.2)
                    arr = (1.0 - med5_strength * blend) * arr + (med5_strength * blend) * smoothed
                    arr = np.minimum(arr, base_guard)

                return arr
    except Exception:
        pass

    return r_vals


def apply_avg3_antialiasing(
    r_vals: npt.NDArray[np.float64],
    w_bot: Any,
    w_top: Any,
    w_bot_scalar: float,
    w_top_scalar: float,
    r_base_local_in_orig: Any,
    opts: dict,
) -> npt.NDArray[np.float64]:
    """Apply avg3 circular anti-aliasing.
    
    Args:
        r_vals: Current radius array
        w_bot: Bottom window weights
        w_top: Top window weights
        w_bot_scalar: Bottom weight scalar
        w_top_scalar: Top weight scalar
        r_base_local_in_orig: Original inward base
        opts: Options dictionary
        
    Returns:
        Anti-aliased radius array

    """
    try:
        avg3_passes = max(0, int(opts.get("lp_avg3_passes", 0)))
        avg3_strength = max(0.0, min(1.0, float(opts.get("lp_avg3_strength", 0.5))))

        if avg3_passes > 0 and avg3_strength > 0.0:
            arr = np.asarray(r_vals, dtype=float)
            w_any_bot = np.asarray(w_bot, dtype=float) if w_bot_scalar > 0.0 else 0.0
            w_any_top = np.asarray(w_top, dtype=float) if w_top_scalar > 0.0 else 0.0
            w_any = np.maximum(w_any_bot, w_any_top)

            if np.any(w_any > 0.0):
                base_guard = np.asarray(r_base_local_in_orig, dtype=float)
                if base_guard.shape == ():
                    base_guard = np.full_like(arr, float(base_guard))

                for _ in range(avg3_passes):
                    smoothed = avg3(arr)
                    reduced = np.minimum(arr, smoothed)
                    blend = np.power(np.clip(w_any, 0.0, 1.0), 1.2)
                    arr = (1.0 - avg3_strength * blend) * arr + (avg3_strength * blend) * reduced
                    arr = np.minimum(arr, base_guard)

                return arr
    except Exception:
        pass

    return r_vals


def apply_outward_mode(
    r_vals: float | NDArrayFloat,
    R_start_bot: npt.NDArray[np.float64],
    R_start_top: npt.NDArray[np.float64],
    dz_bot: Any,
    dz_top: Any,
    m_bot: float,
    m_top: float,
    s_bot: float,
    s_top: float,
    w_bot: Any,
    w_top: Any,
    w_bot_scalar: float,
    w_top_scalar: float,
    r0: float,
    cut_bot_deg: float,
    cut_top_deg: float,
    has_cut: bool,
    smooth_max_func: Any,
) -> float | NDArrayFloat:
    """Apply outward envelope mode with smooth limiting.
    
    Args:
        r_vals: Current radius values
        R_start_bot: Start radius at bottom
        R_start_top: Start radius at top
        dz_bot: Distance from bottom seam
        dz_top: Distance from top seam
        m_bot: Bottom slope
        m_top: Top slope
        s_bot: Bottom softness
        s_top: Top softness
        w_bot: Bottom weights
        w_top: Top weights
        w_bot_scalar: Bottom weight scalar
        w_top_scalar: Top weight scalar
        r0: Base radius
        cut_bot_deg: Bottom cut angle
        cut_top_deg: Top cut angle
        has_cut: Whether cuts are enabled
        smooth_max_func: Smooth max function
        
    Returns:
        Radius with outward mode applied

    """
    if has_cut:
        # Outward cuts mode: prevent outward growth in seam band
        if isinstance(r_vals, np.ndarray):
            in_seam_band = False
            if cut_bot_deg > 0.0 and w_bot_scalar > 0.0:
                in_seam_band = True
            if cut_top_deg > 0.0 and w_top_scalar > 0.0:
                in_seam_band = True

            if in_seam_band:
                r0_cap = float(r0)
                return np.minimum(np.asarray(r_vals, dtype=float), r0_cap)
        elif (cut_bot_deg > 0.0 and w_bot > 0.0) or (cut_top_deg > 0.0 and w_top > 0.0):
            return min(float(r_vals), float(r0))
        return r_vals
    # Outward envelope (ridge mode)
    r_req_bot = R_start_bot + dz_bot * m_bot
    r_req_top = R_start_top + dz_top * m_top

    rb = smooth_max_func(r_vals, r_req_bot, s_bot) if np.any(w_bot > 0.0) else r_vals
    rt = smooth_max_func(rb, r_req_top, s_top) if np.any(w_top > 0.0) else rb

    return rt


def apply_uniform_ring_guard(
    r_vals: float | NDArrayFloat,
    r_base_local_in_orig: Any,
    uniform_ring: bool,
) -> float | NDArrayFloat:
    """Apply uniform ring guard to prevent over-trimming.
    
    Args:
        r_vals: Current radius values
        r_base_local_in_orig: Original inward base
        uniform_ring: Whether uniform ring mode is enabled
        
    Returns:
        Guarded radius values

    """
    if uniform_ring:
        r_out_arr = np.asarray(r_vals, dtype=float)
        guard_arr = np.asarray(r_base_local_in_orig, dtype=float)

        if guard_arr.shape == ():
            guard_arr = np.full_like(r_out_arr, float(guard_arr))
        else:
            guard_arr = np.broadcast_to(guard_arr, r_out_arr.shape)

        r_out_arr = np.minimum(r_out_arr, guard_arr)
        return float(r_out_arr) if r_out_arr.shape == () else r_out_arr

    return r_vals
