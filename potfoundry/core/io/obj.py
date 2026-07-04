"""Wavefront OBJ writer — indexed-mesh export for Rhino / Grasshopper (PF2).

Unlike STL (which de-indexes every triangle into three standalone vertices and
forces the importer to re-weld duplicates by a distance tolerance), OBJ stores a
shared vertex table plus 1-based face indices. The exact topology PotFoundry
builds is therefore preserved on import: Rhino and Grasshopper weld nothing and
the mesh comes in as a guaranteed-closed manifold with the winding/normals it
was authored with.

Public API:
    write_obj(path, name, vertices, faces[, include_normals]) -> Path

Implementation notes:
    * Uses numpy text formatting for the vertex/face blocks (fast for the tens
      of thousands of lines a typical pot produces).
    * Faces are emitted 1-based per the OBJ specification.
    * Writes atomically (temp file + os.replace) to avoid partial files.
    * Optional smooth, area-weighted per-vertex normals for shading; when
      requested, faces are emitted as ``f v//vn`` referencing them.
"""

from __future__ import annotations

import io as _io
from pathlib import Path
from typing import Union

import numpy as np

from .stl import atomic_write_bytes

__all__ = ["write_obj"]


def _vertex_normals(vertices: np.ndarray, faces: np.ndarray) -> np.ndarray:
    """Area-weighted smooth per-vertex normals (unit length).

    Each face contributes its (unnormalised) cross product — whose magnitude is
    proportional to twice the triangle area — to each of its vertices, so larger
    faces weigh more. The winding of ``faces`` sets the sign, so as long as the
    mesh is coherently wound outward the resulting normals point outward too.
    """
    v = vertices.astype(np.float64, copy=False)
    f = faces.astype(np.int64, copy=False)
    a = v[f[:, 0]]
    b = v[f[:, 1]]
    c = v[f[:, 2]]
    fn = np.cross(b - a, c - a)  # area-weighted face normals

    vn = np.zeros_like(v)
    np.add.at(vn, f[:, 0], fn)
    np.add.at(vn, f[:, 1], fn)
    np.add.at(vn, f[:, 2], fn)

    lengths = np.linalg.norm(vn, axis=1)
    nonzero = lengths > 0
    vn[nonzero] /= lengths[nonzero][:, None]
    return vn


def write_obj(
    path: Union[str, Path],
    name: str,
    vertices: np.ndarray,
    faces: np.ndarray,
    include_normals: bool = False,
) -> Path:
    """Write a triangle mesh to a Wavefront OBJ file (indexed).

    Args:
        path: Output file path.
        name: Object name (written as an ``o <name>`` record).
        vertices: Vertex array, shape (N, 3).
        faces: Triangle index array, shape (M, 3), 0-based.
        include_normals: When True, also write smooth per-vertex normals and
            reference them from every face as ``f v//vn``.

    Returns:
        Path: Resolved path to the written OBJ file.

    Note:
        Face indices are written 1-based per the OBJ specification. The vertex
        table is preserved exactly (no de-indexing), so re-importing the file
        reproduces the original topology without any welding.
    """
    path = Path(path)
    vertices = np.asarray(vertices, dtype=float)
    faces = np.asarray(faces, dtype=np.int64)
    if vertices.ndim != 2 or vertices.shape[1] != 3:
        raise ValueError(f"vertices must have shape (N, 3), got {vertices.shape}")
    if faces.ndim != 2 or faces.shape[1] != 3:
        raise ValueError(f"faces must have shape (M, 3), got {faces.shape}")

    buf = _io.StringIO()
    safe_name = (name or "potfoundry").replace("\n", " ").strip() or "potfoundry"
    buf.write("# PotFoundry OBJ export\n")
    buf.write(f"o {safe_name}\n")

    np.savetxt(buf, vertices, fmt="v %.6f %.6f %.6f")

    faces_1 = faces + 1  # OBJ is 1-based
    if include_normals:
        normals = _vertex_normals(vertices, faces)
        np.savetxt(buf, normals, fmt="vn %.6f %.6f %.6f")
        # f v1//vn1 v2//vn2 v3//vn3  (vn index == v index here)
        cols = [faces_1[:, i].astype(str) for i in range(3)]
        lines = (
            "f "
            + cols[0]
            + "//"
            + cols[0]
            + " "
            + cols[1]
            + "//"
            + cols[1]
            + " "
            + cols[2]
            + "//"
            + cols[2]
        )
        buf.write("\n".join(lines.tolist()))
        buf.write("\n")
    else:
        np.savetxt(buf, faces_1, fmt="f %d %d %d")

    atomic_write_bytes(path, buf.getvalue().encode("utf-8"))
    return path
