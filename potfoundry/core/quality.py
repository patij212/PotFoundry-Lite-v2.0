"""Mesh export-quality report (PF2).

Turns the properties a CAD tool (Rhino, Grasshopper) or a slicer needs into a
single, fast, fully-vectorized report so the pipeline and UI can state
"export-ready" instead of guessing:

* watertight        — every undirected edge is shared by exactly two faces
* winding_consistent — every directed edge appears exactly once (coherent
                       orientation; adjacent faces agree on which way is out)
* outward           — signed volume > 0 (normals point out of the material)
* degenerate_faces  — count of zero-area triangles
* export_ready      — watertight AND winding_consistent AND outward AND no
                      degenerate faces

All checks are O(F) using numpy (no Python-level edge loops), so the report is
cheap enough to run on every build.
"""
from __future__ import annotations

import numpy as np

from .geometry import signed_volume

__all__ = ["mesh_quality_report"]

# Triangles with area below this (mm^2) are treated as degenerate.
_DEGENERATE_AREA = 1e-9


def _edge_endpoints(faces: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Return the (3M,) src and dst vertex indices of every directed edge."""
    tri = faces.reshape(-1, 3)
    src = tri.reshape(-1)                       # a, b, c, a, b, c, ...
    dst = np.roll(tri, -1, axis=1).reshape(-1)  # b, c, a, b, c, a, ...
    return src.astype(np.int64), dst.astype(np.int64)


def _count_distinct(keys: np.ndarray) -> np.ndarray:
    """Occurrence count of each distinct value in a 1-D int array."""
    if keys.shape[0] == 0:
        return np.empty(0, dtype=np.int64)
    _, counts = np.unique(keys, return_counts=True)
    return counts


def mesh_quality_report(verts: np.ndarray, faces: np.ndarray) -> dict:
    """Compute an export-quality report for a triangle mesh.

    Args:
        verts: Vertex array, shape (N, 3).
        faces: Triangle index array, shape (M, 3).

    Returns:
        dict with keys: ``watertight``, ``winding_consistent``, ``outward``,
        ``export_ready`` (bools), ``non_manifold_edges``, ``inconsistent_edges``,
        ``degenerate_faces``, ``vertex_count``, ``face_count`` (ints),
        ``signed_volume`` (float), and ``bbox`` (min/max as nested lists).
    """
    verts = np.asarray(verts, dtype=float)
    faces = np.asarray(faces, dtype=np.int64)

    # Encode each edge (src, dst) as a single int64 key so edge counting is a
    # fast 1-D np.unique instead of a slow row-wise unique on a (3M, 2) array.
    src, dst = _edge_endpoints(faces)
    n = int(verts.shape[0]) or 1
    lo = np.minimum(src, dst)
    hi = np.maximum(src, dst)
    undirected_keys = lo * n + hi     # order-independent (watertightness)
    directed_keys = src * n + dst     # order-sensitive (winding coherence)
    non_manifold = int(np.count_nonzero(_count_distinct(undirected_keys) != 2))
    inconsistent = int(np.count_nonzero(_count_distinct(directed_keys) != 1))

    v0 = verts[faces[:, 0]]
    v1 = verts[faces[:, 1]]
    v2 = verts[faces[:, 2]]
    areas = 0.5 * np.linalg.norm(np.cross(v1 - v0, v2 - v0), axis=1)
    degenerate = int(np.count_nonzero(areas < _DEGENERATE_AREA))

    vol = signed_volume(verts, faces)

    watertight = non_manifold == 0
    winding_consistent = inconsistent == 0
    outward = vol > 0.0
    export_ready = bool(watertight and winding_consistent and outward and degenerate == 0)

    if verts.shape[0]:
        bbox_min = verts.min(axis=0).tolist()
        bbox_max = verts.max(axis=0).tolist()
    else:
        bbox_min = bbox_max = [0.0, 0.0, 0.0]

    return {
        "watertight": bool(watertight),
        "winding_consistent": bool(winding_consistent),
        "outward": bool(outward),
        "export_ready": export_ready,
        "non_manifold_edges": non_manifold,
        "inconsistent_edges": inconsistent,
        "degenerate_faces": degenerate,
        "vertex_count": int(verts.shape[0]),
        "face_count": int(faces.shape[0]),
        "signed_volume": float(vol),
        "bbox": {"min": bbox_min, "max": bbox_max},
    }
