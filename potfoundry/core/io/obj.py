"""Indexed Wavefront OBJ writer (PF2).

Why OBJ in addition to binary STL:

- Binary STL is an *unwelded triangle soup* -- every triangle stores three full
  vertex coordinates, so shared vertices are duplicated and all connectivity is
  lost. Rhino/Grasshopper import it as a mesh that must be welded/repaired.
- OBJ stores a **welded indexed mesh**: a list of unique vertices followed by
  faces referencing them by (1-based) index. This is exactly the topology
  ``build_pot_mesh`` already produces, so OBJ preserves the connected,
  consistently oriented manifold without loss -- the format CAD/parametric tools
  prefer.

Public API:
    write_obj(path, name, vertices, faces[, normals]) -> Path
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional, Union

import numpy as np

from .stl import atomic_write_bytes

__all__ = ["write_obj"]


def _encode_obj(
    name: str,
    vertices: np.ndarray,
    faces: np.ndarray,
    normals: Optional[np.ndarray],
) -> bytes:
    """Encode an indexed mesh as Wavefront OBJ text (UTF-8 bytes).

    Args:
        name: Object name (emitted as a comment and an ``o`` group).
        vertices: (N, 3) vertex positions.
        faces: (M, 3) triangle vertex indices, 0-based.
        normals: Optional (N, 3) per-vertex normals. When supplied, faces are
            written as ``f v//vn`` so normals travel with the mesh.

    Returns:
        UTF-8 encoded OBJ document.
    """
    v = np.asarray(vertices, dtype=float)
    f = np.asarray(faces)
    if v.ndim != 2 or v.shape[1] != 3:
        raise ValueError(f"vertices must have shape (N, 3), got {v.shape}")
    if f.ndim != 2 or f.shape[1] != 3:
        raise ValueError(f"faces must have shape (M, 3), got {f.shape}")

    safe_name = (name or "potfoundry").replace("\n", " ").strip() or "potfoundry"

    parts: list[str] = [
        "# PotFoundry OBJ export",
        f"# object: {safe_name}",
        f"# vertices: {len(v)}  faces: {len(f)}",
        f"o {safe_name}",
    ]

    # Vertices: fixed precision keeps files compact and deterministic.
    parts.extend(f"v {x:.6f} {y:.6f} {z:.6f}" for x, y, z in v)

    if normals is not None:
        n = np.asarray(normals, dtype=float)
        if n.shape != v.shape:
            raise ValueError(
                f"normals must match vertices shape {v.shape}, got {n.shape}"
            )
        parts.extend(f"vn {nx:.6f} {ny:.6f} {nz:.6f}" for nx, ny, nz in n)
        # OBJ indices are 1-based; with per-vertex normals, vn index == v index.
        f1 = f.astype(np.int64) + 1
        parts.extend(
            f"f {a}//{a} {b}//{b} {c}//{c}" for a, b, c in f1
        )
    else:
        f1 = f.astype(np.int64) + 1
        parts.extend(f"f {a} {b} {c}" for a, b, c in f1)

    return ("\n".join(parts) + "\n").encode("utf-8")


def write_obj(
    path: Union[str, Path],
    name: str,
    vertices: np.ndarray,
    faces: np.ndarray,
    normals: Optional[np.ndarray] = None,
) -> Path:
    """Write an indexed mesh to a Wavefront OBJ file.

    Preserves the welded indexed topology (shared vertices + face indices),
    which is what Rhino/Grasshopper and other CAD tools import cleanly. Uses an
    atomic write-and-replace so a failure never leaves a partial/corrupt file.

    Args:
        path: Output file path.
        name: Object name (embedded as comment + ``o`` group).
        vertices: (N, 3) vertex positions.
        faces: (M, 3) triangle vertex indices, 0-based.
        normals: Optional (N, 3) per-vertex normals.

    Returns:
        Path: the written file path.
    """
    path = Path(path)
    data = _encode_obj(name, vertices, faces, normals)
    atomic_write_bytes(path, data)
    return path
