"""Compatibility shim — single source of truth for geometry.

The geometry implementation lives in :mod:`potfoundry.core.geometry`. This
module historically carried a second, older copy of the same code, and the two
silently diverged: the outward-orientation fix (coherent, outward-facing export
meshes) landed only in the core copy, so consumers importing
``potfoundry.geometry`` — notably the YAML/batch export path — kept building
inside-out, incoherently wound meshes.

To prevent that class of bug for good, this module now simply re-exports the
core implementation. Both ``potfoundry.geometry`` and
``potfoundry.core.geometry`` therefore resolve to one implementation: a fix in
the core module is automatically a fix everywhere.
"""
from __future__ import annotations

from .core import geometry as _core

# Public API (mirrors _core.__all__) plus the private helpers and style
# functions that other modules and tests import by name.
from .core.geometry import (  # noqa: F401
    TAU,
    MeshQuality,
    PotDefaults,
    STYLES,
    base_radius,
    build_pot_mesh,
    orient_faces_outward,
    r_base_out,
    r_outer_fourier_bloom,
    r_outer_harmonic_ripple,
    r_outer_spiral_ridges,
    r_outer_superellipse_morph,
    r_outer_superformula_blossom,
    save_preview_png,
    signed_volume,
    superformula_r,
    write_ascii_stl,
    _compute_normal,
    _spin_twist_radians,
    _theta_grid_cached,
)

__all__ = list(_core.__all__)
