"""Wavefront OBJ writer for Rhino / Grasshopper interchange.

OBJ is the native mesh interchange format for Rhino and Grasshopper. Where a
binary STL stores an *unindexed* triangle soup (each triangle carries its own
three vertices, in float32) that the importer must re-weld, OBJ stores the
**welded, indexed** mesh directly: a shared vertex list plus faces referencing
it. PotFoundry's :func:`build_pot_mesh` already produces exactly this clean
indexed topology (verified watertight and coherently oriented), so exporting it
as OBJ lets the model import into Rhino/Grasshopper as a single closed object,
at full float precision, with no welding guesswork.

Public API:
    write_obj(path, name, vertices, faces[, normals]) -> Path

Notes:
- OBJ face indices are 1-based.
- Vertices are written at full precision (``%.6f``), unlike float32 STL.
- Uses the same atomic write-and-replace utility as the STL writer.
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional, Union

import numpy as np

from .stl import atomic_write_bytes

__all__ = ["write_obj"]


def write_obj(
    path: Union[str, Path],
    name: str,
    vertices: np.ndarray,
    faces: np.ndarray,
    normals: Optional[np.ndarray] = None,
) -> Path:
    """Write a mesh to a Wavefront ``.obj`` file (welded, indexed).

    Args:
        path: Output file path (str or Path).
        name: Object name (emitted as an ``o <name>`` record and a header
            comment).
        vertices: Vertex array, shape ``(N, 3)``.
        faces: Triangle index array, shape ``(M, 3)``, 0-based.
        normals: Optional per-vertex normals, shape ``(N, 3)``. When provided
            they are written as ``vn`` records and referenced from every face
            (``f v//vn ...``) for smooth shading on import.

    Returns:
        Path: The resolved path to the written file.

    Raises:
        ValueError: If ``vertices`` or ``faces`` do not have shape ``(*, 3)``,
            or if ``normals`` is given with a length other than ``len(vertices)``.
    """
    verts = np.asarray(vertices, dtype=float)
    tris = np.asarray(faces, dtype=np.int64)
    if verts.ndim != 2 or verts.shape[1] != 3:
        raise ValueError(f"vertices must have shape (N, 3), got {verts.shape}")
    if tris.ndim != 2 or tris.shape[1] != 3:
        raise ValueError(f"faces must have shape (M, 3), got {tris.shape}")

    has_normals = normals is not None
    if has_normals:
        norms = np.asarray(normals, dtype=float)
        if norms.shape != verts.shape:
            raise ValueError(
                "normals must match vertices shape "
                f"{verts.shape}, got {norms.shape}"
            )

    lines: list[str] = [
        f"# PotFoundry OBJ export: {name}",
        f"# vertices: {len(verts)}  faces: {len(tris)}",
        f"o {name or 'potfoundry'}",
    ]
    lines.extend(f"v {x:.6f} {y:.6f} {z:.6f}" for x, y, z in verts)

    if has_normals:
        lines.extend(f"vn {nx:.6f} {ny:.6f} {nz:.6f}" for nx, ny, nz in norms)
        f1 = tris + 1
        lines.extend(
            f"f {a}//{a} {b}//{b} {c}//{c}" for a, b, c in f1.tolist()
        )
    else:
        f1 = tris + 1
        lines.extend(f"f {a} {b} {c}" for a, b, c in f1.tolist())

    text = "\n".join(lines) + "\n"
    out = Path(path)
    atomic_write_bytes(out, text.encode("utf-8"))
    return out
