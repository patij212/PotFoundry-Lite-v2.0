"""Typed stub for pfui.imports.

This stub provides conservative types for symbols that are dynamically
exported at runtime by a lazy importer. It exists to teach static type
checkers (mypy, Pylance) about the runtime contract without forcing heavy
numeric imports at module import time.
"""

from pathlib import Path
from typing import Any, Callable, Dict, Optional, Tuple

import numpy as np

# Precise-ish signature for the core mesh builder used across the project.
# Keep the r_outer_fn flexible: some styles accept a callable that computes
# an outer radius given (theta, z_norm, Rt, Rb, opts) and returns a float.
def build_pot_mesh(
    H: float,
    Rt: float,
    Rb: float,
    t_wall: float,
    t_bottom: float,
    r_drain: float,
    expn: float,
    n_theta: int,
    n_z: int,
    r_outer_fn: Optional[Callable[[float, float, float, float, Dict[str, Any]], float]],
    style_opts: Optional[Dict[str, Any]] = None,
) -> Tuple[np.ndarray, np.ndarray, Dict[str, Any]]: ...

# Binary STL writer: path + numeric arrays -> None

def write_stl_binary(
    path: Path | str,
    name: str,
    vertices: np.ndarray,
    faces: np.ndarray,
    normals: Optional[np.ndarray] = ...,
) -> Path: ...

WRITE_STL_BINARY = write_stl_binary

# Styles mapping (name -> style metadata/callable)
STYLES: Dict[str, Any]

# Helpers used by styles
base_radius: Callable[[float, float, float, float, float, Dict[str, Any]], float]
_spin_twist_radians: Callable[[float, float, Dict[str, Any]], float]

def validate_recipe(*args: Any, **kwargs: Any) -> Any: ...
def load_config(*args: Any, **kwargs: Any) -> Any: ...
def build_from_yaml(*args: Any, **kwargs: Any) -> Any: ...
