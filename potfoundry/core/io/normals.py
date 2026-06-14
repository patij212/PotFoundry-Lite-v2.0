"""Smooth (area-weighted) vertex normals for export.

Binary STL only stores per-face normals, so meshes imported into Rhino or
Grasshopper look faceted. The OBJ and 3dm exporters need *vertex* normals to
achieve smooth shading. This module derives them from the watertight triangle
mesh produced by :func:`potfoundry.build_pot_mesh`.

We accumulate each triangle's (non-normalised) face normal onto its three
vertices. Because the cross-product magnitude is proportional to triangle area,
this is an area-weighted average — the standard, robust choice that resists
distortion from many small slivers near the drain and rim. The pot mesh shares
its angular-seam vertices via modular indexing, so the result is automatically
continuous across the seam (no welding step required).
"""
from __future__ import annotations

import numpy as np

__all__ = ["compute_vertex_normals"]


def compute_vertex_normals(vertices: np.ndarray, faces: np.ndarray) -> np.ndarray:
    """Return unit-length, area-weighted vertex normals.

    Args:
        vertices: Vertex array, shape (N, 3).
        faces: Triangle indices, shape (M, 3).

    Returns:
        Vertex normals, shape (N, 3), float64. Vertices referenced by no face
        (should not occur for pot meshes) get a zero vector that is left
        unnormalised.
    """
    v = np.asarray(vertices, dtype=np.float64)
    f = np.asarray(faces, dtype=np.int64)

    a = v[f[:, 0]]
    b = v[f[:, 1]]
    c = v[f[:, 2]]
    # Area-weighted face normal (magnitude == 2 * triangle area).
    face_n = np.cross(b - a, c - a)

    vn = np.zeros_like(v)
    # Scatter-add each face normal onto its three vertices.
    np.add.at(vn, f[:, 0], face_n)
    np.add.at(vn, f[:, 1], face_n)
    np.add.at(vn, f[:, 2], face_n)

    lengths = np.linalg.norm(vn, axis=1)
    nonzero = lengths > 0.0
    vn[nonzero] /= lengths[nonzero, None]
    return vn
