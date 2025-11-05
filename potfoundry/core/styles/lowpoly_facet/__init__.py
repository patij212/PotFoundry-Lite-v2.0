"""
LowPolyFacet style package.

This package contains the lowpoly_facet style function decomposed into
focused modules for better maintainability.

The main entry point is r_outer_lowpoly_facet which orchestrates the
faceting algorithm.
"""
from __future__ import annotations

from typing import Dict

import numpy as np
import numpy.typing as npt

from ....types import NDArrayFloat
from .core import compute_basic_facet_radius
from .parameters import extract_params, has_cuts, has_edge_cut
from .utils import base_radius

# Import the original function for now - we'll gradually refactor
# the complex seam logic in future iterations
from ._legacy import r_outer_lowpoly_facet as _r_outer_lowpoly_facet_original


__all__ = ["r_outer_lowpoly_facet", "base_radius"]


def r_outer_lowpoly_facet(
    theta: npt.ArrayLike | float,
    z: float,
    r0: float | npt.NDArray[np.float64],
    H: float,
    opts: Dict,
) -> float | npt.NDArray[np.float64]:
    """Generate outer radius for lowpoly facet style.
    
    Creates a low-poly faceted appearance with optional tier-based cuts,
    edge trimming, and advanced print-safe features.
    
    This is a complex style function with many features:
    - Configurable number of facets and tiers
    - Inward or outward facet directions
    - Seam cuts for overhang mitigation
    - Edge trimming and print-safe mode
    - Experimental flattening and anti-aliasing
    
    Args:
        theta: Angular coordinate(s) in radians (scalar or array)
        z: Height coordinate in mm (scalar)
        r0: Base radius at height z in mm (scalar or array)
        H: Total pot height in mm
        opts: Style options dictionary containing lp_* parameters
        
    Returns:
        Computed outer radius (scalar if theta is scalar, array otherwise)
        
    Notes:
        For simple faceting (no cuts/experimental features), uses fast path.
        For complex features (seam cuts, edge trim), delegates to full algorithm.
    """
    # Delegate to original function for now
    # TODO: Gradually migrate seam and experimental logic to dedicated modules
    return _r_outer_lowpoly_facet_original(theta, z, r0, H, opts)
