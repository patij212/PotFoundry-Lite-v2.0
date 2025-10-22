"""Import-light bridge for heavy pot geometry functions.

This module exposes a conservative-typed wrapper `build_pot_mesh_safe` that
defers importing the numeric-heavy `potfoundry` geometry implementation until
call time. Callers (UI code) should use this function to avoid pulling NumPy
and large numeric types into their import-time type-checking.
"""
from __future__ import annotations

from typing import Any, Dict, Tuple, cast

# Import the lazy importer from this package; accessing `build_pot_mesh` will
# trigger the dynamic import only when `build_pot_mesh_safe` is called.
from .imports import build_pot_mesh as _lazy_build_pot_mesh


def build_pot_mesh_safe(
    H: float,
    Rt: float,
    Rb: float,
    t_wall: float,
    t_bottom: float,
    r_drain: float,
    expn: float,
    n_theta: int,
    n_z: int,
    r_outer_fn: Any,
    style_opts: Dict[str, Any],
) -> Tuple[Any, Any, Dict[str, Any]]:
    """Call the real mesh builder lazily and return conservative-typed results.

    The return types are intentionally `Any`/`Dict[str, Any]` to avoid importing
    NumPy typing into UI modules. Callers should treat the first two return
    values as vertex and face sequences and the third as a diagnostics mapping.

    Raises:
        RuntimeError: If the underlying builder is not available.
    """
    builder = _lazy_build_pot_mesh
    if builder is None:
        raise RuntimeError("build_pot_mesh implementation not available")
    # Call through directly; the underlying implementation does the heavy work
    # and will import NumPy at that time. We return conservative types so
    # callers don't incur heavy typing dependencies.
    verts, faces, diag = builder(
        H=H,
        Rt=Rt,
        Rb=Rb,
        t_wall=t_wall,
        t_bottom=t_bottom,
        r_drain=r_drain,
        expn=expn,
        n_theta=n_theta,
        n_z=n_z,
        r_outer_fn=r_outer_fn,
        style_opts=style_opts,
    )
    return cast(Tuple[Any, Any, Dict[str, Any]], (verts, faces, diag))
