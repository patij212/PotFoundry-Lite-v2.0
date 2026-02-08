"""Parameter extraction and validation for LowPolyFacet style.

This module handles extraction and validation of all parameters
from the options dictionary for the lowpoly_facet style function.
"""
from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass
class LowPolyFacetParams:
    """Parameters for LowPolyFacet style function.
    
    Attributes:
        facets: Number of facets around the circumference (min 3)
        tiers: Number of vertical tiers/bands (min 1)
        amp: Amplitude of facet modulation (0.0 to 1.0+)
        outward_dir: True for outward facets, False for inward
        jitter_amt: Random jitter amount for tier phases (0.0 to 1.0+)
        phase: Global phase offset in radians
        bevel: Bevel/smoothing amount (0.0 to 1.0)
        cut_bot_deg: Bottom seam cut angle in degrees
        cut_top_deg: Top seam cut angle in degrees
        print_safe: Enable print-safe mode tempering
        cut_depth_frac: Cut depth as fraction of facet span
        edge_cut_mm: Edge trim amount in mm
        edge_cut_sharp: Edge trim sharpness factor
        use_outward: Enable outward mode
        uniform_ring: Enable uniform ring mode
        straight_edge: Enable straight edge mode
        print_safe_mode: Enable print-safe mode

    """

    # Core facet parameters
    facets: int
    tiers: int
    amp: float
    outward_dir: bool
    jitter_amt: float
    phase: float
    bevel: float

    # Seam cut parameters
    cut_bot_deg: float
    cut_top_deg: float
    print_safe: bool
    cut_depth_frac: float

    # Edge parameters
    edge_cut_mm: float
    edge_cut_sharp: float

    # Mode flags
    use_outward: bool
    uniform_ring: bool
    straight_edge: bool


def extract_params(opts: dict) -> LowPolyFacetParams:
    """Extract and validate parameters from options dictionary.
    
    Args:
        opts: Style options dictionary
        
    Returns:
        LowPolyFacetParams instance with validated parameters

    """
    facets = max(3, int(opts.get("lp_facets", 12)))
    tiers = max(1, int(opts.get("lp_tiers", 1)))
    amp = max(0.0, float(opts.get("lp_amp", 0.12)))
    facet_dir = str(opts.get("lp_facet_dir", "in")).lower()
    outward_dir = facet_dir.startswith("out")
    jitter_amt = max(0.0, float(opts.get("lp_jitter", 0.15)))
    phase = float(opts.get("lp_phase_deg", 0.0)) * math.pi / 180.0
    bevel = float(opts.get("lp_bevel", 0.15))

    # Overhang mitigation via taper windows per tier (angles in degrees)
    cut_bot_deg = max(0.0, float(opts.get("lp_cut_bot_deg", 0.0)))
    cut_top_deg = max(0.0, float(opts.get("lp_cut_top_deg", 0.0)))

    # Print-safe mode tempering
    print_safe = bool(opts.get("lp_print_safe_mode", False))

    # Allow seam cut depth to be proportional to facet span at current height
    cut_depth_frac = max(0.0, float(opts.get("lp_cut_depth_frac_of_facet", 0.0)))

    # Angular edge-trim near facet boundaries (theta-local)
    edge_cut_mm = max(0.0, float(opts.get("lp_edge_cut_mm", 0.0)))
    edge_cut_sharp = max(0.1, float(opts.get("lp_edge_cut_sharp", 1.2)))

    # Mode flags
    use_outward = bool(opts.get("lp_outward_mode", False))
    uniform_ring = bool(opts.get("lp_uniform_ring", False))
    straight_edge = bool(opts.get("lp_cut_straight_edges", True))

    return LowPolyFacetParams(
        facets=facets,
        tiers=tiers,
        amp=amp,
        outward_dir=outward_dir,
        jitter_amt=jitter_amt,
        phase=phase,
        bevel=bevel,
        cut_bot_deg=cut_bot_deg,
        cut_top_deg=cut_top_deg,
        print_safe=print_safe,
        cut_depth_frac=cut_depth_frac,
        edge_cut_mm=edge_cut_mm,
        edge_cut_sharp=edge_cut_sharp,
        use_outward=use_outward,
        uniform_ring=uniform_ring,
        straight_edge=straight_edge,
    )


def has_cuts(params: LowPolyFacetParams) -> bool:
    """Check if any seam cuts are enabled.
    
    Args:
        params: LowPolyFacet parameters
        
    Returns:
        True if bottom or top cuts are enabled

    """
    return (params.cut_bot_deg > 0.0) or (params.cut_top_deg > 0.0)


def has_edge_cut(params: LowPolyFacetParams) -> bool:
    """Check if edge cutting is enabled.
    
    Args:
        params: LowPolyFacet parameters
        
    Returns:
        True if edge cutting is enabled

    """
    return params.edge_cut_mm > 0.0
