"""
potfoundry — a tiny toolkit for generating parametric, printable flower pots
---------------------------------------------------------------------------
Public domain / Unlicense. See LICENSE for details.

STL Export:
    - write_stl_binary: **Recommended** - Fast, compact binary STL export (default)
    - write_ascii_stl: **Deprecated** - Legacy ASCII STL (debug/compatibility only)

For all production use, prefer write_stl_binary. It produces smaller files,
writes faster, and is universally supported by modern slicers and CAD tools.
"""

__version__ = "2.1.0"

from .core.geometry import (
    MeshQuality,
    PotDefaults,
    STYLES,
    build_pot_mesh,
    save_preview_png,
)

# Binary STL writer (recommended)
from .core.io.stl import write_stl_binary

# ASCII STL writer (deprecated, kept for backward compatibility)
from .core.geometry import write_ascii_stl

# Smooth vertex normals (used by OBJ/3dm export for non-faceted shading)
from .core.io.normals import compute_vertex_normals

# Wavefront OBJ writer (welded, smooth — Rhino/Grasshopper friendly)
from .core.io.obj import write_obj

# Native Rhino .3dm writer (optional rhino3dm dependency)
from .core.io.rhino3dm_io import write_3dm, RHINO3DM_AVAILABLE

__all__ = [
    # Core geometry
    'MeshQuality',
    'PotDefaults',
    'STYLES',
    'build_pot_mesh',
    'save_preview_png',
    'compute_vertex_normals',
    # STL export (binary is recommended)
    'write_stl_binary',
    'write_ascii_stl',  # deprecated
    # Rhino / Grasshopper friendly export
    'write_obj',
    'write_3dm',
    'RHINO3DM_AVAILABLE',
    # Version
    '__version__',
]
