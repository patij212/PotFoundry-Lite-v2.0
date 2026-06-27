"""Mesh quality utilities (orientation / manifold repair).

These helpers harden the export pipeline for CAD targets such as Rhino and
Grasshopper, which respect triangle winding. A mesh that is undirected-watertight
can still be unusable there if its faces are inconsistently wound or globally
inverted (normals pointing inward), breaking shading, boolean operations and
some slicers.

``build_pot_mesh`` already emits a consistently outward-oriented manifold by
construction (see ``potfoundry/core/geometry.py``), so this module is *not* on
the hot export path. It exists as a reusable safety net for any other mesh that
enters the pipeline (imported geometry, boolean results, experimental builders).

Public API:
    signed_volume(verts, faces) -> float
    is_consistently_oriented(faces) -> bool
    orient_outward(verts, faces) -> np.ndarray   # repaired faces
"""
from __future__ import annotations

from collections import defaultdict, deque

import numpy as np

__all__ = ["signed_volume", "is_consistently_oriented", "orient_outward"]


def signed_volume(verts: np.ndarray, faces: np.ndarray) -> float:
    """Signed volume of a triangle mesh via the divergence theorem.

    Positive when the faces are consistently wound with **outward** normals,
    negative when the mesh is inside-out. Magnitude equals the enclosed volume
    for a closed, consistently oriented manifold.

    Args:
        verts: Vertex array (N, 3)
        faces: Triangle index array (M, 3)

    Returns:
        Signed volume (same length units cubed as ``verts``).
    """
    v0 = verts[faces[:, 0]]
    v1 = verts[faces[:, 1]]
    v2 = verts[faces[:, 2]]
    return float(np.einsum("ij,ij->i", v0, np.cross(v1, v2)).sum() / 6.0)


def is_consistently_oriented(faces: np.ndarray) -> bool:
    """True iff every directed edge (a -> b) appears at most once.

    For a closed manifold this is equivalent to "each shared edge is traversed
    in opposite directions by its two faces" — i.e. consistent winding. A
    directed edge seen twice means two adjacent faces disagree on orientation.

    Args:
        faces: Triangle index array (M, 3)

    Returns:
        True if no directed edge is repeated.
    """
    seen: set[tuple[int, int]] = set()
    for f in faces:
        a, b, c = int(f[0]), int(f[1]), int(f[2])
        for e in ((a, b), (b, c), (c, a)):
            if e in seen:
                return False
            seen.add(e)
    return True


def orient_outward(verts: np.ndarray, faces: np.ndarray) -> np.ndarray:
    """Return a copy of ``faces`` re-wound to a consistent, outward orientation.

    Algorithm (per connected component over shared edges):
      1. Flood-fill the face adjacency graph, flipping any neighbour that
         traverses a shared edge in the *same* direction as the current face.
         This makes the component consistently oriented (all-in or all-out).
      2. Flip the whole component if its signed volume is negative, so normals
         point outward.

    This is a topological repair; it does not weld vertices or fix
    self-intersections. Components must share vertex *indices* on their seams
    (as PotFoundry's builder does) for adjacency to be detected.

    Args:
        verts: Vertex array (N, 3)
        faces: Triangle index array (M, 3)

    Returns:
        New (M, 3) int64 face array with repaired winding.
    """
    faces = np.array(faces, dtype=np.int64, copy=True)
    n_faces = len(faces)
    if n_faces == 0:
        return faces

    # Undirected edge -> faces touching it.
    edge_faces: dict[tuple[int, int], list[int]] = defaultdict(list)
    for fi in range(n_faces):
        a, b, c = int(faces[fi, 0]), int(faces[fi, 1]), int(faces[fi, 2])
        for u, v in ((a, b), (b, c), (c, a)):
            edge_faces[(u, v) if u < v else (v, u)].append(fi)

    visited = np.zeros(n_faces, dtype=bool)
    for seed in range(n_faces):
        if visited[seed]:
            continue
        visited[seed] = True
        component = [seed]
        queue = deque([seed])
        while queue:
            fi = queue.popleft()
            a, b, c = int(faces[fi, 0]), int(faces[fi, 1]), int(faces[fi, 2])
            for p, q in ((a, b), (b, c), (c, a)):
                key = (p, q) if p < q else (q, p)
                for nf in edge_faces[key]:
                    if nf == fi or visited[nf]:
                        continue
                    na, nb, nc = int(faces[nf, 0]), int(faces[nf, 1]), int(faces[nf, 2])
                    # Consistent neighbours traverse this edge as (q, p).
                    if (p, q) in ((na, nb), (nb, nc), (nc, na)):
                        faces[nf] = faces[nf][::-1]
                    visited[nf] = True
                    component.append(nf)
                    queue.append(nf)
        if signed_volume(verts, faces[component]) < 0:
            faces[component] = faces[component][:, ::-1]
    return faces
