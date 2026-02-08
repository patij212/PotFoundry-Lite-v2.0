"""Core faceting logic for LowPolyFacet style.

This module contains the fundamental faceting algorithm including
triangle wave generation and modulation calculations.
"""
from __future__ import annotations

import math

import numpy as np
import numpy.typing as npt

from .parameters import LowPolyFacetParams

# Constants
TAU = 2.0 * math.pi


def compute_tier_phase(
    tier_idx: int,
    jitter_amt: float,
    facets: int,
) -> float:
    """Compute deterministic phase offset for a tier.
    
    Uses a pseudo-random but deterministic offset based on tier index
    to create visual variation between tiers.
    
    Args:
        tier_idx: Zero-based tier index
        jitter_amt: Jitter amount (0.0 to 1.0+)
        facets: Number of facets
        
    Returns:
        Phase offset in radians

    """
    # Pseudo-random but deterministic offset in radians scaled to 1/facets of a turn
    # Use an irrational multiplier to avoid repetition patterns.
    tier_seed = (tier_idx + 1) * 1.61803398875
    tier_phase = (jitter_amt / max(1, facets)) * TAU * math.sin(tier_seed)
    return tier_phase


def compute_triangle_wave(
    theta: npt.NDArray[np.float64],
    total_phase: float,
    facets: int,
) -> tuple[npt.NDArray[np.float64], npt.NDArray[np.float64]]:
    """Build triangle wave for facet modulation.
    
    Creates a triangle wave with period 2π/facets in [0,1],
    with peaks at facet centers and valleys at facet edges.
    
    Args:
        theta: Angular coordinates (array)
        total_phase: Total phase offset in radians
        facets: Number of facets
        
    Returns:
        Tuple of (fractional position, triangle wave values)

    """
    # x grows by 1 every facet; frac(x) in [0,1)
    x = (facets * (theta + total_phase)) / TAU
    frac = x - np.floor(x)
    tri = 1.0 - np.abs(2.0 * frac - 1.0)  # 0 at edges, 1 at facet centers
    return frac, tri


def apply_bevel(
    tri: npt.NDArray[np.float64],
    bevel: float,
) -> tuple[float, npt.NDArray[np.float64]]:
    """Apply bevel smoothing to triangle wave.
    
    Maps bevel parameter (0 to 1) to power exponent that smooths
    the facet transitions.
    
    Args:
        tri: Triangle wave values
        bevel: Bevel amount (0.0 to 1.0)
        
    Returns:
        Tuple of (power exponent, smoothed triangle wave)

    """
    # Map bevel 0..1 to exponent p in [1.0, 4.0]
    p = 1.0 + 3.0 * max(0.0, min(1.0, bevel))
    tri_s = tri**p
    return p, tri_s


def compute_modulation_factor(
    tri_s: npt.NDArray[np.float64],
    amp: float,
    outward_dir: bool,
) -> npt.NDArray[np.float64]:
    """Compute radial modulation factor from triangle wave.
    
    Args:
        tri_s: Smoothed triangle wave values
        amp: Modulation amplitude
        outward_dir: True for outward facets, False for inward
        
    Returns:
        Modulation factor to multiply with base radius

    """
    if outward_dir:
        # Outward facets: bulge at centers (tri_s≈1) and return to base at edges (tri_s≈0)
        f = 1.0 + amp * tri_s
    else:
        # Inward facets: centers ~ r0, edges recess inward by amp
        f = 1.0 - amp * (1.0 - tri_s)
    return f


def compute_basic_facet_radius(
    theta: float | npt.ArrayLike,
    r0: float | npt.NDArray[np.float64],
    params: LowPolyFacetParams,
    tier_idx: int,
) -> tuple[npt.NDArray[np.float64], npt.NDArray[np.float64], float]:
    """Compute basic faceted radius without cuts or advanced features.
    
    This is the core faceting algorithm that creates the polygonal
    appearance through modulation of the base radius.
    
    Args:
        theta: Angular coordinate(s)
        r0: Base radius at current height
        params: LowPolyFacet parameters
        tier_idx: Current tier index
        
    Returns:
        Tuple of (theta array, modulation factor, power exponent)

    """
    th = np.asarray(theta, dtype=float)

    # Compute tier-specific phase offset
    tier_phase = compute_tier_phase(tier_idx, params.jitter_amt, params.facets)
    total_phase = params.phase + tier_phase

    # Build triangle wave
    frac, tri = compute_triangle_wave(th, total_phase, params.facets)

    # Apply bevel smoothing
    p, tri_s = apply_bevel(tri, params.bevel)

    # Compute modulation factor
    f = compute_modulation_factor(tri_s, params.amp, params.outward_dir)

    return tri_s, f, p
