"""Superellipse Morph style function for PotFoundry.

This module contains the outer radius function for the superellipse_morph pot style.
"""
from __future__ import annotations

import math

import numpy as np

try:
    from numba import njit, prange
    HAS_NUMBA = True
except Exception:
    HAS_NUMBA = False
from typing import Any

from ...types import NDArrayFloat

__all__ = ["r_outer_superellipse_morph"]

if HAS_NUMBA:
    # numba-accelerated exponent path for large grids. Define a typed helper
    # above the style function so static checkers can reference it and the
    # function is available regardless of control-flow during execution.
    @njit(parallel=True)
    def _numba_compute_power(base: np.ndarray, exps: np.ndarray) -> np.ndarray:
        # Expect base shape (n_z, n_theta) or (n_theta,)
        # exps shape (n_z, 1)
        if base.ndim == 1:
            n_theta = base.shape[0]
            n_z = exps.shape[0]
            base2 = np.empty((n_z, n_theta), dtype=np.float64)
            for i in prange(n_z):
                for j in range(n_theta):
                    base2[i, j] = base[j]
            base = base2
        n_z, n_theta = base.shape
        out = np.empty((n_z, n_theta), dtype=np.float64)
        for i in prange(n_z):
            exp_i = exps[i, 0]
            for j in range(n_theta):
                out[i, j] = np.exp(exp_i * np.log(base[i, j]))
        return out
else:
    def _numba_compute_power(base: np.ndarray, exps: np.ndarray) -> np.ndarray:
        # Pure-numpy fallback used when Numba isn't installed; shapes align
        if base.ndim == 1:
            base = np.broadcast_to(base[np.newaxis, :], (exps.shape[0], base.shape[0]))
        return np.exp(exps * np.log(base))

def r_outer_superellipse_morph(
    theta: NDArrayFloat | float, z: float, r0: float, H: float, opts: dict[str, Any],
) -> NDArrayFloat | float:
    z_arr = np.asarray(z)
    # Normalize z_arr to 1D for per-z operations (accept shape (n_z,) or (n_z,1))
    if z_arr.ndim > 1 and z_arr.shape[1] == 1:
        z_flat = z_arr.ravel()
    else:
        z_flat = z_arr
    t = z_flat / float(H) if H > 0 else 0.0
    th = np.asarray(theta, dtype=float)
    is_grid = th.ndim == 2
    # If a multi-z theta grid is passed (shape (n_z, n_theta)), keep it as-is
    is_grid = th.ndim == 2

    # Prefer precomputed cos/sin arrays if provided by caller to avoid re-computation
    cos_th = opts.get("_pf_cos_th")
    sin_th = opts.get("_pf_sin_th")
    if cos_th is None:
        cos_th = np.cos(th)
    if sin_th is None:
        sin_th = np.sin(th)

    m_base = float(opts.get("se_m_base", 2.0))
    m_top = float(opts.get("se_m_top", 5.5))
    m_curve = float(opts.get("se_m_curve_exp", 1.1))
    # Compute morph exponent per z (support scalar or array z)
    m_exp = m_base + (m_top - m_base) * (np.asarray(t) ** m_curve)

    # If m_exp is an array (multi-z), broadcast over theta for exponentiation
    if np.asarray(m_exp).ndim > 0:
        m_exp_arr = np.asarray(m_exp, dtype=float)
        m_exp_grid = m_exp_arr[:, np.newaxis]  # shape (n_z, 1)
        if is_grid:
            cos_base = np.asarray(cos_th, dtype=float)
            # if cos_th is 1D, tile to (n_z, n_theta)
            if cos_base.ndim == 1:
                cos_base = np.broadcast_to(cos_base[np.newaxis, :], (m_exp_arr.shape[0], cos_base.size))
            sin_base = np.asarray(sin_th, dtype=float)
            if sin_base.ndim == 1:
                sin_base = np.broadcast_to(sin_base[np.newaxis, :], (m_exp_arr.shape[0], sin_base.size))
        else:
            cos_base = np.asarray(cos_th, dtype=float)[np.newaxis, :]
            sin_base = np.asarray(sin_th, dtype=float)[np.newaxis, :]
        # Use exp/log trick to compute pow more efficiently and avoid slow `**` on arrays
        abs_cos = np.maximum(np.abs(cos_base), 1e-12)
        abs_sin = np.maximum(np.abs(sin_base), 1e-12)
        # If m_exp has only a few unique values, compute each unique exponent once
        unique_exps, inverse_idx = np.unique(m_exp_arr, return_inverse=True)
        if unique_exps.size <= 8:
            c = np.empty((m_exp_arr.shape[0], cos_base.shape[1]), dtype=float)
            s = np.empty_like(c)
            for ui, ue in enumerate(unique_exps):
                rows = np.where(inverse_idx == ui)[0]
                val_c = np.exp(ue * np.log(abs_cos))
                val_s = np.exp(ue * np.log(abs_sin))
                # val_c and val_s will be 1D (n_theta,) or 2D (n_z, n_theta)
                for r in rows:
                    c[r, :] = val_c if val_c.ndim == 1 else val_c[r, :]
                    s[r, :] = val_s if val_s.ndim == 1 else val_s[r, :]
        # If Numba available and shape is large, use the numba-accelerated path
        elif HAS_NUMBA and m_exp_arr.size > 16:
            # Defer to numba-accelerated loop for performance on large grids
            try:
                c = _numba_compute_power(abs_cos, m_exp_grid)
                s = _numba_compute_power(abs_sin, m_exp_grid)
            except Exception:
                c = np.exp(m_exp_grid * np.log(abs_cos))
                s = np.exp(m_exp_grid * np.log(abs_sin))
        else:
            c = np.exp(m_exp_grid * np.log(abs_cos))
            s = np.exp(m_exp_grid * np.log(abs_sin))
    else:
        c = np.abs(cos_th) ** float(m_exp)
        s = np.abs(sin_th) ** float(m_exp)
    # Compute rf; handle scalar and array m_exp
    if np.asarray(m_exp).ndim > 0:
        rf = np.exp((-1.0 / m_exp_grid) * np.log(np.maximum(c + s, 1e-12)))
    else:
        rf = (c + s) ** (-1.0 / max(float(m_exp), 1e-9))

    c4a = float(opts.get("se_c4_amp", 0.08))
    c4p = float(opts.get("se_c4_phase_deg", 23.0)) * math.pi / 180.0
    c8a = float(opts.get("se_c8_amp", 0.03))
    c8p = float(opts.get("se_c8_phase_deg", 0.0)) * math.pi / 180.0
    rf *= 1.0 + c4a * np.cos(4.0 * th + c4p) + c8a * np.cos(8.0 * th + c8p)

    out = r0 * rf
    return float(out) if np.isscalar(theta) else out
# Vectorize-supported style
r_outer_superellipse_morph.__vectorized__ = True


    



