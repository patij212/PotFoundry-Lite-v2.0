"""
Superformula Blossom style function for PotFoundry.

This module contains the outer radius function for the superformula_blossom pot style.
"""
from __future__ import annotations

import math
import numpy as np
from numpy.typing import NDArray

from ...types import StyleOpts

__all__ = ["r_outer_superformula_blossom"]

def r_outer_superformula_blossom(
    theta: NDArrayFloat | float, z: float, r0: float, H: float, opts: Dict[str, Any]
) -> NDArrayFloat | float:
    t = z / H if H > 0 else 0.0
    # Style strength controls modulation amount (default 0.0 = neutral for regression parity)
    strength = float(opts.get("sf_strength", 0.0))
    if strength == 0.0:
        # Preserve scalar return for scalar theta; vector for array theta
        th0 = np.asarray(theta, dtype=float)
        return (
            float(r0) if th0.shape == () else np.full_like(th0, float(r0), dtype=float)
        )
    m_base = float(opts.get("sf_m_base", 6.0))
    m_top = float(opts.get("sf_m_top", 10.0))
    m_curve = float(opts.get("sf_m_curve_exp", 1.2))
    m = m_base + (m_top - m_base) * (t**m_curve)

    n1_base = float(opts.get("sf_n1", 0.35))
    n1_top = float(opts.get("sf_n1_top", 0.50))
    n2_base = float(opts.get("sf_n2", 0.8))
    n2_top = float(opts.get("sf_n2_top", 1.4))
    n3_base = float(opts.get("sf_n3", 0.8))
    n3_top = float(opts.get("sf_n3_top", 0.8))

    n1 = n1_base + (n1_top - n1_base) * t
    n2 = n2_base + (n2_top - n2_base) * t
    n3 = n3_base + (n3_top - n3_base) * t

    a = float(opts.get("sf_a", 1.0))
    b = float(opts.get("sf_b", 1.0))
    # IMPORTANT: call with original theta to preserve scalar-return semantics
    rf = superformula_r(theta, m, n1, n2, n3, a=a, b=b)
    # Ensure array-like path always works on numpy arrays; keep scalar for scalar input
    is_scalar_theta = np.isscalar(theta)
    if not is_scalar_theta:
        rf = np.asarray(rf, dtype=float)

    # Helper to sanitize rf values to a safe, finite band
    def _sanitize_rf(val: float | NDArrayFloat) -> float | NDArrayFloat:
        arr = np.asarray(val, dtype=float)
        arr = np.nan_to_num(arr, nan=1.0, posinf=1.0, neginf=1.0)
        # Clamp radius factor to a conservative range
        lo = 0.1
        hi = 3.0
        arr = np.clip(arr, lo, hi)
        return float(arr) if arr.shape == () else cast(NDArrayFloat, arr)

    # Localized edge-preserving seam solidify (optional): peak-only, theta-wise, bilateral-like
    # Goal: suppress tiny jaggies at cut/edge lines without flattening the whole circumference.
    # We only apply this when enabled; it operates on rf before blending to r0.
    if (
        bool(opts.get("sf_edge_solidify_enable", False))
        and isinstance(rf, np.ndarray)
        and (rf.ndim >= 1)
        and (rf.size > 1)
    ):
        # Parameters
        es_strength = max(
            0.0, min(1.0, float(opts.get("sf_edge_solidify_strength", 0.7)))
        )
        es_passes = int(max(1, min(5, int(opts.get("sf_edge_solidify_passes", 2)))))
        # spatial sigma in samples; range sigma on rf
        sigma_s = max(0.5, float(opts.get("sf_edge_solidify_sigma_s", 1.0)))
        sigma_r = max(1e-4, float(opts.get("sf_edge_solidify_sigma_r", 0.15)))
        micro_thresh = float(opts.get("sf_edge_solidify_micro_thresh", 0.09))
        micro_thresh = max(0.0, min(0.5, micro_thresh))
        # New: strong edge protection knobs
        protect_grad = float(opts.get("sf_edge_solidify_protect_grad", 0.12))
        protect_grad = max(0.0, min(0.5, protect_grad))
        preserve_q = float(opts.get("sf_edge_solidify_preserve_q", 0.9))
        preserve_q = max(0.5, min(0.99, preserve_q))
        # Perform circular bilateral smoothing but peak-only (do not raise valleys)
        arr = np.asarray(rf, dtype=float)

        # Use typed helpers from geometry_helpers to avoid inline untyped returns
        def _bilateral1d_peak_only(a: np.ndarray) -> np.ndarray:
            # geometry_helpers functions are not fully typed in some environments
            # so cast their returns to narrow the type for this module.
            return cast(np.ndarray, bilateral1d_peak_only(a, sigma_s, sigma_r))

        # Precompute local micro-residual and edge weights to preserve strong edges
        def _avg3(a: np.ndarray) -> np.ndarray:
            return cast(np.ndarray, avg3(a))

        def _med5(a: np.ndarray) -> np.ndarray:
            return cast(np.ndarray, med5(a))

        for _ in range(es_passes):
            sm = _bilateral1d_peak_only(arr)
            # Micro-only: blend only where residual to median is small (jaggies), preserve large edges
            m5 = _med5(arr)
            avg = _avg3(arr)
            resid = np.maximum(0.0, arr - m5)  # focus on peaks only
            micro_mask = resid <= micro_thresh
            # Edge-preserve 1: gradient protection (skip smoothing on strong edges)
            edge_mag = np.abs(arr - avg)
            protect_mask = edge_mag >= protect_grad
            # Edge-preserve 2: top-quantile preservation of strongest edges
            try:
                thr_q = float(np.quantile(edge_mag, preserve_q))
            except Exception:
                thr_q = float(np.max(edge_mag))
            preserve_mask = edge_mag >= thr_q
            # Effective blend per sample (zero where protected/preserved)
            edge_w = np.clip(edge_mag / max(1e-6, micro_thresh * 2.0), 0.0, 1.0)
            blend = es_strength * (1.0 - edge_w)
            effective_mask = micro_mask & (~protect_mask) & (~preserve_mask)
            arr = np.where(effective_mask, (1.0 - blend) * arr + blend * sm, arr)
        rf = arr
    # Optional edge-taming to reduce ultra-spiky peaks while keeping edges crisp.
    # We apply a saturating remap to delta = rf-1: delta' = delta / sqrt(1 + (delta/k)^2)
    # Then blend by user strength; also an optional auto mode when sf_strength is high.
    tame_strength = float(opts.get("sf_edge_tame_strength", 0.0))
    auto_tame = bool(opts.get("sf_auto_tame", True))
    auto_thresh = float(opts.get("sf_auto_tame_thresh", 0.65))
    # Characteristic scale k controls how strongly peaks are saturated (lower = stronger cap)
    tame_k = max(1e-6, float(opts.get("sf_edge_tame_k", 0.55)))
    apply_tame = (tame_strength > 0.0) or (auto_tame and strength >= auto_thresh)
    if apply_tame:
        # Effective strength: explicit beats auto; otherwise use a modest default
        eff = (
            tame_strength
            if tame_strength > 0.0
            else float(opts.get("sf_auto_tame_amount", 0.45))
        )
        eff = max(0.0, min(1.0, eff))
        delta = rf - 1.0
        delta_s = delta / np.sqrt(1.0 + (delta / tame_k) ** 2.0)
        rf = 1.0 + (1.0 - eff) * delta + eff * delta_s
    # Optional localized spike clipping: reduce only the highest local peaks using a sliding-window quantile.
    # This is more surgical than global taming and avoids flattening the whole profile.
    if (
        bool(opts.get("sf_spike_clip_enable", False))
        and isinstance(rf, np.ndarray)
        and (rf.ndim >= 1)
        and (rf.size > 1)
    ):
        arr = np.asarray(rf, dtype=float)
        q = float(opts.get("sf_spike_clip_quantile", 0.97))
        q = max(0.85, min(0.999, q))
        amt = max(0.0, min(1.0, float(opts.get("sf_spike_clip_amount", 0.7))))
        win = int(opts.get("sf_spike_clip_window", 9))
        if win % 2 == 0:
            win += 1
        win = max(5, min(31, win))
        half = win // 2
        # Build circular window stack and take the quantile along window axis for each theta
        stacks = []
        for o in range(-half, half + 1):
            stacks.append(np.roll(arr, o))
        W = np.stack(stacks, axis=0)
        # quantile index
        k = int(np.clip(int(np.ceil(q * win)) - 1, 0, win - 1))
        W_sorted = np.sort(W, axis=0)
        thr_q_arr = np.asarray(W_sorted[k, :], dtype=float)
        # peak-only clipping toward threshold by amount
        over = arr > thr_q_arr
        arr = np.where(over, thr_q_arr + (1.0 - amt) * (arr - thr_q_arr), arr)
        rf = arr

    # Optional robust MAD-based spike clipping: local median + MAD thresholding (peak-only).
    # Uses gradient and top-quantile edge protection to avoid dulling true edges.
    if (
        bool(opts.get("sf_spike_mad_enable", False))
        and isinstance(rf, np.ndarray)
        and (rf.ndim >= 1)
        and (rf.size > 1)
    ):
        arr = np.asarray(rf, dtype=float)
        ksig_base = float(opts.get("sf_spike_mad_k", 3.2))
        ksig_base = max(0.5, min(8.0, ksig_base))
        amt_base = max(0.0, min(1.0, float(opts.get("sf_spike_mad_amount", 0.85))))
        win = int(opts.get("sf_spike_mad_window", 9))
        if win % 2 == 0:
            win += 1
        win = max(5, min(31, win))
        half = win // 2
        # Window stacks for median and MAD
        stacks = [np.roll(arr, o) for o in range(-half, half + 1)]
        W = np.stack(stacks, axis=0)
        W_sorted = np.sort(W, axis=0)
        med = W_sorted[half, :]
        # MAD = median(|x - med|)
        abs_dev = np.abs(W - med)
        abs_dev_sorted = np.sort(abs_dev, axis=0)
        mad = abs_dev_sorted[half, :]
        sigma = 1.4826 * mad
        # Guard against zero/NaN sigma
        sigma = np.nan_to_num(sigma, nan=0.0, posinf=0.0, neginf=0.0)
        # z-ramped boost (stronger near the rim)
        # Use explicit height scalar to avoid any shadowing from local variables
        t_z = (z / H) if H > 0 else 0.0  # 0..1 height
        if bool(opts.get("sf_spike_mad_z_boost_enable", True)):
            z_start = float(opts.get("sf_spike_mad_z_start", 0.75))
            z_pow = float(opts.get("sf_spike_mad_z_power", 1.5))
            z_pow = max(0.25, min(6.0, z_pow))
            ramp = (
                0.0 if t_z <= z_start else ((t_z - z_start) / max(1e-6, 1.0 - z_start))
            )
            ramp = ramp**z_pow
            k_drop = float(opts.get("sf_spike_mad_k_drop_frac", 0.35))
            k_drop = max(0.0, min(0.95, k_drop))
            amt_boost = float(opts.get("sf_spike_mad_amount_boost", 0.25))
            amt_boost = max(0.0, min(1.0, amt_boost))
            ksig = ksig_base * (1.0 - k_drop * ramp)
            amt = np.clip(amt_base + amt_boost * ramp, 0.0, 1.0)
            # Keep ksig within reasonable bounds even with boost
            ksig = np.clip(ksig, 0.25, 10.0)
        else:
            ksig = ksig_base
            amt = amt_base
        thr = med + ksig * sigma

        # Edge protection borrowed from solidify step (optional, defaults conservative)
        def _avg3(a: np.ndarray) -> np.ndarray:
            return avg3(a)

        edge_mag = np.abs(arr - _avg3(arr))
        protect_grad = float(opts.get("sf_edge_solidify_protect_grad", 0.12))
        protect_grad = max(0.0, min(0.5, protect_grad))
        preserve_q = float(opts.get("sf_edge_solidify_preserve_q", 0.9))
        preserve_q = max(0.5, min(0.99, preserve_q))
        protect_mask = edge_mag >= protect_grad
        try:
            thr_q = float(np.quantile(edge_mag, preserve_q))
        except Exception:
            thr_q = float(np.max(edge_mag))
        preserve_mask = edge_mag >= thr_q
        over = arr > thr
        mask = over & (~protect_mask) & (~preserve_mask)
        arr = np.where(mask, thr + (1.0 - amt) * (arr - thr), arr)
        # Sanitize results
        rf = _sanitize_rf(arr)

    # Optional peak snap: lift local valleys toward a peak envelope so the mesh follows real edges.
    # This reconstructs intended edges by taking a rolling high-quantile and blending up valleys only.
    if (
        bool(opts.get("sf_peak_snap_enable", False))
        and isinstance(rf, np.ndarray)
        and (rf.ndim >= 1)
        and (rf.size > 1)
    ):
        arr = np.asarray(rf, dtype=float)
        win = int(opts.get("sf_peak_snap_window", 9))
        # ensure odd window and within bounds
        if win % 2 == 0:
            win += 1
        win = max(5, min(63, win))
        half = win // 2
        q_hi = float(opts.get("sf_peak_snap_quantile", 0.9))
        q_hi = max(0.7, min(0.995, q_hi))
        amt = float(opts.get("sf_peak_snap_amount", 0.6))
        amt = max(0.0, min(1.0, amt))
        # Build circular window stack and take high quantile along window axis
        stacks = [np.roll(arr, o) for o in range(-half, half + 1)]
        W = np.stack(stacks, axis=0)
        W_sorted = np.sort(W, axis=0)
        k = int(np.clip(int(np.ceil(q_hi * win)) - 1, 0, win - 1))
        env = W_sorted[k, :]
        # Lift valleys only toward the envelope
        mask = arr < env
        arr = np.where(mask, arr + amt * (env - arr), arr)
        rf = arr

    # Optional edge sharpening (contrast boost) over theta to reinforce intended edges
    edge_sharp = float(opts.get("sf_edge_sharp", 0.0))
    if (
        edge_sharp > 0.0
        and isinstance(rf, np.ndarray)
        and (rf.ndim >= 1)
        and (rf.size > 1)
    ):
        # Unsharp mask on rf along theta: rf' = rf + s * (rf - avg3(rf))
        s = max(0.0, min(1.0, edge_sharp))
        rf_roll = (np.roll(rf, 1) + rf + np.roll(rf, -1)) / 3.0
        rf = rf + s * (rf - rf_roll)
    # Final sanitize before blending
    rf = _sanitize_rf(rf)
    # Blend between base and flower using strength
    out = r0 * ((1.0 - strength) + strength * (0.90 + 0.35 * rf))
    # Normalize to numpy array for vectorized paths; keep scalar float for scalar theta
    out_arr = np.asarray(out, dtype=float)
    return float(out_arr) if out_arr.shape == () else cast(NDArrayFloat, out_arr)



