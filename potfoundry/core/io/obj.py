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

from pathlib import Path
from typing import Optional, Union

import numpy as np

from .stl import atomic_write_bytes

__all__ = ["write_obj", "compute_vertex_normals"]


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


def _format_obj(name: str, vertices: np.ndarray, faces: np.ndarray,
                normals: np.ndarray) -> bytes:
    """Build the full OBJ text as bytes (vectorised, deterministic)."""
    v = np.asarray(vertices, dtype=np.float64)
    n = np.asarray(normals, dtype=np.float64)
    f = np.asarray(faces, dtype=np.int64) + 1  # OBJ is 1-based

    lines = [
        f"# PotFoundry OBJ export: {name}",
        f"# vertices: {len(v)}  faces: {len(f)}",
        f"o {name or 'potfoundry'}",
    ]

    # Vertices and normals: fixed precision keeps output deterministic & compact.
    lines.extend(
        f"v {x:.6f} {y:.6f} {z:.6f}" for x, y, z in v
    )
    lines.extend(
        f"vn {x:.6f} {y:.6f} {z:.6f}" for x, y, z in n
    )
    # Faces share vertex and normal indices (welded, smooth): f v//vn.
    lines.extend(
        f"f {i}//{i} {j}//{j} {k}//{k}" for i, j, k in f
    )

    return ("\n".join(lines) + "\n").encode("ascii")


def write_obj(path: Union[str, Path], name: str, vertices: np.ndarray,
              faces: np.ndarray, normals: Optional[np.ndarray] = None) -> Path:
    """Write a welded, smooth-normal mesh to a Wavefront OBJ file.

    Args:
        path: Output file path.
        name: Object name (written as the ``o`` record).
        vertices: Vertex array (N, 3).
        faces: Triangle indices (M, 3).
        normals: Optional per-vertex normals (N, 3). Computed (smooth,
            area-weighted) when omitted.

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

    if normals is None:
        normals = compute_vertex_normals(vertices, faces)
    else:
        normals = np.asarray(normals, dtype=float)
        if normals.shape != vertices.shape:
            raise ValueError(
                f"normals must match vertices shape {vertices.shape}, "
                f"got {normals.shape}"
            )

    atomic_write_bytes(path, _format_obj(name, vertices, faces, normals))
    return path
