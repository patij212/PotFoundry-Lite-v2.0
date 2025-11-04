"""Mesh building package for PotFoundry.

This package contains all mesh construction logic, organized into focused modules
for easy maintenance and testing. Each module handles a specific aspect of the
mesh building process.

Modules:
- parameters: Mesh quality settings and pot defaults
- grid: Theta and Z grid generation with caching
- outer_wall: Outer wall ring sampling and generation
- inner_wall: Inner wall ring generation with drain clamping
- rim: Rim cap geometry connecting outer and inner walls
- drain: Drain hole circle generation
- faces: Face array assembly from vertex indices
- diagnostics: Mesh quality diagnostics and metrics

The main entry point is build_pot_mesh() which orchestrates all components.
"""

from __future__ import annotations

from .grid import refine_z_outer_for_seams, theta_grid_cached
from .parameters import MeshQuality, PotDefaults

__all__ = [
    "MeshQuality",
    "PotDefaults",
    "theta_grid_cached",
    "refine_z_outer_for_seams",
]
