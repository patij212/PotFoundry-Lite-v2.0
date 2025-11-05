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

from .drain import build_drain_hole
from .grid import refine_z_outer_for_seams, theta_grid_cached
from .inner_wall import generate_inner_wall
from .outer_wall import (
    add_ring_xy,
    call_style_r_outer,
    sample_outer_rings,
    spin_twist_radians,
)
from .parameters import MeshQuality, PotDefaults
from .rim import build_inner_wall_faces, build_rim_cap

__all__ = [
    "MeshQuality",
    "PotDefaults",
    "add_ring_xy",
    "build_drain_hole",
    "build_inner_wall_faces",
    "build_rim_cap",
    "call_style_r_outer",
    "generate_inner_wall",
    "theta_grid_cached",
    "refine_z_outer_for_seams",
    "sample_outer_rings",
    "spin_twist_radians",
]
