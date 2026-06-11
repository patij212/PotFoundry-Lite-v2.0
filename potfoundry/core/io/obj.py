"""Wavefront OBJ writer for Grasshopper/Rhino-friendly export (PF2).

Why OBJ in addition to STL?
    Binary STL stores a *triangle soup*: every triangle carries its three vertex
    coordinates independently and a single faceted face normal. Rhino and
    Grasshopper import that as unwelded faces that must be re-welded and shade
    facet-by-facet.

    Wavefront OBJ stores an *indexed* mesh: shared vertices are written once and
    referenced by index, so the welded topology produced by :func:`build_pot_mesh`
    survives the round trip. OBJ also carries per-vertex normals (``vn``), letting
    us emit smooth, area-weighted normals for clean shading on import.

Public API:
    write_obj(path, name, vertices, faces[, normals]) -> Path

Notes:
    - OBJ indices are 1-based.
    - Per-vertex normals are computed as the area-weighted average of incident
      face normals (smooth shading) unless explicit normals are supplied.
    - Winding is preserved from the source mesh; :func:`build_pot_mesh` emits an
      outward-oriented solid, so the smooth normals point outward too.
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional, Union

import numpy as np

__all__ = ["write_obj", "compute_vertex_normals"]


def compute_vertex_normals(vertices: np.ndarray, faces: np.ndarray) -> np.ndarray:
    """Area-weighted smooth per-vertex normals.

    Each face contributes its (unnormalized) cross-product — whose magnitude is
    proportional to face area — to each of its three vertices. The accumulated
    vectors are then normalized. Area weighting yields smoother, more stable
    normals than uniform averaging on irregular meshes.

    Args:
        vertices: Vertex array (N, 3)
        faces: Triangle index array (M, 3)

    Returns:
        Unit per-vertex normals (N, 3). Vertices with no usable incident face
        area get a zero normal.
    """
    v = np.asarray(vertices, dtype=np.float64)
    f = np.asarray(faces, dtype=np.int64)

    a = v[f[:, 0]]
    b = v[f[:, 1]]
    c = v[f[:, 2]]
    # Cross product magnitude == 2 * triangle area, so this is area-weighted.
    face_n = np.cross(b - a, c - a)

    normals = np.zeros_like(v)
    np.add.at(normals, f[:, 0], face_n)
    np.add.at(normals, f[:, 1], face_n)
    np.add.at(normals, f[:, 2], face_n)

    lens = np.linalg.norm(normals, axis=1)
    mask = lens > 0
    normals[mask] /= lens[mask][:, None]
    return normals


def write_obj(
    path: Union[str, Path],
    name: str,
    vertices: np.ndarray,
    faces: np.ndarray,
    normals: Optional[np.ndarray] = None,
) -> Path:
    """Write an indexed mesh to a Wavefront OBJ file with smooth vertex normals.

    Args:
        path: Output file path.
        name: Object name (emitted as an ``o`` record).
        vertices: Vertex array (N, 3).
        faces: Triangle index array (M, 3), 0-based.
        normals: Optional per-vertex normals (N, 3). If None, smooth
            area-weighted normals are computed via :func:`compute_vertex_normals`.

    Returns:
        Path to the written file.

    Raises:
        ValueError: If vertices/faces do not have shape (*, 3), or if a supplied
            normals array does not match the vertex count.
    """
    path = Path(path)
    v = np.asarray(vertices, dtype=np.float64)
    f = np.asarray(faces, dtype=np.int64)
    if v.ndim != 2 or v.shape[1] != 3:
        raise ValueError(f"vertices must have shape (N, 3), got {v.shape}")
    if f.ndim != 2 or f.shape[1] != 3:
        raise ValueError(f"faces must have shape (M, 3), got {f.shape}")

    if normals is None:
        normals = compute_vertex_normals(v, f)
    else:
        normals = np.asarray(normals, dtype=np.float64)
        if normals.shape != v.shape:
            raise ValueError(
                f"normals must match vertices shape {v.shape}, got {normals.shape}"
            )

    # Build the file body with vectorized formatting for speed.
    safe_name = (name or "potfoundry").replace("\n", " ")
    lines = ["# PotFoundry OBJ export", f"o {safe_name}"]

    lines.extend(
        "v {:.6f} {:.6f} {:.6f}".format(x, y, z) for x, y, z in v
    )
    lines.extend(
        "vn {:.6f} {:.6f} {:.6f}".format(nx, ny, nz) for nx, ny, nz in normals
    )

    # 1-based indices; vertex and normal indices coincide (shared topology).
    f1 = f + 1
    lines.extend(
        "f {0}//{0} {1}//{1} {2}//{2}".format(i, j, k) for i, j, k in f1
    )

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n")
    return path
