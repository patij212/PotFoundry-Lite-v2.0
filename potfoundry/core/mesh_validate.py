"""Mesh validation for export quality (PF2).

Consolidates the invariants that determine whether a triangle mesh imports as a
*valid closed solid* in CAD / parametric tools (Rhino, Grasshopper) and slices
cleanly:

- **Watertight** — every edge is shared by exactly two faces (no holes, no
  non-manifold edges shared by 3+ faces).
- **Oriented** — adjacent faces agree on winding (every directed half-edge has
  exactly one opposite twin); no flipped faces.
- **Outward** — the closed surface encloses positive signed volume, so normals
  point out of the material rather than into it.
- **Non-degenerate** — no zero-area / collapsed triangles.

The analysis is fully vectorized with numpy (no Python-per-face loops) so it is
cheap enough to run on every export.

Public API:
    validate_mesh(vertices, faces) -> MeshReport
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

__all__ = ["MeshReport", "validate_mesh"]


@dataclass(frozen=True)
class MeshReport:
    """Structured export-readiness report for a triangle mesh."""

    n_vertices: int
    n_faces: int
    n_degenerate_faces: int
    n_boundary_edges: int       # undirected edges used by exactly 1 face (holes)
    n_nonmanifold_edges: int    # undirected edges used by 3+ faces
    n_inconsistent_edges: int   # directed half-edges with no/!=1 opposite twin
    signed_volume: float

    @property
    def is_watertight(self) -> bool:
        return self.n_boundary_edges == 0 and self.n_nonmanifold_edges == 0

    @property
    def is_oriented(self) -> bool:
        return self.n_inconsistent_edges == 0

    @property
    def is_outward(self) -> bool:
        return self.signed_volume > 0.0

    @property
    def is_export_ready(self) -> bool:
        return (
            self.n_degenerate_faces == 0
            and self.is_watertight
            and self.is_oriented
            and self.is_outward
        )


def _signed_volume(vertices: np.ndarray, faces: np.ndarray) -> float:
    """Signed volume via the divergence theorem (positive => outward normals)."""
    if faces.shape[0] == 0:
        return 0.0
    v0 = vertices[faces[:, 0]]
    v1 = vertices[faces[:, 1]]
    v2 = vertices[faces[:, 2]]
    return float(np.einsum("ij,ij->i", v0, np.cross(v1, v2)).sum() / 6.0)


def validate_mesh(vertices: np.ndarray, faces: np.ndarray) -> MeshReport:
    """Validate a triangle mesh for export and return a :class:`MeshReport`.

    Args:
        vertices: Vertex array, shape (N, 3).
        faces: Triangle index array, shape (M, 3).

    Returns:
        MeshReport with per-defect counts and convenience boolean properties.
    """
    vertices = np.asarray(vertices)
    faces = np.asarray(faces)
    n_vertices = int(len(vertices))
    n_faces = int(len(faces))

    if n_faces == 0:
        return MeshReport(n_vertices, 0, 0, 0, 0, 0, 0.0)

    f = faces.astype(np.int64, copy=False)

    # --- Degenerate faces: any two of the three indices coincide.
    degenerate = (
        (f[:, 0] == f[:, 1]) | (f[:, 1] == f[:, 2]) | (f[:, 0] == f[:, 2])
    )
    n_degenerate = int(np.count_nonzero(degenerate))

    # Exclude degenerate faces from edge topology (their "edges" are meaningless).
    valid = f[~degenerate]

    # --- Directed half-edges (a, b) for each triangle: (0,1), (1,2), (2,0).
    a = valid[:, [0, 1, 2]].reshape(-1)
    b = valid[:, [1, 2, 0]].reshape(-1)

    # Encode each edge as a single int64 key (lo*n + hi). 1D unique is far
    # faster than row-wise np.unique(axis=0).
    n = (int(valid.max()) + 1) if valid.size else 1

    # Undirected edges for manifold/watertight counts.
    lo = np.minimum(a, b)
    hi = np.maximum(a, b)
    undirected_key = lo * n + hi
    _, counts = np.unique(undirected_key, return_counts=True)
    n_boundary = int(np.count_nonzero(counts == 1))
    n_nonmanifold = int(np.count_nonzero(counts > 2))

    # Orientation: a coherent closed mesh has, for each directed edge (a,b),
    # exactly one occurrence and exactly one occurrence of its reverse (b,a).
    fwd_key, dir_counts = np.unique(a * n + b, return_counts=True)  # sorted asc
    rev_key = (fwd_key % n) * n + (fwd_key // n)
    pos = np.searchsorted(fwd_key, rev_key)
    pos_clipped = np.clip(pos, 0, len(fwd_key) - 1)
    has_rev = fwd_key[pos_clipped] == rev_key
    rev_counts = np.where(has_rev, dir_counts[pos_clipped], 0)
    inconsistent = (dir_counts != 1) | (rev_counts != 1)
    n_inconsistent = int(np.count_nonzero(inconsistent))

    signed_vol = _signed_volume(vertices, valid)

    return MeshReport(
        n_vertices=n_vertices,
        n_faces=n_faces,
        n_degenerate_faces=n_degenerate,
        n_boundary_edges=n_boundary,
        n_nonmanifold_edges=n_nonmanifold,
        n_inconsistent_edges=n_inconsistent,
        signed_volume=signed_vol,
    )
