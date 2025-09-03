"""
potfoundry — a tiny toolkit for generating parametric, printable flower pots
---------------------------------------------------------------------------
Public domain / Unlicense. See LICENSE for details.
"""
from .geometry import (
    MeshQuality,
    PotDefaults,
    STYLES,
    build_pot_mesh,
    write_ascii_stl,
    save_preview_png,
)

# PF2: expose binary STL writer
from .core.io.stl import write_stl_binary
