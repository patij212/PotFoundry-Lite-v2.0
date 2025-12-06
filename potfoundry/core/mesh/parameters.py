"""Mesh parameters and pot defaults for mesh building.

This module contains:
- MeshQuality: Resolution presets for mesh generation
- PotDefaults: Default dimensional parameters for pots
- Parameter validation helpers

These define the fundamental parameters used when constructing pot meshes.
"""

from __future__ import annotations

from dataclasses import dataclass

__all__ = [
    "MeshQuality",
    "PotDefaults",
]


@dataclass
class MeshQuality:
    """Mesh resolution. Higher -> smoother -> more faces -> larger STL."""

    n_theta: int = 168  # angular divisions around the pot
    n_z: int = 84  # vertical divisions along the height


@dataclass
class PotDefaults:
    """Default dimensions (mm) for convenience or YAML defaults."""

    height: float = 120.0
    top_od: float = 140.0
    bottom_od: float = 90.0
    wall: float = 3.0
    bottom: float = 3.0
    drain: float = 10.0
    flare_exp: float = 1.1  # >1 flares near the top, <1 near the base
