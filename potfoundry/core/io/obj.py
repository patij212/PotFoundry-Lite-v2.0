"""Wavefront OBJ writer for Rhino / Grasshopper-quality export.

Why OBJ in addition to STL?

STL is the right format for slicers, but a poor one for CAD. An STL file is
unwelded triangle *soup*: every triangle repeats its three vertex positions
and carries only a per-face normal. When Rhino or Grasshopper import that,
they must weld coincident vertices by tolerance and they cannot recover
smooth shading or the original quad grid.

OBJ fixes all three:

* **Shared vertices** — faces reference a single welded vertex list, so the
  mesh imports closed and connected without a weld pass.
* **Quad topology** — :func:`potfoundry.build_pot_quads` produces a clean
  quad grid; OBJ preserves it, which Rhino/Grasshopper turn into tidy SubD
  or NURBS surfaces.
* **Smooth vertex normals** — optional per-vertex normals give continuous
  shading across the curved wall instead of faceted STL look.

Public API:
    write_obj(path, name, vertices, faces[, vertex_normals]) -> Path
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional, Sequence, Union

import numpy as np

from .stl import atomic_write_bytes

__all__ = ["write_obj"]


def _face_iter(faces) -> list[list[int]]:
    """Normalise faces into a list of 0-based index lists (tris or quads)."""
    if isinstance(faces, np.ndarray):
        return faces.astype(int, copy=False).tolist()
    out: list[list[int]] = []
    for face in faces:
        out.append([int(i) for i in face])
    return out


def write_obj(
    path: Union[str, Path],
    name: str,
    vertices: np.ndarray,
    faces: Union[np.ndarray, Sequence[Sequence[int]]],
    vertex_normals: Optional[np.ndarray] = None,
) -> Path:
    """Write a mesh to a Wavefront OBJ file with shared, welded vertices.

    Args:
        path: Output file path.
        name: Object/group name (written as ``o`` and ``g``).
        vertices: Vertex array, shape (N, 3).
        faces: Face indices, 0-based. Either an (M, k) ndarray (k=3 tris or
            k=4 quads) or a sequence of index sequences with mixed arity.
            Faces are written 1-indexed per the OBJ specification.
        vertex_normals: Optional per-vertex normals, shape (N, 3). When given,
            faces are emitted as ``f v//vn`` so importers apply smooth shading.

    Returns:
        Path to the written file.

    Raises:
        ValueError: If a face references a vertex outside ``[0, N)``.
    """
    path = Path(path)
    verts = np.asarray(vertices, dtype=float)
    n_verts = len(verts)
    face_list = _face_iter(faces)

    # Validate up front so we never write a corrupt OBJ (Rhino silently drops
    # bad faces, which is worse than a clear error here).
    for face in face_list:
        for idx in face:
            if idx < 0 or idx >= n_verts:
                raise ValueError(
                    f"Face references vertex {idx} outside valid range "
                    f"[0, {n_verts})"
                )

    has_normals = vertex_normals is not None
    if has_normals:
        vn = np.asarray(vertex_normals, dtype=float)
        if len(vn) != n_verts:
            raise ValueError("vertex_normals must have one normal per vertex")

    lines: list[str] = [
        "# PotFoundry OBJ export",
        f"o {name}",
        f"g {name}",
    ]
    lines.extend(f"v {x:.6f} {y:.6f} {z:.6f}" for x, y, z in verts)
    if has_normals:
        lines.extend(f"vn {x:.6f} {y:.6f} {z:.6f}" for x, y, z in vn)

    if has_normals:
        for face in face_list:
            toks = " ".join(f"{i + 1}//{i + 1}" for i in face)
            lines.append(f"f {toks}")
    else:
        for face in face_list:
            toks = " ".join(str(i + 1) for i in face)
            lines.append(f"f {toks}")

    data = ("\n".join(lines) + "\n").encode("ascii", errors="replace")
    atomic_write_bytes(path, data)
    return path
