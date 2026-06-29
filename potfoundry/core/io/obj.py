"""Wavefront OBJ writer for Rhino/Grasshopper-friendly export (PF2).

Why OBJ in addition to STL?
    STL stores three raw vertex coordinates per triangle. It has **no shared
    topology** (the mesh arrives as unwelded triangle soup) and **no smooth
    normals**. When such a file is imported into Rhino/Grasshopper the result is
    tens of thousands of loose triangles that must be welded by hand before the
    surface is usable.

    OBJ preserves the *welded* vertex topology that :func:`build_pot_mesh`
    already produces — one ``v`` per vertex, faces referencing shared 1-based
    indices — and carries smooth per-vertex normals (``vn``). The import is a
    single connected, coherently oriented, smooth-shaded mesh: a clean base for
    QuadRemesh, loft, or direct reference.

Public API:
    write_obj(path, name, vertices, faces[, normals]) -> Path

Implementation notes:
    - Vertex normals are area-weighted averages of incident face normals,
      computed on the welded topology, so they point outward (the builder emits
      a coherently outward-oriented mesh).
    - Faces are written as ``f v//vn`` with 1-based indices per the OBJ spec.
    - Output is built as a single buffer and written atomically (reusing the STL
      atomic-write helper) to avoid partial/corrupt files.
    - Deterministic: identical input always yields byte-identical output.
"""
from __future__ import annotations

from collections import defaultdict
from pathlib import Path
from typing import Optional, Tuple, Union

import numpy as np

from .stl import atomic_write_bytes

__all__ = ["write_obj", "compute_vertex_normals", "compute_corner_normals"]

# Default crease threshold: edges sharper than this keep a hard shading break.
# 30 deg cleanly separates the ~90 deg rim / foot / drain edges from the gently
# curving walls, so walls stay smooth while functional edges stay crisp.
DEFAULT_CREASE_ANGLE_DEG = 30.0


def compute_vertex_normals(vertices: np.ndarray, faces: np.ndarray) -> np.ndarray:
    """Smooth per-vertex normals (area-weighted average of face normals).

    The cross product ``(b-a) x (c-a)`` has magnitude proportional to twice the
    triangle area, so accumulating the *un-normalised* face normal at each of a
    face's vertices yields an area-weighted average for free. Normals inherit the
    face winding, so for a coherently outward-oriented mesh they point outward.

    Args:
        vertices: Vertex array (N, 3).
        faces: Triangle indices (M, 3).

    Returns:
        Unit vertex normals (N, 3), float32. Vertices with no usable incident
        area fall back to a radial-outward direction (or +Z on the axis).
    """
    v = vertices.astype(np.float64, copy=False)
    f = faces.astype(np.int64, copy=False)

    a = v[f[:, 0]]
    b = v[f[:, 1]]
    c = v[f[:, 2]]
    face_n = np.cross(b - a, c - a)  # area-weighted (not normalised)

    vn = np.zeros((v.shape[0], 3), dtype=np.float64)
    # Accumulate each face's normal onto its three vertices.
    np.add.at(vn, f[:, 0], face_n)
    np.add.at(vn, f[:, 1], face_n)
    np.add.at(vn, f[:, 2], face_n)

    lengths = np.linalg.norm(vn, axis=1)
    good = lengths > 1e-12
    vn[good] /= lengths[good, None]

    # Fallback for degenerate vertices: radial outward, else +Z.
    if not np.all(good):
        bad = ~good
        radial = v[bad, :2]
        rlen = np.linalg.norm(radial, axis=1)
        out = np.zeros((bad.sum(), 3), dtype=np.float64)
        has_r = rlen > 1e-9
        out[has_r, :2] = radial[has_r] / rlen[has_r, None]
        out[~has_r] = np.array([0.0, 0.0, 1.0])
        vn[bad] = out

    return vn.astype(np.float32, copy=False)


def compute_corner_normals(
    vertices: np.ndarray, faces: np.ndarray, crease_angle_deg: float
) -> Tuple[np.ndarray, np.ndarray]:
    """Crease-aware per-face-corner normals (hard edges stay hard).

    For each face corner at vertex ``v``, the normal is the area-weighted average
    of only those faces incident to ``v`` whose face normal lies within
    ``crease_angle_deg`` of this face's normal. Corners across a sharp edge
    therefore average over *different* face sets and receive distinct normals,
    so the edge renders crisp; corners on a smooth surface share one normal.

    Args:
        vertices: Vertex array (N, 3).
        faces: Triangle indices (M, 3).
        crease_angle_deg: Dihedral threshold; larger faces share normals only if
            their normals are within this angle.

    Returns:
        (normals, corner_index):
            normals      — unique unit normals (K, 3), float32.
            corner_index — per-face normal indices (M, 3), 0-based into normals.
    """
    v = vertices.astype(np.float64, copy=False)
    f = faces.astype(np.int64, copy=False)
    n_verts = v.shape[0]

    a = v[f[:, 0]]
    b = v[f[:, 1]]
    c = v[f[:, 2]]
    face_raw = np.cross(b - a, c - a)  # area-weighted
    area = np.linalg.norm(face_raw, axis=1)
    unit = np.zeros_like(face_raw)
    good = area > 1e-12
    unit[good] = face_raw[good] / area[good, None]

    cos_thr = float(np.cos(np.radians(crease_angle_deg)))

    # Start from fully-smooth per-vertex normals; these are exactly correct for
    # every vertex whose incident faces all agree (i.e. not on a crease).
    smooth = compute_vertex_normals(v, f).astype(np.float64)
    normals: list[np.ndarray] = [smooth[i] for i in range(n_verts)]
    corner_index = faces.astype(np.int64, copy=True)  # vn index == vertex index

    # Flag crease vertices: those where some incident face normal deviates from
    # the smooth normal by more than half the crease angle. This is a cheap,
    # vectorised pre-filter — a conservative superset of true crease vertices —
    # so the expensive per-vertex pass only runs on the rim/foot/drain rings.
    cos_flag = float(np.cos(np.radians(crease_angle_deg * 0.5)))
    min_dot = np.ones(n_verts, dtype=np.float64)
    for k in range(3):
        d = np.einsum("ij,ij->i", unit, smooth[f[:, k]])
        np.minimum.at(min_dot, f[:, k], d)
    crease_vert = min_dot < cos_flag

    if not np.any(crease_vert):
        return np.asarray(normals, dtype=np.float32), corner_index

    # Incident face rows for crease vertices only. Restrict to faces that touch
    # at least one crease vertex (a small band around rim/foot/drain).
    fview = f
    candidate_rows = np.where(crease_vert[fview].any(axis=1))[0]
    v2f: dict[int, list[int]] = defaultdict(list)
    for row in candidate_rows.tolist():
        for local in range(3):
            vid = int(fview[row, local])
            if crease_vert[vid]:
                v2f[vid].append(row)

    dedup: dict[tuple, int] = {}
    for vid, rows in v2f.items():
        idx = np.asarray(rows, dtype=np.int64)
        u = unit[idx]             # (k, 3) unit face normals
        w = area[idx]             # (k,)  area weights
        compat = (u @ u.T) >= cos_thr  # faces that blend at this vertex
        corner_norms = (compat * w[None, :]) @ u  # (k, 3)
        lens = np.linalg.norm(corner_norms, axis=1)
        nz = lens > 1e-12
        corner_norms[nz] /= lens[nz, None]
        corner_norms[~nz] = u[~nz]  # isolated/degenerate: use own face normal

        for i, row in enumerate(rows):
            nrm = corner_norms[i]
            key = (round(float(nrm[0]), 5),
                   round(float(nrm[1]), 5),
                   round(float(nrm[2]), 5))
            ni = dedup.get(key)
            if ni is None:
                ni = len(normals)
                dedup[key] = ni
                normals.append(nrm)
            local = int(np.where(fview[row] == vid)[0][0])
            corner_index[row, local] = ni

    return np.asarray(normals, dtype=np.float32), corner_index


def _format_obj(name: str, vertices: np.ndarray, faces: np.ndarray,
                normals: np.ndarray, corner_index: np.ndarray) -> bytes:
    """Build the full OBJ text as bytes (deterministic).

    ``corner_index`` holds 0-based normal indices per face corner; together with
    the 1-based vertex indices this writes ``f v//vn`` records that support both
    smooth (one normal per vertex) and crease (split normals) modes.
    """
    v = np.asarray(vertices, dtype=np.float64)
    n = np.asarray(normals, dtype=np.float64)
    f = np.asarray(faces, dtype=np.int64) + 1     # OBJ is 1-based
    ni = np.asarray(corner_index, dtype=np.int64) + 1

    lines = [
        f"# PotFoundry OBJ export: {name}",
        f"# vertices: {len(v)}  faces: {len(f)}  normals: {len(n)}",
        f"o {name or 'potfoundry'}",
    ]

    # Vertices and normals: fixed precision keeps output deterministic & compact.
    lines.extend(
        f"v {x:.6f} {y:.6f} {z:.6f}" for x, y, z in v
    )
    lines.extend(
        f"vn {x:.6f} {y:.6f} {z:.6f}" for x, y, z in n
    )
    # f v//vn with welded vertex indices and (possibly split) normal indices.
    lines.extend(
        f"f {f[r,0]}//{ni[r,0]} {f[r,1]}//{ni[r,1]} {f[r,2]}//{ni[r,2]}"
        for r in range(len(f))
    )

    return ("\n".join(lines) + "\n").encode("ascii")


def write_obj(path: Union[str, Path], name: str, vertices: np.ndarray,
              faces: np.ndarray, normals: Optional[np.ndarray] = None,
              crease_angle_deg: Optional[float] = DEFAULT_CREASE_ANGLE_DEG) -> Path:
    """Write a welded mesh to a Wavefront OBJ file (Rhino/Grasshopper-friendly).

    Args:
        path: Output file path.
        name: Object name (written as the ``o`` record).
        vertices: Vertex array (N, 3).
        faces: Triangle indices (M, 3).
        normals: Optional explicit per-vertex normals (N, 3). When given they are
            written as-is (one per vertex) and ``crease_angle_deg`` is ignored.
        crease_angle_deg: Crease threshold in degrees (default 30). Faces meeting
            at an edge sharper than this keep distinct (split) normals so the edge
            renders crisp; smoother edges share a normal. Pass ``None`` for fully
            smooth shading (exactly one normal per vertex).

    Returns:
        Path: Resolved path to the written OBJ file.

    Note:
        Uses atomic write-and-replace; output is deterministic for given input.
    """
    path = Path(path)
    vertices = np.asarray(vertices, dtype=float)
    faces = np.asarray(faces, dtype=int)
    if vertices.ndim != 2 or vertices.shape[1] != 3:
        raise ValueError(f"vertices must be (N, 3), got {vertices.shape}")
    if faces.ndim != 2 or faces.shape[1] != 3:
        raise ValueError(f"faces must be (M, 3), got {faces.shape}")

    if normals is not None:
        # Caller-supplied per-vertex normals: smooth, one per vertex.
        normals = np.asarray(normals, dtype=float)
        if normals.shape != vertices.shape:
            raise ValueError(
                f"normals must match vertices shape {vertices.shape}, "
                f"got {normals.shape}"
            )
        corner_index = np.broadcast_to(
            faces, faces.shape
        )  # vn index == v index
    elif crease_angle_deg is None:
        # Fully smooth: one area-weighted normal per vertex.
        normals = compute_vertex_normals(vertices, faces)
        corner_index = faces
    else:
        # Crease-aware: split normals at sharp edges (default).
        normals, corner_index = compute_corner_normals(
            vertices, faces, crease_angle_deg
        )

    atomic_write_bytes(
        path, _format_obj(name, vertices, faces, normals, corner_index)
    )
    return path
