"""Wavefront OBJ writer — clean indexed-mesh export for Rhino / Grasshopper.

Why OBJ in addition to STL?
    Binary STL stores an *unwelded* triangle soup: every triangle carries its
    own three vertices, so a pot exports ~3x more vertices than it has and the
    importer must re-weld coincident points by tolerance — which can leave
    naked edges in Rhino/Grasshopper. OBJ stores explicit *shared-vertex*
    topology, so the welded indexed mesh PotFoundry already builds round-trips
    exactly: identical vertex count, watertight, consistently wound.

Public API:
    write_obj(path, name, vertices, faces[, vertex_normals]) -> Path

Notes:
    - Faces are written 1-indexed per the OBJ spec.
    - With ``vertex_normals=True`` we emit area-weighted smooth vertex normals
      (``vn``) and ``f v//vn`` references for smooth shading on import.
    - Uses the same atomic write-and-replace as the STL writer.
"""
from __future__ import annotations

from io import StringIO
from pathlib import Path
from typing import Union

import numpy as np

from .stl import atomic_write_bytes

__all__ = ["write_obj"]


def _smooth_vertex_normals(vertices: np.ndarray, faces: np.ndarray) -> np.ndarray:
    """Area-weighted smooth per-vertex normals.

    Each face contributes its (unnormalised) normal — whose magnitude is twice
    the triangle area — to its three vertices, then we normalise. This yields
    smooth shading normals consistent with the face winding (outward).
    """
    v = vertices.astype(np.float64, copy=False)
    f = faces.astype(np.int64, copy=False)
    a = v[f[:, 0]]
    b = v[f[:, 1]]
    c = v[f[:, 2]]
    fn = np.cross(b - a, c - a)  # area-weighted face normal

    vn = np.zeros_like(v)
    np.add.at(vn, f[:, 0], fn)
    np.add.at(vn, f[:, 1], fn)
    np.add.at(vn, f[:, 2], fn)

    lens = np.linalg.norm(vn, axis=1)
    mask = lens > 0
    vn[mask] /= lens[mask][:, None]
    return vn


def write_obj(
    path: Union[str, Path],
    name: str,
    vertices: np.ndarray,
    faces: np.ndarray,
    vertex_normals: bool = False,
) -> Path:
    """Write a mesh to a Wavefront ``.obj`` file (indexed, welded topology).

    Args:
        path: Output file path.
        name: Object name (emitted as an ``o`` line).
        vertices: Vertex array, shape (N, 3).
        faces: Triangle index array, shape (M, 3), zero-based.
        vertex_normals: If True, also emit smooth ``vn`` normals and reference
            them from each face (``f v//vn``).

    Returns:
        Path: The resolved path written.

    Raises:
        ValueError: If ``vertices`` or ``faces`` are not (K, 3) arrays.
    """
    verts = np.asarray(vertices, dtype=float)
    tris = np.asarray(faces, dtype=np.int64)
    if verts.ndim != 2 or verts.shape[1] != 3:
        raise ValueError(f"vertices must have shape (N, 3), got {verts.shape}")
    if tris.ndim != 2 or tris.shape[1] != 3:
        raise ValueError(f"faces must have shape (M, 3), got {tris.shape}")

    path = Path(path)
    buf = StringIO()
    buf.write(f"# PotFoundry OBJ export\n")
    buf.write(f"o {name or 'potfoundry'}\n")

    # Vertices.
    for x, y, z in verts:
        buf.write(f"v {x:.6f} {y:.6f} {z:.6f}\n")

    if vertex_normals:
        vn = _smooth_vertex_normals(verts, tris)
        for nx, ny, nz in vn:
            buf.write(f"vn {nx:.6f} {ny:.6f} {nz:.6f}\n")
        # OBJ is 1-indexed; vertex and normal indices coincide here.
        f1 = tris + 1
        for (i, j, k) in f1:
            buf.write(f"f {i}//{i} {j}//{j} {k}//{k}\n")
    else:
        f1 = tris + 1
        for (i, j, k) in f1:
            buf.write(f"f {i} {j} {k}\n")

    atomic_write_bytes(path, buf.getvalue().encode("ascii"))
    return path
