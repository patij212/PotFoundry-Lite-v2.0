"""Coherent outward orientation for triangular meshes (export quality).

PotFoundry assembles each pot from several independently-built regions (outer
wall, inner wall, rim, bottom slab, drain cylinder). Each region is internally
watertight, but neighbouring regions historically disagreed on winding at their
shared junctions, and the assembly as a whole was wound inside-out. The result
was a mesh that is *watertight* yet not a *solid*: Rhino, Grasshopper and other
CAD/NURBS tools refuse to recognise it as closed, report flipped/naked normals,
and compute negative volumes.

This module repairs that generically, independent of how the regions are built:

  1. Propagate a consistent winding across the manifold so that every interior
     edge is traversed in opposite directions by its two faces (a coherently
     oriented manifold).
  2. Flip the whole mesh if its signed volume is negative, so face normals point
     outward.

The pass is deterministic (faces keep their row positions; only vertex order
within a triangle may be reversed) so it does not disturb golden-mesh hashing or
determinism guarantees.

Implementation notes
--------------------
Coherent orientation is a 2-colouring of the dual graph: assign each face a flip
bit so that, across every shared edge ``e`` between faces ``i`` and ``j``::

    flip_i XOR flip_j = same_direction(e)

where ``same_direction(e)`` is 1 when both faces traverse ``e`` the same way in
their original winding (i.e. they currently disagree on orientation). The edge
adjacency is built with vectorised numpy; only the constraint propagation itself
is a tight array-indexed traversal, which keeps the pass within the mesh-build
performance budget even at high resolution.
"""
from __future__ import annotations

import numpy as np

__all__ = ["signed_volume", "orient_outward"]


def signed_volume(verts: np.ndarray, faces: np.ndarray) -> float:
    """Signed volume of a closed triangular mesh via the divergence theorem.

    Positive when faces are wound so their normals point outward; negative when
    the mesh is wound inside-out. The magnitude is the enclosed volume.
    """
    if faces.size == 0:
        return 0.0
    v0 = verts[faces[:, 0]]
    v1 = verts[faces[:, 1]]
    v2 = verts[faces[:, 2]]
    return float(np.sum(np.einsum("ij,ij->i", v0, np.cross(v1, v2))) / 6.0)


def _build_dual_adjacency(faces: np.ndarray):
    """Return CSR dual-graph adjacency plus per-edge same-direction flags.

    For a closed manifold every undirected edge is shared by exactly two faces.
    Returns ``(indptr, neighbours, same_dir)`` where, for face ``f``, the slice
    ``neighbours[indptr[f]:indptr[f+1]]`` lists its edge-adjacent faces and the
    parallel ``same_dir`` slice is 1 where the two faces wind that shared edge in
    the same direction (an orientation conflict). Returns ``None`` if the mesh is
    not a clean 2-manifold (some edge used by other than two directed half-edges).
    """
    m = faces.shape[0]
    n = int(faces.max()) + 1 if faces.size else 0

    # Directed half-edges: (m*3, 2) with the originating face for each.
    he = np.empty((m, 3, 2), dtype=np.int64)
    he[:, 0] = faces[:, [0, 1]]
    he[:, 1] = faces[:, [1, 2]]
    he[:, 2] = faces[:, [2, 0]]
    he = he.reshape(-1, 2)
    he_face = np.repeat(np.arange(m, dtype=np.int64), 3)

    lo = np.minimum(he[:, 0], he[:, 1])
    hi = np.maximum(he[:, 0], he[:, 1])
    key = lo * n + hi

    order = np.argsort(key, kind="stable")
    key_s = key[order]
    he_s = he[order]
    face_s = he_face[order]

    # Every undirected edge of a closed manifold appears exactly twice.
    if key_s.shape[0] % 2 != 0 or not np.array_equal(key_s[0::2], key_s[1::2]):
        return None

    he0 = he_s[0::2]
    he1 = he_s[1::2]
    f0 = face_s[0::2]
    f1 = face_s[1::2]
    # Same direction iff the two half-edges have identical source vertex.
    same = (he0[:, 0] == he1[:, 0]).astype(np.int8)

    # Build symmetric CSR adjacency.
    src = np.concatenate([f0, f1])
    dst = np.concatenate([f1, f0])
    sval = np.concatenate([same, same])
    counts = np.bincount(src, minlength=m)
    indptr = np.empty(m + 1, dtype=np.int64)
    indptr[0] = 0
    np.cumsum(counts, out=indptr[1:])
    perm = np.argsort(src, kind="stable")
    neighbours = dst[perm]
    same_dir = sval[perm]
    return indptr, neighbours, same_dir


def _coherent_flip_bits(indptr, neighbours, same_dir, m: int) -> np.ndarray:
    """Solve flip_i XOR flip_j = same_dir(e) by BFS over each component.

    The traversal touches every face, so the inner loop runs on plain Python
    lists (scalar access is several times faster than indexing numpy arrays),
    keeping the pass within the mesh-build performance budget at high resolution.
    """
    indptr_l = indptr.tolist()
    neighbours_l = neighbours.tolist()
    same_dir_l = same_dir.tolist()
    flip = [-1] * m
    for seed in range(m):
        if flip[seed] != -1:
            continue
        flip[seed] = 0
        stack = [seed]
        while stack:
            u = stack.pop()
            fu = flip[u]
            for idx in range(indptr_l[u], indptr_l[u + 1]):
                v = neighbours_l[idx]
                if flip[v] == -1:
                    flip[v] = fu ^ same_dir_l[idx]
                    stack.append(v)
    return np.asarray(flip, dtype=np.int8)


def orient_outward(verts: np.ndarray, faces: np.ndarray) -> np.ndarray:
    """Return ``faces`` re-wound into a coherent, outward-facing orientation.

    The input is assumed to be a watertight 2-manifold (every interior edge
    shared by exactly two faces). Faces keep their row order; only the vertex
    order within a triangle may be reversed. The original array is not mutated.

    Args:
        verts: Vertex array, shape ``(N, 3)``.
        faces: Triangle index array, shape ``(M, 3)``.

    Returns:
        A new ``(M, 3)`` int array wound so that normals point outward.
    """
    faces = np.array(faces, dtype=np.int64, copy=True)
    m = faces.shape[0]
    if m == 0:
        return faces

    adjacency = _build_dual_adjacency(faces)
    if adjacency is not None:
        indptr, neighbours, same_dir = adjacency
        flip = _coherent_flip_bits(indptr, neighbours, same_dir, m)
        flipped = flip == 1
        faces[flipped] = faces[flipped][:, ::-1]

    # Coherently oriented; flip globally if wound inside-out.
    if signed_volume(verts, faces) < 0.0:
        faces = faces[:, ::-1].copy()

    return faces
