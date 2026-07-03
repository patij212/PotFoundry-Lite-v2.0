"""Mesh-quality metrics and orientation repair for export-grade output.

PotFoundry meshes are consumed by slicers *and* by CAD tools such as Rhino /
Grasshopper. Those CAD tools are far stricter than slicers: beyond simple
watertightness they require a *consistently wound, outward-facing* surface,
otherwise they report flipped faces and refuse mesh boolean / solid operations.

This module provides:

* Diagnostics — :func:`signed_volume`, :func:`winding_defects`,
  :func:`manifold_report` — cheap, dependency-free checks usable in tests and
  in an export pre-flight.
* Repair — :func:`orient_outward` — deterministically unifies face winding
  across the (manifold) mesh and flips it so all normals face outward. This is
  the equivalent of Rhino's *Unify Mesh Normals* + *outward* pass.

All functions operate on plain ``numpy`` arrays: ``verts`` is ``(N, 3)`` float
and ``faces`` is ``(M, 3)`` int. They never mutate their inputs.
"""
from __future__ import annotations

from typing import Dict

import numpy as np

__all__ = [
    "signed_volume",
    "winding_defects",
    "manifold_report",
    "orient_outward",
]


def _weld_indices(verts: np.ndarray, decimals: int = 6) -> np.ndarray:
    """Map each vertex to a canonical index that merges coincident positions.

    Two triangles that meet at the same 3D location but reference distinct
    vertex indices form a crack for Rhino even though the mesh looks fine by
    index. Welding by rounded position lets the topology checks see the true
    surface connectivity.
    """
    key = np.round(verts.astype(float, copy=False), decimals)
    _, inv = np.unique(key, axis=0, return_inverse=True)
    return inv.astype(np.int64, copy=False).reshape(-1)


def signed_volume(verts: np.ndarray, faces: np.ndarray) -> float:
    """Signed volume enclosed by the mesh via the divergence theorem.

    Positive when face winding yields outward-facing normals for a closed
    solid, negative when the mesh is inside-out. Magnitude equals the enclosed
    volume for a watertight mesh.
    """
    if faces.size == 0:
        return 0.0
    v = verts.astype(float, copy=False)
    v0 = v[faces[:, 0]]
    v1 = v[faces[:, 1]]
    v2 = v[faces[:, 2]]
    return float(np.sum(np.einsum("ij,ij->i", v0, np.cross(v1, v2))) / 6.0)


def _directed_edge_counts(faces: np.ndarray, index_map: np.ndarray):
    """Return a dict {(a, b): count} of directed half-edges under index_map."""
    mapped = index_map[faces]  # (M, 3)
    a = mapped[:, [0, 1, 2]].reshape(-1)
    b = mapped[:, [1, 2, 0]].reshape(-1)
    keys = np.stack([a, b], axis=1)
    uniq, counts = np.unique(keys, axis=0, return_counts=True)
    return uniq, counts


def winding_defects(verts: np.ndarray, faces: np.ndarray, decimals: int = 6) -> int:
    """Count undirected edges whose two faces do **not** oppose each other.

    For a consistently wound closed manifold, every interior edge ``(a, b)`` is
    visited exactly once as ``a->b`` and once as ``b->a``. Any edge that is
    traversed the same direction twice (or is otherwise unbalanced) is a
    winding defect. Returns the number of such undirected edges.
    """
    index_map = _weld_indices(verts, decimals)
    uniq, counts = _directed_edge_counts(faces, index_map)
    lookup: Dict[tuple, int] = {
        (int(a), int(b)): int(c) for (a, b), c in zip(uniq, counts)
    }
    seen: set = set()
    defects = 0
    for (a, b), fwd in lookup.items():
        if (a, b) in seen or (b, a) in seen:
            continue
        seen.add((a, b))
        rev = lookup.get((b, a), 0)
        if not (fwd == 1 and rev == 1):
            defects += 1
    return defects


def manifold_report(verts: np.ndarray, faces: np.ndarray, decimals: int = 6) -> dict:
    """Summarise topology using position-welded connectivity.

    Returns a dict with:
      ``naked_edges``       edges used by exactly one face (holes / cracks),
      ``nonmanifold_edges`` edges used by more than two faces,
      ``winding_defects``   see :func:`winding_defects`,
      ``signed_volume``     see :func:`signed_volume`.
    """
    index_map = _weld_indices(verts, decimals)
    mapped = index_map[faces]
    a = mapped[:, [0, 1, 2]].reshape(-1)
    b = mapped[:, [1, 2, 0]].reshape(-1)
    lo = np.minimum(a, b)
    hi = np.maximum(a, b)
    und = np.stack([lo, hi], axis=1)
    _, counts = np.unique(und, axis=0, return_counts=True)
    naked = int(np.count_nonzero(counts == 1))
    nonmanifold = int(np.count_nonzero(counts > 2))
    return {
        "naked_edges": naked,
        "nonmanifold_edges": nonmanifold,
        "winding_defects": winding_defects(verts, faces, decimals),
        "signed_volume": signed_volume(verts, faces),
    }


def orient_outward(
    verts: np.ndarray, faces: np.ndarray, decimals: int = 6
) -> np.ndarray:
    """Return a copy of ``faces`` with unified, outward-facing winding.

    Algorithm (equivalent to Rhino's *Unify Mesh Normals*):

    1. Build directed-edge -> face adjacency over position-welded vertices.
    2. Flood-fill: starting from each unvisited face, propagate a consistent
       orientation to neighbours. If a neighbour shares an edge in the *same*
       direction, its winding disagrees and is flipped.
    3. After the whole mesh is consistent, compute the signed volume; if it is
       negative the surface is inside-out, so flip every face once.

    The input mesh is assumed manifold (each edge shared by <= 2 faces); the
    routine is robust to multiple connected components (each is oriented, then
    the global volume sign decides a single coherent flip).

    Only the face index columns are reordered (columns 1 and 2 swapped for
    flipped faces); vertex positions are untouched, so downstream vertex hashes
    and dimensions are preserved.
    """
    faces = np.asarray(faces)
    if faces.size == 0:
        return faces.copy()

    from collections import defaultdict, deque

    index_map = _weld_indices(verts, decimals)
    m = int(faces.shape[0])
    welded = index_map[faces]  # (M, 3) welded vertex ids

    # Undirected edge -> list of (face, u, v) recording each face's *original*
    # directed traversal of the edge. A manifold interior edge has two entries.
    adj: Dict[tuple, list] = defaultdict(list)
    for f in range(m):
        w0, w1, w2 = int(welded[f, 0]), int(welded[f, 1]), int(welded[f, 2])
        for u, v in ((w0, w1), (w1, w2), (w2, w0)):
            adj[(u, v) if u < v else (v, u)].append((f, u, v))

    flip = np.zeros(m, dtype=bool)
    visited = np.zeros(m, dtype=bool)

    for seed in range(m):
        if visited[seed]:
            continue
        visited[seed] = True
        queue = deque([seed])
        while queue:
            f = queue.popleft()
            ff = bool(flip[f])
            w0, w1, w2 = int(welded[f, 0]), int(welded[f, 1]), int(welded[f, 2])
            for u, v in ((w0, w1), (w1, w2), (w2, w0)):
                # f's *effective* traversal of this edge under its flip state.
                fu, fv = (u, v) if not ff else (v, u)
                for nb, nu, nv in adj[(u, v) if u < v else (v, u)]:
                    if nb == f or visited[nb]:
                        continue
                    # A consistent neighbour must traverse the edge opposite to
                    # f, i.e. (fv, fu). Choose nb's flip to achieve that.
                    flip[nb] = not ((nu, nv) == (fv, fu))
                    visited[nb] = True
                    queue.append(nb)

    out = faces.copy()
    if np.any(flip):
        out[flip] = out[flip][:, [0, 2, 1]]

    # Global orientation: ensure outward (positive signed volume).
    if signed_volume(verts, out) < 0.0:
        out = out[:, [0, 2, 1]]

    return out
