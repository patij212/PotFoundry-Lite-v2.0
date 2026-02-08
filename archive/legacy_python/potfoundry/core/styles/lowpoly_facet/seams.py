"""Seam handling for LowPolyFacet style.

This module contains the logic for creating and managing seam cuts
between tiers, including V-groove geometry, window weights, and
straight edge flattening.
"""
from __future__ import annotations

import math
from collections.abc import Callable
from typing import Any

import numpy as np
import numpy.typing as npt

from ....types import NDArrayFloat
from ...geometry_helpers import (
    facet_mod_for_tier_scalar,
    facet_mod_for_tier_vector,
    smooth_max,
    smooth_min,
)
from .utils import base_radius


def compute_tier_boundaries(
    z: float,
    H: float,
    tiers: int,
) -> tuple[int, float, float]:
    """Compute tier index and boundary heights for current position.
    
    Args:
        z: Current height in mm
        H: Total pot height in mm
        tiers: Number of tiers
        
    Returns:
        Tuple of (tier_index, z_bottom, z_top)

    """
    t = z / H if H > 0 else 0.0
    tier_pos = t * tiers
    k = int(np.floor(tier_pos))
    k = min(max(k, 0), tiers - 1)
    z_bot = (k / tiers) * H
    z_top = ((k + 1) / tiers) * H
    return k, z_bot, z_top


def create_facet_mod_helpers(
    th: npt.NDArray[np.float64],
    facets: int,
    jitter_amt: float,
    phase: float,
    p: float,
    amp: float,
    outward_dir: bool,
) -> tuple[Callable[[int], np.ndarray], Callable[[float, int], float]]:
    """Create helper functions for facet modulation at different tiers.
    
    Args:
        th: Theta array
        facets: Number of facets
        jitter_amt: Jitter amount
        phase: Phase offset
        p: Power for bevel
        amp: Amplitude
        outward_dir: Direction flag
        
    Returns:
        Tuple of (vector_function, scalar_function)

    """
    def _facet_mod_for_tier(tier_index: int) -> np.ndarray:
        return facet_mod_for_tier_vector(
            th, tier_index, facets, jitter_amt, phase, p, amp, outward_dir,
        )

    def _facet_mod_scalar(theta_scalar: float, tier_index: int) -> float:
        return facet_mod_for_tier_scalar(
            theta_scalar, tier_index, facets, jitter_amt, phase, p, amp, outward_dir,
        )

    return _facet_mod_for_tier, _facet_mod_scalar


def compute_seam_radii(
    z_bot: float,
    z_top: float,
    H: float,
    r0: float,
    k: int,
    tiers: int,
    facet_mod_for_tier: Callable[[int], np.ndarray],
    opts: dict,
) -> tuple[np.ndarray, np.ndarray]:
    """Compute start-line radii at seam boundaries.
    
    Args:
        z_bot: Bottom of tier in mm
        z_top: Top of tier in mm
        H: Total height in mm
        r0: Base radius at current height
        k: Current tier index
        tiers: Total number of tiers
        facet_mod_for_tier: Function to get modulation for a tier
        opts: Style options
        
    Returns:
        Tuple of (R_start_bot, R_start_top) arrays

    """
    Rb = float(opts.get("_pf_rb", 0.0))
    Rt = float(opts.get("_pf_rt", 0.0))
    expn = float(opts.get("_pf_expn", 1.0))

    r0_bot = base_radius(
        z_bot, H, Rb if Rb > 0 else r0, Rt if Rt > 0 else r0, expn, opts,
    )
    r0_top = base_radius(
        z_top, H, Rb if Rb > 0 else r0, Rt if Rt > 0 else r0, expn, opts,
    )

    # Start-line radii at seams: R_start = max(R_lo, R_hi)
    f_k = facet_mod_for_tier(k)
    s_k_at_bot = r0_bot * f_k
    s_k_at_top = r0_top * f_k

    if k > 0:
        f_km1 = facet_mod_for_tier(k - 1)
        s_km1_at_bot = r0_bot * f_km1
    else:
        s_km1_at_bot = s_k_at_bot

    if k < (tiers - 1):
        f_kp1 = facet_mod_for_tier(k + 1)
        s_kp1_at_top = r0_top * f_kp1
    else:
        s_kp1_at_top = s_k_at_top

    R_start_bot = np.maximum(s_km1_at_bot, s_k_at_bot)
    R_start_top = np.maximum(s_k_at_top, s_kp1_at_top)

    return R_start_bot, R_start_top


def compute_seam_angles_and_slopes(
    cut_bot_deg: float,
    cut_top_deg: float,
    print_safe: bool,
) -> tuple[float, float]:
    """Compute slopes for seam cuts from angles.
    
    Args:
        cut_bot_deg: Bottom cut angle in degrees
        cut_top_deg: Top cut angle in degrees
        print_safe: Whether print-safe mode is enabled
        
    Returns:
        Tuple of (slope_bottom, slope_top)

    """
    if print_safe:
        a_bot = min(math.radians(50.0), math.radians(cut_bot_deg))
        a_top = min(math.radians(50.0), math.radians(cut_top_deg))
    else:
        a_bot = min(math.radians(60.0), math.radians(cut_bot_deg))
        a_top = min(math.radians(60.0), math.radians(cut_top_deg))

    m_bot = math.tan(a_bot)
    m_top = math.tan(a_top)

    return m_bot, m_top


def create_smooth_helpers() -> tuple[Callable, Callable]:
    """Create smooth max/min helper functions.
    
    Returns:
        Tuple of (smooth_max_func, smooth_min_func)

    """
    def _smooth_max(
        a: float | NDArrayFloat, b: float | NDArrayFloat, s: float,
    ) -> float | NDArrayFloat:
        return smooth_max(a, b, float(s))

    def _smooth_min(
        a: float | NDArrayFloat, b: float | NDArrayFloat, s: float,
    ) -> float | NDArrayFloat:
        return smooth_min(a, b, float(s))

    return _smooth_max, _smooth_min


def compute_window_parameters(
    H: float,
    tiers: int,
    bevel: float,
    outward_dir: bool,
    print_safe: bool,
    r0: float,
    amp: float,
    m_bot: float,
    m_top: float,
    opts: dict,
) -> tuple[float, float, float, float, float, float, float, float]:
    """Compute windowing parameters for seam cuts.
    
    Returns:
        Tuple of (z_win, cut_cap_mm, facet_span_mm, cut_soft_mm, 
                  s_bot, s_top, depth_bot0, depth_top0)

    """
    h_tier = H / tiers if tiers > 0 else 0.0
    bev = max(0.0, min(1.0, bevel))

    # Narrow z window for cuts around each seam
    z_win_raw = float(opts.get("lp_cut_z_window_frac", 0.12))
    z_win_frac = (z_win_raw * 0.01) if z_win_raw > 1.0 else z_win_raw
    z_win = max(1e-6, z_win_frac * h_tier)

    if outward_dir:
        z_win *= 0.9
    if print_safe:
        z_win *= 0.9

    # Radial cap and facet span
    cut_cap_mm = float(opts.get("lp_cut_cap_mm", 0.8))
    facet_span_mm = float(r0 * amp)

    # Softness parameters
    cut_soft_mm = max(1e-4, float(opts.get("lp_cut_softness_mm", 0.03)))
    t_blend_z = h_tier * (0.12 * max(0.15, bev))
    s_bot = min(cut_soft_mm, max(1e-6, 0.35 * max(1e-6, m_bot) * t_blend_z))
    s_top = min(cut_soft_mm, max(1e-6, 0.35 * max(1e-6, m_top) * t_blend_z))

    # Hard cap softness
    s_cap = 0.3 * z_win
    s_bot = min(s_bot, s_cap)
    s_top = min(s_top, s_cap)

    # Cut depths
    cut_depth_frac = max(0.0, float(opts.get("lp_cut_depth_frac_of_facet", 0.0)))
    base_cap_mm = (cut_depth_frac * facet_span_mm) if cut_depth_frac > 0.0 else cut_cap_mm

    cut_bot_deg = max(0.0, float(opts.get("lp_cut_bot_deg", 0.0)))
    cut_top_deg = max(0.0, float(opts.get("lp_cut_top_deg", 0.0)))

    depth_bot0 = min(base_cap_mm, z_win * m_bot) if cut_bot_deg > 0.0 else 0.0
    depth_top0 = min(base_cap_mm, z_win * m_top) if cut_top_deg > 0.0 else 0.0

    return z_win, cut_cap_mm, facet_span_mm, cut_soft_mm, s_bot, s_top, depth_bot0, depth_top0


def compute_window_weights(
    z: float,
    z_bot: float,
    z_top: float,
    z_win: float,
) -> tuple[Any, Any, float, float]:
    """Compute window weights for seam blending.
    
    Args:
        z: Current height
        z_bot: Bottom seam height
        z_top: Top seam height
        z_win: Window size
        
    Returns:
        Tuple of (w_bot, w_top, w_bot_scalar, w_top_scalar)

    """
    dz_bot = np.maximum(0.0, z - z_bot)
    dz_top = np.maximum(0.0, z_top - z)

    w_bot = np.clip(1.0 - (dz_bot / z_win), 0.0, 1.0)
    w_top = np.clip(1.0 - (dz_top / z_win), 0.0, 1.0)

    # Cache scalar forms
    if isinstance(w_bot, np.ndarray):
        w_bot_scalar = float(np.clip(np.max(w_bot), 0.0, 1.0)) if w_bot.size else 0.0
    else:
        w_bot_scalar = float(np.clip(float(w_bot), 0.0, 1.0))

    if isinstance(w_top, np.ndarray):
        w_top_scalar = float(np.clip(np.max(w_top), 0.0, 1.0)) if w_top.size else 0.0
    else:
        w_top_scalar = float(np.clip(float(w_top), 0.0, 1.0))

    return w_bot, w_top, w_bot_scalar, w_top_scalar


def apply_seam_limits(
    r0: float,
    r_base_local: Any,
    depth_bot0: float,
    depth_top0: float,
    w_bot: Any,
    w_top: Any,
    uniform_ring: bool,
    straight_edge: bool,
) -> tuple[Any, Any]:
    """Compute radius limits for seam cuts.
    
    Args:
        r0: Base radius
        r_base_local: Local base radius
        depth_bot0: Bottom cut depth
        depth_top0: Top cut depth
        w_bot: Bottom window weights
        w_top: Top window weights
        uniform_ring: Whether uniform ring mode is enabled
        straight_edge: Whether straight edge mode is enabled
        
    Returns:
        Tuple of (r_lim_bot, r_lim_top)

    """
    if uniform_ring or straight_edge:
        r_lim_bot = np.maximum(1e-6, r0 - depth_bot0 * w_bot)
        r_lim_top = np.maximum(1e-6, r0 - depth_top0 * w_top)
    else:
        r_ref_bot = r_base_local
        r_ref_top = r_base_local
        r_lim_bot = np.maximum(1e-6, r_ref_bot - depth_bot0 * w_bot)
        r_lim_top = np.maximum(1e-6, r_ref_top - depth_top0 * w_top)

    return r_lim_bot, r_lim_top


def compute_straight_edge_targets(
    r0: float,
    depth_bot0: float,
    depth_top0: float,
    cut_bot_deg: float,
    cut_top_deg: float,
    uniform_ring: bool,
    r_base_local_in_orig: Any,
) -> tuple[float | npt.NDArray[np.float64], float | npt.NDArray[np.float64], Any]:
    """Compute target radii for straight edge flattening.
    
    Args:
        r0: Base radius
        depth_bot0: Bottom cut depth
        depth_top0: Top cut depth
        cut_bot_deg: Bottom cut angle
        cut_top_deg: Top cut angle
        uniform_ring: Whether uniform ring mode is enabled
        r_base_local_in_orig: Original inward base
        
    Returns:
        Tuple of (r_uniform_bot_target, r_uniform_top_target, uniform_flat_target)

    """
    if uniform_ring:
        base_in_arr = np.asarray(r_base_local_in_orig, dtype=float)
        uniform_flat_target = float(np.min(base_in_arr))
        uniform_target_scalar = max(1e-6, uniform_flat_target)
        r_uniform_bot_target = uniform_target_scalar
        r_uniform_top_target = uniform_target_scalar
    else:
        uniform_flat_target = None
        if cut_bot_deg > 0.0:
            uniform_target_bot = float(r0) - depth_bot0
            r_uniform_bot_target = max(1e-6, uniform_target_bot)
        else:
            r_uniform_bot_target = float(r0)

        if cut_top_deg > 0.0:
            uniform_target_top = float(r0) - depth_top0
            r_uniform_top_target = max(1e-6, uniform_target_top)
        else:
            r_uniform_top_target = float(r0)

    return r_uniform_bot_target, r_uniform_top_target, uniform_flat_target


def apply_seam_cuts_with_smooth_limiting(
    r_base: Any,
    r_lim_bot: Any,
    r_lim_top: Any,
    s_bot: float,
    s_top: float,
    smooth_min_func: Any,
) -> Any:
    """Apply seam cuts using smooth minimum limiting.
    
    Args:
        r_base: Base radius values
        r_lim_bot: Bottom limit
        r_lim_top: Top limit
        s_bot: Bottom softness
        s_top: Top softness
        smooth_min_func: Smooth minimum function
        
    Returns:
        Radius with seam cuts applied

    """
    r_cut_bot = smooth_min_func(r_base, r_lim_bot, s_bot)
    r_cut_both = smooth_min_func(r_cut_bot, r_lim_top, s_top)
    return r_cut_both


def prepare_numba_aux_arrays(
    thetas: np.ndarray,
    z_array: np.ndarray,
    H: float,
    r0_array: np.ndarray,
    opts: dict,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, float, float, float, float, np.ndarray, np.ndarray]:
    """Prepare per-z arrays and scalars for numba-accelerated path.

    Returns:
        r_start_bot_arr (n_z, n_theta), r_start_top_arr (n_z, n_theta),
        z_bot_arr (n_z,), z_top_arr (n_z,), z_win, depth_bot0, depth_top0,
        s_bot, s_top
    """
    n_z = z_array.shape[0]
    n_theta = thetas.shape[0]
    r_start_bot_arr = np.empty((n_z, n_theta), dtype=float)
    r_start_top_arr = np.empty((n_z, n_theta), dtype=float)
    z_bot_arr = np.empty(n_z, dtype=float)
    z_top_arr = np.empty(n_z, dtype=float)

    # Extract params from opts
    from .parameters import extract_params
    params = extract_params(opts)
    # Create facet mod helpers
    facet_mod_for_tier, _facet_mod_scalar = create_facet_mod_helpers(
        thetas, params.facets, params.jitter_amt, params.phase, params.bevel,
        params.amp, params.outward_dir,
    )

    for i in range(n_z):
        z = float(z_array[i])
        k, z_bot, z_top = compute_tier_boundaries(z, H, params.tiers)
        z_bot_arr[i] = z_bot
        z_top_arr[i] = z_top
        _r0 = float(r0_array[i])
        Rb = float(opts.get("_pf_rb", 0.0))
        Rt = float(opts.get("_pf_rt", 0.0))
        expn = float(opts.get("_pf_expn", 1.0))
        R_start_bot, R_start_top = compute_seam_radii(
            z_bot, z_top, H, _r0, k, params.tiers, facet_mod_for_tier, opts,
        )
        r_start_bot_arr[i, :] = R_start_bot
        r_start_top_arr[i, :] = R_start_top

    # Window parameters (scalar per style instance)
    m_bot, m_top = compute_seam_angles_and_slopes(
        params.cut_bot_deg, params.cut_top_deg, params.print_safe,
    )
    z_win, cut_cap_mm, facet_span_mm, cut_soft_mm, s_bot, s_top, depth_bot0, depth_top0 = (
        compute_window_parameters(
            H, params.tiers, params.bevel, params.outward_dir,
            params.print_safe, float(r0_array[0]) if r0_array.size > 0 else 0.0,
            params.amp, m_bot, m_top, opts,
        )
    )

    return (
        r_start_bot_arr,
        r_start_top_arr,
        z_bot_arr,
        z_top_arr,
        z_win,
        depth_bot0,
        depth_top0,
        s_bot,
        s_top,
        params.facets,
        params.jitter_amt,
        params.phase,
        1.0 + 3.0 * params.bevel,
        params.amp,
        params.outward_dir,
        params.tiers,
    )


def prepare_numba_aux_arrays_vectorized(
    thetas: np.ndarray,
    z_array: np.ndarray,
    H: float,
    r0_array: np.ndarray,
    opts: dict,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, float, float, float, float, int, float, float, float, float, bool, int]:
    """Vectorized preparation of per-z arrays for numba-accelerated path.

    Returns the same tuple as `prepare_numba_aux_arrays` but uses vectorized
    operations with NumPy, avoiding Python-level loops over z when possible.
    """
    from .parameters import extract_params
    params = extract_params(opts)

    n_z = z_array.shape[0]
    n_theta = thetas.shape[0]

    # Compute tier index per z
    t = np.where(H == 0, 0.0, np.clip(z_array / H, 0.0, 1.0))
    tier_pos = t * params.tiers
    k_arr = np.floor(tier_pos).astype(int)
    k_arr = np.clip(k_arr, 0, params.tiers - 1)

    # Compute z_bot and z_top per z
    z_bot_arr = (k_arr / params.tiers) * H
    z_top_arr = ((k_arr + 1) / params.tiers) * H

    # r0 at bot/top for each z
    Rb = float(opts.get("_pf_rb", 0.0))
    Rt = float(opts.get("_pf_rt", 0.0))
    expn = float(opts.get("_pf_expn", 1.0))
    r0_bot_arr = base_radius(z_bot_arr, H, Rb if Rb > 0 else r0_array, Rt if Rt > 0 else r0_array, expn, opts)
    r0_top_arr = base_radius(z_top_arr, H, Rb if Rb > 0 else r0_array, Rt if Rt > 0 else r0_array, expn, opts)

    # Precompute facet mod for every tier, shape (tiers, n_theta)
    from ...core.geometry_helpers import facet_mod_for_tier_vector as _fvec
    T = max(1, params.facets)
    facets = int(params.facets)
    f_all = np.empty((params.tiers, n_theta), dtype=float)
    p = 1.0 + 3.0 * max(0.0, min(1.0, params.bevel))
    for ti in range(params.tiers):
        f_all[ti, :] = _fvec(thetas, ti, facets, params.jitter_amt, params.phase, p, params.amp, params.outward_dir)

    # For each z row, pick f for k, k-1, k+1
    f_k = f_all[k_arr]
    # safe index arrays for neighbors
    km1_idx = np.clip(k_arr - 1, 0, params.tiers - 1)
    kp1_idx = np.clip(k_arr + 1, 0, params.tiers - 1)
    f_km1 = f_all[km1_idx]
    f_kp1 = f_all[kp1_idx]

    # Compute s arrays for bot/top
    s_k_at_bot = (np.asarray(r0_bot_arr, dtype=float)[:, np.newaxis]) * f_k
    s_k_at_top = (np.asarray(r0_top_arr, dtype=float)[:, np.newaxis]) * f_k
    s_km1_at_bot = (np.asarray(r0_bot_arr, dtype=float)[:, np.newaxis]) * f_km1
    s_kp1_at_top = (np.asarray(r0_top_arr, dtype=float)[:, np.newaxis]) * f_kp1

    R_start_bot_arr = np.maximum(s_km1_at_bot, s_k_at_bot)
    R_start_top_arr = np.maximum(s_k_at_top, s_kp1_at_top)

    # Compute window parameters once
    m_bot, m_top = compute_seam_angles_and_slopes(params.cut_bot_deg, params.cut_top_deg, params.print_safe)
    z_win, _, _, _, s_bot, s_top, depth_bot0, depth_top0 = compute_window_parameters(
        H, params.tiers, params.bevel, params.outward_dir, params.print_safe, float(r0_array[0]) if r0_array.size > 0 else 0.0, params.amp, m_bot, m_top, opts,
    )

    return (
        R_start_bot_arr, R_start_top_arr, z_bot_arr, z_top_arr,
        z_win, depth_bot0, depth_top0, s_bot, s_top,
        params.facets, params.jitter_amt, params.phase, 1.0 + 3.0 * params.bevel, params.amp, params.outward_dir, params.tiers,
    )
