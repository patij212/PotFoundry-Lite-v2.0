
from collections.abc import Callable
from typing import Any, TypeAlias

import numpy as np

"""Minimal typing stubs for `potfoundry.core.geometry` used by the UI.

These stubs are intentionally conservative but precise enough to allow
static analysis of call sites that build or inspect meshes.
"""

# A style entry is (r_outer_fn, opts)
StyleEntry: TypeAlias = tuple[Callable[..., float], dict[str, Any]]
STYLES: dict[str, StyleEntry]

def _spin_twist_radians(z: float, H: float, opts: dict[str, Any]) -> float: ...

def base_radius(r: float) -> float: ...

def build_pot_mesh(
    H: float,
    Rt: float,
    Rb: float,
    t_wall: float,
    t_bottom: float,
    r_drain: float,
    expn: float = ...,
    n_theta: int = ...,
    n_z: int = ...,
    r_outer_fn: Callable[..., float] | None = ...,
    style_opts: dict[str, Any] | None = ...,
) -> tuple[np.ndarray, np.ndarray, dict[str, Any]]: ...

__all__ = ["STYLES", "_spin_twist_radians", "base_radius", "build_pot_mesh"]
