"""Wavefront OBJ writer (CAD / Rhino / Grasshopper export quality).

OBJ is the preferred interchange format for importing PotFoundry meshes into
parametric CAD tools such as Rhino and Grasshopper:

- it stores **shared vertices** (``v`` records referenced by 1-based index), so
  the importer receives an already-welded closed mesh rather than the
  triangle-soup an STL forces it to re-weld by tolerance;
- it can carry **smooth vertex normals** (``vn`` records), giving curved walls
  correct shading instead of a faceted look.

Public API:
    write_obj(path, name, vertices, faces[, normals][, include_normals])

Implementation notes:
- Vertex normals, when written, are computed as area-weighted averages of the
  incident face normals (face area falls out of the un-normalised cross
  product), so they inherit the mesh's outward orientation.
- Coordinates are written with enough precision (``%.7g``, ~1e-5 mm at
  100 mm scale — far below printer/CAD tolerance) to round-trip the geometry
  without bloating the file.
- Uses the same atomic write-and-replace strategy as the STL writer to avoid
  partial/corrupt files on error.
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional, Union

import numpy as np

from .stl import atomic_write_bytes

__all__ = ["write_obj", "compute_vertex_normals"]


def compute_vertex_normals(vertices: np.ndarray, faces: np.ndarray) -> np.ndarray:
    """Area-weighted smooth vertex normals.

    Each face contributes its (un-normalised) cross product — whose magnitude is
    twice the triangle area — to each of its three vertices, then the
    accumulated vectors are normalised. This yields smooth normals that follow
    the face winding, so an outward-wound mesh produces outward vertex normals.

    Args:
        vertices: Vertex array, shape (N, 3).
        faces: Triangle index array, shape (M, 3).

    Returns:
        Unit vertex normals, shape (N, 3). Vertices touched only by degenerate
        faces get a zero normal.
    """
    v = vertices.astype(float, copy=False)
    f = faces.astype(np.int64, copy=False)
    fn = np.cross(v[f[:, 1]] - v[f[:, 0]], v[f[:, 2]] - v[f[:, 0]])
    acc = np.zeros_like(v)
    for k in range(3):
        np.add.at(acc, f[:, k], fn)
    lengths = np.linalg.norm(acc, axis=1, keepdims=True)
    return acc / np.where(lengths == 0.0, 1.0, lengths)


def write_obj(
    path: Union[str, Path],
    name: str,
    vertices: np.ndarray,
    faces: np.ndarray,
    normals: Optional[np.ndarray] = None,
    include_normals: bool = True,
) -> Path:
    """Write a mesh to a Wavefront OBJ file with shared vertices.

    Args:
        path: Output file path.
        name: Object name (written as an ``o``/``g`` record).
        vertices: Vertex array, shape (N, 3).
        faces: Triangle index array, shape (M, 3), 0-based.
        normals: Optional per-vertex normals, shape (N, 3). If None and
            ``include_normals`` is True, smooth normals are computed.
        include_normals: Whether to write ``vn`` records and reference them from
            faces (``f v//vn``). Set False for a positions-only OBJ.

    Returns:
        Path: Resolved path to the written OBJ file.

    Raises:
        ValueError: If vertices/faces have invalid shapes.
    """
    path = Path(path)
    v = np.asarray(vertices, dtype=float)
    f = np.asarray(faces)
    if v.ndim != 2 or v.shape[1] != 3:
        raise ValueError(f"vertices must have shape (N, 3), got {v.shape}")
    if f.ndim != 2 or f.shape[1] != 3:
        raise ValueError(f"faces must have shape (M, 3), got {f.shape}")

    vn = None
    if include_normals:
        vn = normals if normals is not None else compute_vertex_normals(v, f)
        vn = np.asarray(vn, dtype=float)
        if vn.shape != v.shape:
            raise ValueError(
                f"normals must have shape {v.shape}, got {vn.shape}"
            )

    safe_name = (name or "potfoundry").strip() or "potfoundry"

    parts: list[str] = [
        "# PotFoundry OBJ export",
        f"o {safe_name}",
    ]
    parts.extend(f"v {x:.7g} {y:.7g} {z:.7g}" for x, y, z in v)
    if vn is not None:
        parts.extend(f"vn {x:.7g} {y:.7g} {z:.7g}" for x, y, z in vn)

    f1 = f.astype(np.int64) + 1  # OBJ is 1-based
    if vn is not None:
        parts.extend(
            f"f {a}//{a} {b}//{b} {c}//{c}" for a, b, c in f1
        )
    else:
        parts.extend(f"f {a} {b} {c}" for a, b, c in f1)

    text = "\n".join(parts) + "\n"
    atomic_write_bytes(path, text.encode("ascii"))
    return path
