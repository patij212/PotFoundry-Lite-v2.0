"""Mesh validation for CAD-grade export quality (Rhino/Grasshopper/slicers).

A triangle mesh that imports cleanly into a solid-modelling kernel must be a
*closed, manifold, consistently-oriented* surface with outward-facing normals
and no degenerate (zero-area) triangles. This module provides a single fast,
fully-vectorized :func:`validate_mesh` that reports each of those properties so
callers (the export path, the UI, tests) can guarantee — or surface — quality.

The checks, and why each matters on import:

* ``closed``            — no naked/boundary edges; otherwise "not watertight".
* ``manifold``          — every edge shared by exactly 2 faces.
* ``oriented``          — every directed edge appears once; a reversed face
                          shows up as a directed edge with the wrong count
                          (Rhino reports "N reversed faces").
* ``outward``           — signed volume > 0; normals point out of the solid.
* ``degenerate_faces``  — count of zero-area slivers ("bad objects").

All checks are O(M log M) over the face count via ``numpy``; no Python-level
per-face loops, so this is cheap enough to call on every export.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict

import numpy as np

__all__ = ["MeshValidation", "validate_mesh", "signed_volume"]


@dataclass(frozen=True)
class MeshValidation:
    """Result of :func:`validate_mesh`."""

    closed: bool
    manifold: bool
    oriented: bool
    outward: bool
    naked_edges: int
    nonmanifold_edges: int
    reversed_edges: int
    degenerate_faces: int
    signed_volume: float

    @property
    def is_valid(self) -> bool:
        """True iff the mesh is a closed, manifold, outward solid with no slivers."""
        return (
            self.closed
            and self.manifold
            and self.oriented
            and self.outward
            and self.degenerate_faces == 0
        )

    def as_dict(self) -> dict:
        return asdict(self)


def signed_volume(verts: np.ndarray, faces: np.ndarray) -> float:
    """Signed volume of the mesh via the divergence theorem.

    Positive for a closed mesh whose faces are wound counter-clockwise when
    seen from outside (outward normals); the magnitude is the enclosed volume.
    """
    v0 = verts[faces[:, 0]]
    v1 = verts[faces[:, 1]]
    v2 = verts[faces[:, 2]]
    return float(np.einsum("ij,ij->", v0, np.cross(v1, v2)) / 6.0)


def _face_areas(verts: np.ndarray, faces: np.ndarray) -> np.ndarray:
    v0 = verts[faces[:, 0]]
    v1 = verts[faces[:, 1]]
    v2 = verts[faces[:, 2]]
    return 0.5 * np.linalg.norm(np.cross(v1 - v0, v2 - v0), axis=1)


def validate_mesh(
    verts: np.ndarray,
    faces: np.ndarray,
    *,
    degenerate_rel_tol: float = 1e-9,
) -> MeshValidation:
    """Validate a triangle mesh for CAD-grade export quality.

    Args:
        verts: Vertex array, shape (N, 3).
        faces: Triangle index array, shape (M, 3).
        degenerate_rel_tol: A face counts as degenerate when its area is
            <= ``degenerate_rel_tol * median(area)``. Relative so the check is
            scale- and resolution-independent.

    Returns:
        :class:`MeshValidation` with per-property flags and counts.
    """
    faces = np.asarray(faces, dtype=np.int64)
    verts = np.asarray(verts, dtype=float)

    # --- directed edges (a->b) for every triangle, in winding order ----------
    a = faces[:, 0]
    b = faces[:, 1]
    c = faces[:, 2]
    de = np.empty((faces.shape[0] * 3, 2), dtype=np.int64)
    de[0::3, 0] = a; de[0::3, 1] = b
    de[1::3, 0] = b; de[1::3, 1] = c
    de[2::3, 0] = c; de[2::3, 1] = a

    # Encode each (i, j) edge as a single int64 key i*stride + j so we can use
    # the fast 1-D np.unique instead of the ~10x slower axis=0 variant.
    n_verts = int(verts.shape[0])
    stride = np.int64(n_verts + 1)
    dkey = de[:, 0] * stride + de[:, 1]

    # Undirected edges: sort each endpoint pair so (i,j) and (j,i) collapse.
    lo = np.minimum(de[:, 0], de[:, 1])
    hi = np.maximum(de[:, 0], de[:, 1])
    ukey = lo * stride + hi
    _, ucounts = np.unique(ukey, return_counts=True)
    naked = int(np.count_nonzero(ucounts == 1))
    nonmanifold = int(np.count_nonzero(ucounts > 2))

    # Orientation: in a consistently-wound closed manifold every directed edge
    # occurs exactly once (its twin is the reversed direction on the neighbour).
    _, dcounts = np.unique(dkey, return_counts=True)
    reversed_edges = int(np.count_nonzero(dcounts != 1))

    vol = signed_volume(verts, faces)

    areas = _face_areas(verts, faces)
    if areas.size:
        tol = degenerate_rel_tol * float(np.median(areas))
        degenerate = int(np.count_nonzero(areas <= tol))
    else:
        degenerate = 0

    return MeshValidation(
        closed=naked == 0,
        manifold=naked == 0 and nonmanifold == 0,
        oriented=reversed_edges == 0,
        outward=vol > 0.0,
        naked_edges=naked,
        nonmanifold_edges=nonmanifold,
        reversed_edges=reversed_edges,
        degenerate_faces=degenerate,
        signed_volume=vol,
    )
