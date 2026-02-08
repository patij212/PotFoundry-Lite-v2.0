"""Rim and inner wall face generation for pot geometry.

This module handles:
- Inner wall face triangulation
- Rim cap geometry (connecting outer and inner walls at the top)

The rim cap bridges the top edge of the outer and inner walls,
creating a smooth finished edge for the pot.
"""

from __future__ import annotations

import numpy as np
import numpy.typing as npt

__all__ = [
    "build_inner_wall_faces",
    "build_rim_cap",
]


def build_inner_wall_faces(
    inner_idx: npt.NDArray[np.int64],
    j_idx: npt.NDArray[np.int_],
    jn: npt.NDArray[np.int_],
) -> tuple[npt.NDArray[np.int64], npt.NDArray[np.int64]]:
    """Build triangular faces for the inner wall surface.
    
    Creates triangulated faces between consecutive rings of the inner wall,
    with winding order pointing outward from the pot center.
    
    Args:
        inner_idx: Index array for inner wall vertices (n_z_rings x n_theta)
        j_idx: Index array for theta positions
        jn: Next theta index (wrapped around)
        
    Returns:
        Tuple of (tri_in1, tri_in2) - two sets of triangles forming quads

    """
    # Vectorized faces for inner wall (choose winding to also point outward-from-center)
    vi00 = inner_idx[:-1, :][:, j_idx]
    vi01 = inner_idx[:-1, :][:, jn]
    vi10 = inner_idx[1:, :][:, j_idx]
    vi11 = inner_idx[1:, :][:, jn]
    tri_in1 = np.stack([vi00, vi11, vi10], axis=2).reshape(-1, 3)
    tri_in2 = np.stack([vi00, vi01, vi11], axis=2).reshape(-1, 3)

    return tri_in1, tri_in2


def build_rim_cap(
    outer_idx: npt.NDArray[np.int64],
    inner_idx: npt.NDArray[np.int64],
    j_idx: npt.NDArray[np.int_],
    jn: npt.NDArray[np.int_],
) -> tuple[npt.NDArray[np.int64], npt.NDArray[np.int64]]:
    """Build triangular faces for the rim cap at the top of the pot.
    
    The rim cap connects the top edge of the outer wall to the top edge
    of the inner wall, creating a finished rim.
    
    Args:
        outer_idx: Index array for outer wall vertices
        inner_idx: Index array for inner wall vertices
        j_idx: Index array for theta positions
        jn: Next theta index (wrapped around)
        
    Returns:
        Tuple of (tri_rim1, tri_rim2) - two sets of triangles forming rim quads

    """
    outer_top = outer_idx[-1]
    inner_top = inner_idx[-1]

    tri_rim1 = np.stack([outer_top[j_idx], inner_top[j_idx], inner_top[jn]], axis=1)
    tri_rim2 = np.stack([outer_top[j_idx], inner_top[jn], outer_top[jn]], axis=1)

    return tri_rim1, tri_rim2
