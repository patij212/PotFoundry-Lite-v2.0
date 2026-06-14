"""Wavefront OBJ exporter (Rhino / Grasshopper friendly).

OBJ is the most portable mesh interchange format that Rhino and Grasshopper
import cleanly. Compared to STL it preserves two things that matter for export
quality:

  * **Welded topology** — vertices are shared by index, so the angular seam and
    region boundaries do not duplicate points. The pot mesh is already welded
    (it shares seam vertices via modular indexing), so we write it 1:1.
  * **Smooth vertex normals** — STL only stores per-face normals, producing a
    faceted look in Rhino. We emit one ``vn`` per vertex (see
    :mod:`potfoundry.core.io.normals`) so the surface shades smoothly.

The body is assembled in memory and written through
:func:`potfoundry.core.io.stl.atomic_write_bytes` so an interrupted export can
never leave a partial ``.obj`` behind.
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional, Union

import numpy as np

from .normals import compute_vertex_normals
from .stl import atomic_write_bytes

__all__ = ["write_obj"]


def write_obj(
    path: Union[str, Path],
    name: str,
    vertices: np.ndarray,
    faces: np.ndarray,
    normals: Optional[np.ndarray] = None,
) -> Path:
    """Write a welded, smooth-shaded triangle mesh to a Wavefront ``.obj`` file.

    Args:
        path: Output file path.
        name: Object name, emitted as ``o <name>`` (and in a header comment).
        vertices: Vertex array, shape (N, 3).
        faces: Triangle indices, shape (M, 3), 0-indexed.
        normals: Optional per-vertex normals, shape (N, 3). Computed
            (area-weighted) from the mesh when omitted.

    Returns:
        Path: the resolved output path.

    Note:
        OBJ indices are 1-based. Vertex and normal indices are written as
        ``f v//vn`` triplets that share the same (welded) index.
    """
    path = Path(path)
    v = np.asarray(vertices, dtype=np.float64)
    f = np.asarray(faces, dtype=np.int64)
    if normals is None:
        normals = compute_vertex_normals(v, f)
    vn = np.asarray(normals, dtype=np.float64)

    lines = [
        f"# PotFoundry OBJ export: {name}",
        "# Units: millimetres",
        f"o {name}",
    ]
    # Vertices, then matching vertex normals (1:1, shared index).
    lines += [f"v {x:.6f} {y:.6f} {z:.6f}" for x, y, z in v]
    lines += [f"vn {x:.6f} {y:.6f} {z:.6f}" for x, y, z in vn]
    # Faces: 1-indexed; v//vn shares the welded index.
    f1 = f + 1
    lines += [
        f"f {a}//{a} {b}//{b} {c}//{c}" for a, b, c in f1
    ]

    data = ("\n".join(lines) + "\n").encode("ascii")
    atomic_write_bytes(path, data)
    return path
