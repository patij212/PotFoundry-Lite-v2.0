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
    "theta_grid_cached",
    "refine_z_outer_for_seams",
]


@lru_cache(maxsize=8)
def theta_grid_cached(n_theta: int) -> NDArray[np.float64]:
    """Generate cached theta (angular) grid with LRU caching for performance.
    
    Creates evenly-spaced angular values from 0 to 2π (exclusive of endpoint)
    for sampling around the pot's circumference.
    
    Args:
        n_theta: Number of angular divisions (e.g., 128, 256, 512)
        
    Returns:
        Array of shape (n_theta,) with angular values in radians
        
    Note:
        Uses LRU cache (maxsize=8) to avoid regenerating common grid sizes.
        This significantly improves performance when building multiple pots
        with the same resolution settings.
    """
    return np.linspace(0, 2 * np.pi, n_theta, endpoint=False, dtype=np.float64)


def refine_z_outer_for_seams(
    z_outer: NDArray[np.float64],
    style_name: str | None,
    style_opts: dict[str, Any],
) -> NDArray[np.float64]:
    """Refine z-grid for LowPolyFacet style to handle tier seams properly.
    
    When using LowPolyFacet style with enable_seams=True, this function adds
    additional z-levels at tier boundaries to ensure clean seam rendering.
    For other styles, returns the original z-grid unchanged.
    
    Args:
        z_outer: Original z-grid array
        style_name: Name of the style being used (e.g., "LowPolyFacet")
        style_opts: Style-specific options dictionary
        
    Returns:
        Refined z-grid with additional seam levels if applicable,
        otherwise the original z_outer array
        
    Note:
        This is specific to LowPolyFacet style tier handling. The additional
        z-levels ensure vertices are placed exactly at tier boundaries for
        proper seam rendering.
    """
    try:
        # Only refine for LowPolyFacet style with seams enabled
        if style_name != "LowPolyFacet":
            return z_outer
            
        enable_seams = style_opts.get("enable_seams", False)
        if not enable_seams:
            return z_outer
            
        # Get tier configuration
        n_tiers = style_opts.get("n_tiers", 3)
        if n_tiers <= 1:
            return z_outer
            
        # Calculate tier boundaries and add them to z-grid
        # This ensures vertices are placed at exact seam locations
        add_zs = []
        for i in range(1, n_tiers):
            frac = i / n_tiers
            add_zs.append(frac)
            
        if add_zs:
            # Merge original z values with seam z values and remove duplicates
            z_out = np.unique(
                np.concatenate([z_outer, np.array(add_zs, dtype=float)])
            ).astype(float)
            return z_out
            
        return z_outer
        
    except Exception:
        # Fail-safe: keep original uniform z if any issue arises
        return z_outer
