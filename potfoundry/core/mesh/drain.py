"""Drain hole mesh generation for pot geometry.

This module handles:
- Drain circle vertex generation (top and bottom of drain hole)
- Drain cylinder wall faces
- Bottom slab underside faces (outer to drain)
- Bottom slab top faces (inner to drain)

The drain hole creates a cylindrical opening at the bottom of the pot
for water drainage, connecting the interior cavity to the outside.
"""

from __future__ import annotations

import numpy as np
import numpy.typing as npt

__all__ = [
    "build_drain_hole",
]


def build_drain_hole(
    *,
    r_drain: float,
    t_bottom: float,
    cos_th: npt.NDArray[np.float64],
    sin_th: npt.NDArray[np.float64],
    verts: list[tuple[float, float, float]],
    outer_idx: npt.NDArray[np.int64],
    inner_idx: npt.NDArray[np.int64],
    j_idx: npt.NDArray[np.int_],
    jn: npt.NDArray[np.int_],
) -> tuple[
    npt.NDArray[np.int64],
    npt.NDArray[np.int64],
    npt.NDArray[np.int64],
    npt.NDArray[np.int64],
    npt.NDArray[np.int64],
    npt.NDArray[np.int64],
    npt.NDArray[np.int64],
    npt.NDArray[np.int64],
]:
    """Build drain hole geometry including cylinder and connecting faces.

    Creates the drain hole at the bottom of the pot, including:
    - Two rings of vertices (bottom at z=0, top at z=t_bottom)
    - Cylindrical wall connecting the rings
    - Faces connecting outer bottom ring to drain bottom ring
    - Faces connecting inner bottom ring to drain top ring

    Args:
        r_drain: Drain hole radius
        t_bottom: Bottom slab thickness
        cos_th: Cosine of theta grid
        sin_th: Sine of theta grid
        verts: Vertex list to append to
        outer_idx: Index array for outer wall vertices
        inner_idx: Index array for inner wall vertices
        j_idx: Index array for theta positions
        jn: Next theta index (wrapped around)

    Returns:
        Tuple of 8 face arrays:
        - tri_bot1, tri_bot2: Bottom underside (outer to drain)
        - tri_top1, tri_top2: Bottom slab top (inner to drain)
        - tri_cyl1, tri_cyl2: Drain cylinder wall
        - drain_under_arr, drain_top_arr: Drain vertex indices (for debugging)
    """
    # ---- Drain circles (untwisted)
    drain_under: list[int] = []
    drain_top: list[int] = []
    # Vectorized drain circles using cached cos/sin
    for c, s in zip(cos_th, sin_th):
        x0 = r_drain * float(c)
        y0 = r_drain * float(s)
        drain_under.append(len(verts))
        verts.append((x0, y0, 0.0))
        drain_top.append(len(verts))
        verts.append((x0, y0, float(t_bottom)))
    drain_under_arr = np.array(drain_under, dtype=int)
    drain_top_arr = np.array(drain_top, dtype=int)
    outer_bottom = outer_idx[0]
    inner_bottom = inner_idx[0]

    # Bottom underside (outer bottom ring -> drain under ring)
    tri_bot1 = np.stack(
        [outer_bottom[j_idx], drain_under_arr[jn], drain_under_arr[j_idx]], axis=1
    )
    tri_bot2 = np.stack(
        [outer_bottom[j_idx], outer_bottom[jn], drain_under_arr[jn]], axis=1
    )

    # Top of bottom slab (inner bottom ring -> drain top ring)
    tri_top1 = np.stack(
        [inner_bottom[j_idx], inner_bottom[jn], drain_top_arr[jn]], axis=1
    )
    tri_top2 = np.stack(
        [inner_bottom[j_idx], drain_top_arr[jn], drain_top_arr[j_idx]], axis=1
    )

    # Drain cylinder wall
    tri_cyl1 = np.stack(
        [drain_under_arr[j_idx], drain_top_arr[j_idx], drain_top_arr[jn]], axis=1
    )
    tri_cyl2 = np.stack(
        [drain_under_arr[j_idx], drain_top_arr[jn], drain_under_arr[jn]], axis=1
    )

    return (
        tri_bot1,
        tri_bot2,
        tri_top1,
        tri_top2,
        tri_cyl1,
        tri_cyl2,
        drain_under_arr,
        drain_top_arr,
    )
