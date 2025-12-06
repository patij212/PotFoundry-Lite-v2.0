"""potfoundry — a tiny toolkit for generating parametric, printable flower pots
---------------------------------------------------------------------------
Public domain / Unlicense. See LICENSE for details.

STL Export:
    - write_stl_binary: **Recommended** - Fast, compact binary STL export

For all production use, use write_stl_binary. It produces smaller files,
writes faster, and is universally supported by modern slicers and CAD tools.
"""

__version__ = "2.1.0"

from .core.geometry import (
    STYLES,
    MeshQuality,
    PotDefaults,
    build_pot_mesh,
    save_preview_png,
)

# Binary STL writer (recommended)
from .core.io.stl import write_stl_binary

__all__ = [
    # Core geometry
    "MeshQuality",
    "PotDefaults",
    "STYLES",
    "build_pot_mesh",
    "save_preview_png",
    # STL export
    "write_stl_binary",
    # Version
    "__version__",
]

