"""
potfoundry — a tiny toolkit for generating parametric, printable flower pots
---------------------------------------------------------------------------
Public domain / Unlicense. See LICENSE for details.

Mesh Export:
    - write_stl_binary: **Recommended for slicers / 3D printing** - fast, compact
      binary STL (de-welded per-triangle geometry, as the STL format requires).
    - write_obj: **Recommended for Rhino / Grasshopper** - welded indexed Wavefront
      OBJ that preserves the watertight, closed mesh topology for CAD round-tripping.
    - write_ascii_stl: **Deprecated** - Legacy ASCII STL (debug/compatibility only)

For slicing, prefer write_stl_binary. For CAD interchange (Rhino, Grasshopper),
prefer write_obj — it keeps shared vertices so the mesh imports closed/watertight.
"""

__version__ = "2.1.0"

from .core.geometry import (
    MeshQuality,
    PotDefaults,
    STYLES,
    build_pot_mesh,
    save_preview_png,
)

# Binary STL writer (recommended for slicers / 3D printing)
from .core.io.stl import write_stl_binary

# Welded OBJ writer (recommended for Rhino / Grasshopper round-tripping)
from .core.io.obj import write_obj

# Mesh validation — CAD-readiness guarantee used before export
from .core.mesh_validation import MeshReport, validate_mesh

# ASCII STL writer (deprecated, kept for backward compatibility)
from .core.geometry import write_ascii_stl

__all__ = [
    # Core geometry
    'MeshQuality',
    'PotDefaults',
    'STYLES',
    'build_pot_mesh',
    'save_preview_png',
    # Mesh export
    'write_stl_binary',  # binary STL — slicers / 3D printing
    'write_obj',         # welded OBJ — Rhino / Grasshopper
    'write_ascii_stl',   # deprecated
    # Mesh validation
    'MeshReport',
    'validate_mesh',
    # Version
    '__version__',
]
