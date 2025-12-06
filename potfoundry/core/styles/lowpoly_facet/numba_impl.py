"""Numba accelerated per-z helper for LowPolyFacet style.

This module provides a limited Numba-compiled implementation of the
per-z sampling path for LowPolyFacet. It aims to parallelize per-row
computations by reproducing the core faceting and seam-limiting logic
in Numba nopython mode. We intentionally implement a conservative
subset of features for parity and performance: triangle-wave based
modulation, beveling, seam limiting, and optional outward mode basic
behavior.

The implementation is guarded by HAS_NUMBA; if Numba is not available
the functions are no-ops and the accelerated.py graph will fall back
to the original per-z Python loop.
"""
from __future__ import annotations

try:
    from numba import njit, prange
    import math as _m
    import numpy as np
    HAS_NUMBA = True
except Exception:
    HAS_NUMBA = False
    # Dummy placeholders
    def njit(*args, **kwargs):
        def dec(f):
            return f
        return dec
    prange = range
    import math as _m
    import numpy as np

from typing import Any


@njit(cache=True, parallel=True)
def _numba_compute_basic_facet_radius_row(
    theta: np.ndarray,
    n_theta: int,
    theta_offset: float,
    tier_idx: int,
    facets: int,
    jitter_amt: float,
    phase: float,
    p: float,
    amp: float,
    outward_dir: bool,
    out_tri_s: np.ndarray,
    out_f: np.ndarray,
):
    """Compute tri_s and modulation factor f for a row of thetas in-place.

    This mirrors compute_basic_facet_radius core behavior for vectorized
    theta arrays but implemented for Numba.
    """
    # precompute phase
    idx = tier_idx
    if idx < 0:
        idx = 0
    if facets <= 0:
        facets = 1
    seed = (_m.sin((idx + 1) * 1.61803398875))
    phase_idx = (jitter_amt / facets) * 2.0 * _m.pi * seed
    tot_ph = phase + phase_idx + theta_offset

    for j in prange(n_theta):
        th = theta[j]
        x = (facets * (th + tot_ph)) / (2.0 * _m.pi)
        frac = x - _m.floor(x)
        tri = 1.0 - _m.fabs(2.0 * frac - 1.0)
        tri_s = tri ** p
        out_tri_s[j] = tri_s
        if outward_dir:
            out_f[j] = 1.0 + amp * tri_s
        else:
            out_f[j] = 1.0 - amp * (1.0 - tri_s)


@njit(cache=True, parallel=True)
def _numba_apply_seam_limits_row(
    r_base_local_row: np.ndarray,
    r_lim_bot_row: np.ndarray,
    r_lim_top_row: np.ndarray,
    s_bot: float,
    s_top: float,
    out_row: np.ndarray,
):
    # A simple smooth-min approximation: linear interpolation with softness
    # For numba, implement a simple blend rather than log1p-based smooth
    for j in prange(r_base_local_row.shape[0]):
        rb = r_base_local_row[j]
        rbot = r_lim_bot_row[j]
        rtop = r_lim_top_row[j]
        # soft min between rb and rbot
        if s_bot <= 0.0:
            r1 = rb if rb <= rbot else rbot
        else:
            alpha = 1.0 / (1.0 + s_bot)
            r1 = alpha * rb + (1.0 - alpha) * rbot
        if s_top <= 0.0:
            r2 = r1 if r1 <= rtop else rtop
        else:
            alpha = 1.0 / (1.0 + s_top)
            r2 = alpha * r1 + (1.0 - alpha) * rtop
        out_row[j] = r2


@njit(cache=True, parallel=True)
def numba_r_outer_lowpoly_facet_multi_z(
    thetas: np.ndarray,
    z_arr: np.ndarray,
    r0_arr: np.ndarray,
    H: float,
    facets: int,
    jitter_amt: float,
    phase: float,
    p: float,
    amp: float,
    outward_dir: bool,
    tiers: int,
    z_win: float,
    depth_bot0: float,
    depth_top0: float,
    s_bot: float,
    s_top: float,
    use_outward: bool,
    r_start_bot_arr: np.ndarray,
    r_start_top_arr: np.ndarray,
    z_bot_arr: np.ndarray,
    z_top_arr: np.ndarray,
    out_r: np.ndarray,
):
    n_z = z_arr.shape[0]
    n_theta = thetas.shape[0]
    # scratch arrays
    tri_s = np.empty(n_theta, dtype=np.float64)
    f_row = np.empty(n_theta, dtype=np.float64)
    r_base_local = np.empty(n_theta, dtype=np.float64)
    r_lim_bot_row = np.empty(n_theta, dtype=np.float64)
    r_lim_top_row = np.empty(n_theta, dtype=np.float64)

    for i in prange(n_z):
        z = z_arr[i]
        r0 = r0_arr[i]
        # Compute tier index
        t = 0.0 if H <= 0.0 else z / H
        tier_idx = _m.floor(t * tiers)
        if tier_idx < 0:
            tier_idx = 0
        if tier_idx > tiers - 1:
            tier_idx = tiers - 1
        # compute tri_s and f_row
        _numba_compute_basic_facet_radius_row(thetas, n_theta, 0.0, int(tier_idx), facets, jitter_amt, phase, p, amp, outward_dir, tri_s, f_row)
        # r_base_local
        for j in range(n_theta):
            r_base_local[j] = r0 * f_row[j]
        # Determine seam windows
        z_bot = z_bot_arr[i]
        z_top = z_top_arr[i]
        # For simplicity, use provided start radii arrays as r_lim_bot/top
        for j in range(n_theta):
            r_lim_bot_row[j] = r_start_bot_arr[i, j]
            r_lim_top_row[j] = r_start_top_arr[i, j]
        # apply seam limits
        _numba_apply_seam_limits_row(r_base_local, r_lim_bot_row, r_lim_top_row, s_bot, s_top, out_r[i])
        # optionally apply outward guard by ensuring r >= provided r_start_bot/top when z within window
        if use_outward:
            # if z close to bot or top, we blend in outward radii; for simplicity, clamp to max
            for j in range(n_theta):
                if out_r[i, j] < r_start_bot_arr[i, j]:
                    out_r[i, j] = r_start_bot_arr[i, j]
                if out_r[i, j] < r_start_top_arr[i, j]:
                    out_r[i, j] = r_start_top_arr[i, j]
    return True
