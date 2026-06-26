"""Mesh quality validation and orientation utilities (PF2).

Rhino/Grasshopper, slicers, and CAD kernels expect an exported solid to be a
*consistently oriented closed manifold*:

- **Closed manifold**: every edge is shared by exactly two triangles.
- **Consistent winding**: each interior edge is traversed once in each
  direction by its two triangles (so adjacent face normals agree).
- **Outward orientation**: face normals point away from the enclosed volume,
  i.e. the signed volume of the mesh is positive.

A mesh can satisfy the weak "every edge appears twice" test yet still have
*inconsistent winding* (adjacent triangles whose normals disagree). Such a mesh
renders with flipped/black faces in Rhino and is often rejected as a non-solid.
This module provides the checks that distinguish a print/CAD-ready solid from
one that merely looks closed, plus a repair pass that re-orients an arbitrary
triangle soup into an outward-facing oriented manifold.

Public API:
    signed_volume(verts, faces) -> float
    edge_manifold_stats(verts, faces) -> EdgeStats
    is_oriented_manifold(verts, faces) -> bool
    orient_outward(verts, faces) -> np.ndarray   # repaired faces
"""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass

import numpy as np

__all__ = [
    "EdgeStats",
    "signed_volume",
    "edge_manifold_stats",
    "is_oriented_manifold",
    "orient_outward",
    "compute_vertex_normals",
]


@dataclass(frozen=True)
class EdgeStats:
    """Topological summary of a triangle mesh's edges.

    Attributes:
        non_manifold_edges: count of undirected edges not shared by exactly two
            triangles (boundary edges -> count 1; non-manifold -> count > 2).
        inconsistent_edges: count of *manifold* edges (shared by two triangles)
            whose two triangles traverse the edge in the *same* direction,
            indicating disagreeing face orientation.
    """

    non_manifold_edges: int
    inconsistent_edges: int

    @property
    def is_oriented_manifold(self) -> bool:
        return self.non_manifold_edges == 0 and self.inconsistent_edges == 0


def _as_faces(faces: np.ndarray) -> np.ndarray:
    f = np.ascontiguousarray(faces)
    if f.ndim != 2 or f.shape[1] != 3:
        raise ValueError(f"faces must have shape (M, 3), got {f.shape}")
    return f.astype(np.int64, copy=False)


def signed_volume(verts: np.ndarray, faces: np.ndarray) -> float:
    """Signed volume of the triangle mesh via the divergence theorem.

    Positive when faces are wound counter-clockwise as seen from outside
    (outward normals); negative when normals point inward. Magnitude equals the
    enclosed volume for a closed mesh.
    """
    v = np.asarray(verts, dtype=float)
    f = _as_faces(faces)
    a = v[f[:, 0]]
    b = v[f[:, 1]]
    c = v[f[:, 2]]
    return float(np.sum(np.einsum("ij,ij->i", a, np.cross(b, c))) / 6.0)


def compute_vertex_normals(verts: np.ndarray, faces: np.ndarray) -> np.ndarray:
    """Area-weighted smooth per-vertex normals for an indexed mesh.

    Each face contributes its (unnormalized) cross-product to all three of its
    vertices; the cross product's magnitude is proportional to twice the face
    area, so larger faces are weighted more -- the standard robust scheme. The
    result is normalized to unit length. Because shared vertices (including the
    periodic theta seam) are referenced by index, their normals are averaged
    consistently with no special seam handling.

    For an outward-wound mesh the normals point outward. A vertex with no
    incident faces (or perfectly cancelling contributions) falls back to a unit
    radial direction so the output is always finite and unit length.

    Args:
        verts: (N, 3) vertex positions.
        faces: (M, 3) triangle indices.

    Returns:
        (N, 3) float64 unit normals, one per vertex.
    """
    v = np.asarray(verts, dtype=float)
    f = _as_faces(faces)
    vn = np.zeros_like(v)
    a = v[f[:, 0]]
    b = v[f[:, 1]]
    c = v[f[:, 2]]
    fn = np.cross(b - a, c - a)  # magnitude == 2 * area, direction == face normal
    np.add.at(vn, f[:, 0], fn)
    np.add.at(vn, f[:, 1], fn)
    np.add.at(vn, f[:, 2], fn)

    lengths = np.linalg.norm(vn, axis=1)
    zero = lengths <= 1e-12
    if np.any(zero):
        # Fallback: outward radial direction in the XY plane (z up).
        radial = v[zero].copy()
        radial[:, 2] = 0.0
        rlen = np.linalg.norm(radial, axis=1)
        flat = rlen <= 1e-12
        radial[~flat] /= rlen[~flat][:, None]
        radial[flat] = np.array([0.0, 0.0, 1.0])
        vn[zero] = radial
        lengths[zero] = 1.0
    vn /= lengths[:, None]
    return vn


def _directed_edges(faces: np.ndarray) -> np.ndarray:
    """Return (3M, 2) array of directed edges for every triangle."""
    f = faces
    e = np.empty((f.shape[0] * 3, 2), dtype=np.int64)
    e[0::3] = f[:, [0, 1]]
    e[1::3] = f[:, [1, 2]]
    e[2::3] = f[:, [2, 0]]
    return e


def edge_manifold_stats(verts: np.ndarray, faces: np.ndarray) -> EdgeStats:
    """Compute manifold/orientation statistics for a triangle mesh."""
    f = _as_faces(faces)
    if f.shape[0] == 0:
        return EdgeStats(non_manifold_edges=0, inconsistent_edges=0)
    n_verts = int(faces.max()) + 1 if f.size else 0
    e = _directed_edges(f)
    lo = np.minimum(e[:, 0], e[:, 1])
    hi = np.maximum(e[:, 0], e[:, 1])
    # Stable key for an undirected edge.
    key = lo.astype(np.int64) * (n_verts + 1) + hi
    # Orientation sign: +1 if traversed low->high, -1 if high->low.
    sign = np.where(e[:, 0] <= e[:, 1], 1, -1)

    order = np.argsort(key, kind="stable")
    key_s = key[order]
    sign_s = sign[order]

    # Group consecutive identical keys.
    boundaries = np.flatnonzero(np.diff(key_s)) + 1
    starts = np.concatenate(([0], boundaries))
    ends = np.concatenate((boundaries, [len(key_s)]))

    non_manifold = 0
    inconsistent = 0
    for s, en in zip(starts.tolist(), ends.tolist()):
        count = en - s
        if count != 2:
            non_manifold += 1
            continue
        # Manifold edge: the two directed traversals must cancel (sum == 0).
        if sign_s[s] + sign_s[s + 1] != 0:
            inconsistent += 1
    return EdgeStats(non_manifold_edges=non_manifold, inconsistent_edges=inconsistent)


def is_oriented_manifold(verts: np.ndarray, faces: np.ndarray) -> bool:
    """True if the mesh is a consistently wound, closed two-manifold."""
    return edge_manifold_stats(verts, faces).is_oriented_manifold


def _build_adjacency(faces: np.ndarray, n_verts: int) -> list[list[int]]:
    """Face adjacency across shared (manifold) edges."""
    F = faces.shape[0]
    e = _directed_edges(faces)
    lo = np.minimum(e[:, 0], e[:, 1])
    hi = np.maximum(e[:, 0], e[:, 1])
    key = lo.astype(np.int64) * (n_verts + 1) + hi
    fidx = np.repeat(np.arange(F, dtype=np.int64), 3)
    order = np.argsort(key, kind="stable")
    key_s = key[order]
    fidx_s = fidx[order]

    adj: list[list[int]] = [[] for _ in range(F)]
    boundaries = np.flatnonzero(np.diff(key_s)) + 1
    starts = np.concatenate(([0], boundaries))
    ends = np.concatenate((boundaries, [len(key_s)]))
    for s, en in zip(starts.tolist(), ends.tolist()):
        if en - s == 2:
            a = int(fidx_s[s])
            b = int(fidx_s[s + 1])
            adj[a].append(b)
            adj[b].append(a)
    return adj


def orient_outward(verts: np.ndarray, faces: np.ndarray) -> np.ndarray:
    """Re-orient an arbitrary triangle mesh into an outward oriented manifold.

    Uses a flood fill across shared edges to make adjacent triangles agree on
    winding, then flips the whole mesh if its signed volume is negative so that
    normals point outward. Returns a new faces array; the input is not mutated.

    This is a general repair pass (O(F)); the geometry builder produces correctly
    oriented meshes directly, so this is primarily an export-time safety net and
    a tool for externally sourced meshes.
    """
    f = _as_faces(faces).copy()
    F = f.shape[0]
    if F == 0:
        return f
    n_verts = int(faces.max()) + 1
    adj = _build_adjacency(f, n_verts)

    visited = np.zeros(F, dtype=bool)

    def directed_set(tri: np.ndarray) -> set[tuple[int, int]]:
        a, b, c = int(tri[0]), int(tri[1]), int(tri[2])
        return {(a, b), (b, c), (c, a)}

    for seed in range(F):
        if visited[seed]:
            continue
        visited[seed] = True
        dq = deque([seed])
        while dq:
            cur = dq.popleft()
            cur_edges = directed_set(f[cur])
            for nb in adj[cur]:
                if visited[nb]:
                    continue
                # If the neighbour shares a directed edge with cur, their
                # windings agree in direction -> normals disagree -> flip it.
                if directed_set(f[nb]) & cur_edges:
                    f[nb] = f[nb][::-1]
                visited[nb] = True
                dq.append(nb)

    if signed_volume(verts, f) < 0.0:
        f = np.ascontiguousarray(f[:, ::-1])
    return f
