"""Mesh validation — the "is this CAD-ready?" guarantee (PF2).

Rhino / Grasshopper expect imported meshes to be *closed* (watertight),
*manifold*, *consistently wound*, and free of *degenerate* or *duplicate*
faces; its ``_Check`` / ``_UnifyMeshNormals`` commands flag exactly these
defects. :func:`validate_mesh` mirrors those criteria so PotFoundry can assert,
before export, that a mesh will import cleanly — and so any future style or
parameter change that breaks topology fails loudly here rather than producing a
silently broken file.

Definitions used here (for a triangle soup with shared/indexed vertices):

* **naked edge** — an undirected edge used by exactly one face (a hole / open
  boundary). A closed mesh has none.
* **non-manifold edge** — an undirected edge used by three or more faces.
* **watertight** — no naked and no non-manifold edges (every edge used twice).
* **manifold** — no non-manifold edges.
* **consistently wound** — orientable: no directed edge ``(a, b)`` is produced
  by two different faces. In a coherently oriented closed mesh each directed
  edge occurs once and its reverse occurs once.
* **degenerate face** — a triangle with a repeated vertex index or ~zero area.
* **duplicate face** — the same vertex triple (any winding) used by >1 face.

Public API:
    validate_mesh(vertices, faces) -> MeshReport
"""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field

import numpy as np

__all__ = ["MeshReport", "validate_mesh"]


@dataclass
class MeshReport:
    """Result of :func:`validate_mesh`.

    ``ok`` is the single gate to check before export; the individual fields and
    ``issues`` explain *why* when it is False.
    """

    vertex_count: int
    face_count: int
    naked_edges: int
    non_manifold_edges: int
    degenerate_faces: int
    duplicate_faces: int
    is_consistently_wound: bool
    signed_volume: float
    issues: list[str] = field(default_factory=list)

    @property
    def is_watertight(self) -> bool:
        return self.naked_edges == 0 and self.non_manifold_edges == 0

    @property
    def is_manifold(self) -> bool:
        return self.non_manifold_edges == 0

    @property
    def is_outward(self) -> bool:
        """True when face normals point out of the solid (positive volume).

        Only meaningful for a watertight, coherently wound mesh; for an open or
        incoherent mesh the signed volume is not a reliable orientation signal.
        """
        return self.signed_volume > 0.0

    @property
    def ok(self) -> bool:
        return (
            self.is_watertight
            and self.is_manifold
            and self.is_consistently_wound
            and self.degenerate_faces == 0
            and self.duplicate_faces == 0
        )


def validate_mesh(vertices: np.ndarray, faces: np.ndarray, *, area_eps: float = 1e-9) -> MeshReport:
    """Validate an indexed triangle mesh for CAD (Rhino/Grasshopper) export.

    Args:
        vertices: Vertex array, shape (N, 3).
        faces: Triangle index array, shape (M, 3), 0-based.
        area_eps: Triangles whose area is <= this are treated as degenerate.

    Returns:
        MeshReport: Topology/geometry findings. Check ``report.ok`` before export.
    """
    v = np.asarray(vertices, dtype=float)
    f = np.asarray(faces, dtype=np.int64)
    if f.ndim != 2 or f.shape[1] != 3:
        raise ValueError(f"faces must have shape (M, 3), got {f.shape}")

    issues: list[str] = []

    # --- Degenerate faces: repeated vertex index, or ~zero geometric area.
    repeated = (
        (f[:, 0] == f[:, 1]) | (f[:, 1] == f[:, 2]) | (f[:, 0] == f[:, 2])
    )
    v0, v1, v2 = v[f[:, 0]], v[f[:, 1]], v[f[:, 2]]
    cross = np.cross(v1 - v0, v2 - v0)
    areas = 0.5 * np.linalg.norm(cross, axis=1)
    degenerate_mask = repeated | (areas <= area_eps)

    # Signed volume via the divergence theorem (sum of tetra (v0 . (v1 x v2))/6).
    # For a watertight, coherently wound mesh this equals +/- the enclosed volume;
    # positive means outward-pointing normals (the export convention).
    signed_volume = float(np.einsum("ij,ij->i", v0, cross).sum() / 6.0)
    degenerate_faces = int(np.count_nonzero(degenerate_mask))
    if degenerate_faces:
        issues.append(f"{degenerate_faces} degenerate face(s) (repeated vertex or zero area)")

    # --- Duplicate faces: same vertex triple regardless of winding.
    sorted_tris = np.sort(f, axis=1)
    tri_counts = Counter(map(tuple, sorted_tris.tolist()))
    duplicate_faces = sum(c - 1 for c in tri_counts.values() if c > 1)
    if duplicate_faces:
        issues.append(f"{duplicate_faces} duplicate face(s)")

    # --- Edge topology. Skip degenerate faces so their bogus edges don't mask
    # real defects; they are reported separately above.
    good = f[~degenerate_mask]

    undirected: Counter = Counter()
    directed: Counter = Counter()
    for a, b, c in good.tolist():
        for x, y in ((a, b), (b, c), (c, a)):
            undirected[(x, y) if x < y else (y, x)] += 1
            directed[(x, y)] += 1

    naked_edges = sum(1 for cnt in undirected.values() if cnt == 1)
    non_manifold_edges = sum(1 for cnt in undirected.values() if cnt > 2)
    # Orientation: any directed edge produced by two faces => inconsistent winding.
    is_consistently_wound = all(cnt <= 1 for cnt in directed.values())

    if naked_edges:
        issues.append(f"{naked_edges} naked edge(s) (mesh not watertight / has holes)")
    if non_manifold_edges:
        issues.append(f"{non_manifold_edges} non-manifold edge(s) (shared by >2 faces)")
    if not is_consistently_wound:
        issues.append("inconsistent winding (mesh not coherently oriented)")

    return MeshReport(
        vertex_count=int(v.shape[0]),
        face_count=int(f.shape[0]),
        naked_edges=naked_edges,
        non_manifold_edges=non_manifold_edges,
        degenerate_faces=degenerate_faces,
        duplicate_faces=duplicate_faces,
        is_consistently_wound=is_consistently_wound,
        signed_volume=signed_volume,
        issues=issues,
    )
