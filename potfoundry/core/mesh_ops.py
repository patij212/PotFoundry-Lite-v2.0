"""Mesh validation and orientation utilities for export-grade output.

These helpers express the invariants a triangle mesh must satisfy to import
cleanly as a *valid closed solid* into Rhino/Grasshopper and modern slicers:

* manifold/watertight (every undirected edge shared by exactly two faces),
* consistently oriented (every directed edge traversed exactly once),
* outward-facing normals (the enclosed signed volume is positive).

``ensure_outward`` performs the cheap, vectorized global flip used by the mesh
builder to guarantee outward normals. ``winding_report`` is a diagnostic used
by tests (and available to the app for export QA) to assert the full invariant.
"""
from __future__ import annotations

from collections import Counter
from typing import Dict

import numpy as np

__all__ = [
    "signed_volume",
    "ensure_outward",
    "winding_report",
]


def signed_volume(vertices: np.ndarray, faces: np.ndarray) -> float:
    """Signed volume enclosed by a triangle mesh (divergence theorem).

    Positive when the face winding produces outward-pointing normals. For a
    closed, consistently wound surface the magnitude equals the enclosed
    volume; the *sign* tells you whether normals point out (+) or in (-).

    Args:
        vertices: Vertex array (N, 3).
        faces: Triangle indices (M, 3).

    Returns:
        Signed volume in the cube of the vertex units (e.g. mm^3).
    """
    v = np.asarray(vertices, dtype=float)
    f = np.asarray(faces)
    a = v[f[:, 0]]
    b = v[f[:, 1]]
    c = v[f[:, 2]]
    # sum( a . (b x c) ) / 6
    return float(np.einsum("ij,ij->i", a, np.cross(b, c)).sum() / 6.0)


def ensure_outward(vertices: np.ndarray, faces: np.ndarray) -> np.ndarray:
    """Return faces oriented so normals point outward (positive signed volume).

    Assumes ``faces`` is already *consistently* wound; this only fixes a global
    sign flip by reversing every triangle's winding when the enclosed volume is
    negative. It is O(M) and vectorized, so it is safe to call on the hot path.

    Args:
        vertices: Vertex array (N, 3).
        faces: Consistently wound triangle indices (M, 3).

    Returns:
        Face array with outward winding (a view/copy with columns reordered if
        a flip was required; otherwise the input array unchanged).
    """
    if signed_volume(vertices, faces) < 0.0:
        # Reverse winding of every triangle: (i, j, k) -> (i, k, j).
        return np.ascontiguousarray(faces[:, ::-1])
    return faces


def winding_report(vertices: np.ndarray, faces: np.ndarray) -> Dict[str, object]:
    """Compute a full export-readiness report for a triangle mesh.

    Args:
        vertices: Vertex array (N, 3).
        faces: Triangle indices (M, 3).

    Returns:
        Dict with::

            non_manifold_edges   count of undirected edges not shared by 2 faces
            inconsistent_edges   count of directed edges traversed != once
            signed_volume        enclosed signed volume (positive == outward)
            is_export_ready      True iff watertight, oriented and outward
    """
    f = np.asarray(faces)
    undirected: Counter = Counter()
    directed: Counter = Counter()
    for tri in f:
        a, b, c = int(tri[0]), int(tri[1]), int(tri[2])
        for u, v in ((a, b), (b, c), (c, a)):
            undirected[(u, v) if u < v else (v, u)] += 1
            directed[(u, v)] += 1

    non_manifold = sum(1 for n in undirected.values() if n != 2)
    inconsistent = sum(1 for n in directed.values() if n != 1)
    vol = signed_volume(vertices, faces)

    return {
        "non_manifold_edges": int(non_manifold),
        "inconsistent_edges": int(inconsistent),
        "signed_volume": float(vol),
        "is_export_ready": bool(
            non_manifold == 0 and inconsistent == 0 and vol > 0.0
        ),
    }
