"""Grid generation and caching for mesh building.

This module handles the generation of theta (angular) and z (vertical) grids
used in mesh construction. It includes:

- Cached theta grid generation (LRU cache for performance)
- Z-grid refinement for LowPolyFacet style seam handling
- Helper utilities for grid manipulation

The grids define the sampling points where vertices are placed when building
the pot mesh.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any

import numpy as np
from numpy.typing import NDArray

__all__ = [
    "refine_z_outer_for_seams",
    "theta_grid_cached",
]


@lru_cache(maxsize=8)
def theta_grid_cached(
    n_theta: int,
) -> tuple[NDArray[np.float64], NDArray[np.float64], NDArray[np.float64]]:
    """Generate cached theta (angular) grid with LRU caching for performance.
    
    Creates evenly-spaced angular values from 0 to 2π (exclusive of endpoint)
    for sampling around the pot's circumference, along with pre-computed
    cosine and sine values for efficiency.
    
    Args:
        n_theta: Number of angular divisions (e.g., 64, 128, 256, 512)
        
    Returns:
        Tuple of (thetas, cos_thetas, sin_thetas) where:
        - thetas: Array of shape (n_theta,) with angular values in radians
        - cos_thetas: Precomputed cosine values
        - sin_thetas: Precomputed sine values
        
    Note:
        Uses LRU cache (maxsize=8) to avoid regenerating common grid sizes.
        This significantly improves performance when building multiple pots
        with the same resolution settings.

    """
    thetas = np.linspace(0, 2 * np.pi, n_theta, endpoint=False, dtype=np.float64)
    return thetas, np.cos(thetas), np.sin(thetas)


def refine_z_outer_for_seams(
    z_outer: NDArray[np.float64],
    H: float,
    style_opts: dict[str, Any],
) -> NDArray[np.float64]:
    """Optionally refine z sampling near LowPolyFacet tier seams.

    Preserves prior behavior by reading LowPolyFacet-related keys from style_opts
    and inserting additional z-rings around seam planes and window edges.

    Args:
        z_outer: Base z sampling for the outer wall (uniform grid by default)
        H: Total height
        style_opts: Style options dict

    Returns:
        Refined z array (may be identical to input if no refinement is needed)
        
    Note:
        This is specific to LowPolyFacet style tier handling. The additional
        z-levels ensure vertices are placed exactly at tier boundaries and
        window edges for proper seam rendering and cut angle handling.

    """
    try:
        _tiers = (
            int(style_opts.get("lp_tiers", 1)) if isinstance(style_opts, dict) else 1
        )
        _cut_bot = (
            float(style_opts.get("lp_cut_bot_deg", 0.0))
            if isinstance(style_opts, dict)
            else 0.0
        )
        _cut_top = (
            float(style_opts.get("lp_cut_top_deg", 0.0))
            if isinstance(style_opts, dict)
            else 0.0
        )
        _has_cuts = (_tiers > 1) and ((_cut_bot > 0.0) or (_cut_top > 0.0))
        if not (_has_cuts and H > 0):
            return z_outer
        h_tier = H / max(1, _tiers)
        z_win_raw = (
            float(style_opts.get("lp_cut_z_window_frac", 0.12))
            if isinstance(style_opts, dict)
            else 0.12
        )
        z_win_frac = (z_win_raw * 0.01) if z_win_raw > 1.0 else z_win_raw
        z_win = max(1e-6, z_win_frac * h_tier)
        sampling_boost = (
            int(style_opts.get("lp_seam_sampling_boost", 2))
            if isinstance(style_opts, dict)
            else 2
        )
        offs_edge = z_win
        offs_mid_vals = [0.66 * z_win, 0.33 * z_win]
        if sampling_boost >= 2:
            offs_mid_vals.append(0.16 * z_win)
        if sampling_boost >= 3:
            offs_mid_vals.append(0.83 * z_win)
        add_zs: list[float] = []
        for k in range(1, _tiers):
            z_seam = (k / _tiers) * H
            seq = (
                [-offs_edge]
                + [-v for v in sorted(offs_mid_vals, reverse=True)]
                + [0.0]
                + sorted(offs_mid_vals)
                + [offs_edge]
            )
            for dz in seq:
                zc = z_seam + dz
                if (zc > 1e-9) and (zc < H - 1e-9):
                    add_zs.append(float(zc))
        if add_zs:
            z_out = np.unique(
                np.concatenate([z_outer, np.array(add_zs, dtype=float)]),
            ).astype(float)
            return z_out
        return z_outer
    except Exception:
        # Fail-safe: keep original uniform z if any issue arises
        return z_outer
