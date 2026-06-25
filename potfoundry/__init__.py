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

# Binary STL writer (recommended for slicers)
from .core.io.stl import write_stl_binary

# Wavefront OBJ writer (recommended for CAD: Rhino / Grasshopper)
from .core.io.obj import write_obj

# ASCII STL writer (deprecated, kept for backward compatibility)
from .core.geometry import write_ascii_stl

# Mesh orientation / validation utilities (CAD / Rhino / Grasshopper export quality)
from .core.mesh import signed_volume, ensure_outward

__all__ = [
    # Core geometry
    'MeshQuality',
    'PotDefaults',
    'STYLES',
    'build_pot_mesh',
    'save_preview_png',
    # STL export (binary is recommended for slicers)
    'write_stl_binary',
    'write_ascii_stl',  # deprecated
    # OBJ export (recommended for CAD: Rhino / Grasshopper)
    'write_obj',
    # Mesh orientation / validation
    'signed_volume',
    'ensure_outward',
    # Version
    '__version__',
]
