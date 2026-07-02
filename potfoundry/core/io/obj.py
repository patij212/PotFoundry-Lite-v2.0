"""Wavefront OBJ writer (welded, smooth-normal mesh export).

This is the **recommended format for CAD round-tripping** into Rhino and
Grasshopper. Where binary STL is unwelded triangle soup — every triangle stores
its three vertex coordinates verbatim, so a shared vertex is duplicated many
times and only per-facet normals exist — OBJ preserves the mesh's *indexed*
topology:

- **Welded vertices.** Vertices are written once and referenced by index, so the
  pot imports as a single closed mesh with no naked/duplicate edges (no need to
  run Weld after import).
- **Smooth per-vertex normals.** Area-weighted vertex normals give correct smooth
  shading of the curved wall out of the box, and match the outward face winding
  produced by ``build_pot_mesh``.

Public API:
    write_obj(path, name, vertices, faces[, normals, smooth]) -> Path

Example:
    >>> from potfoundry import build_pot_mesh, STYLES, write_obj
    >>> v, f, _ = build_pot_mesh(..., r_outer_fn=STYLES["FourierBloom"][0], style_opts={})
    >>> write_obj("pot.obj", "MyPot", v, f)
    Path('pot.obj')
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional, Union

import numpy as np

from .stl import atomic_write_bytes

__all__ = ["write_obj", "compute_vertex_normals"]


def compute_vertex_normals(vertices: np.ndarray, faces: np.ndarray) -> np.ndarray:
    """Area-weighted smooth per-vertex normals for a triangle mesh.

    Each face contributes its (un-normalized) cross product to its three
    vertices; because the cross-product magnitude equals twice the triangle
    area, larger faces are weighted more heavily. The accumulated per-vertex
    vectors are then normalized. Face winding is assumed outward (as emitted by
    :func:`build_pot_mesh`), so the resulting vertex normals point outward.

    Args:
        vertices: Vertex array, shape (N, 3).
        faces: Triangle indices, shape (M, 3).

    Returns:
        Unit vertex normals, shape (N, 3). Vertices with no incident area fall
        back to a zero vector.
    """
    v = np.asarray(vertices, dtype=np.float64)
    f = np.asarray(faces, dtype=np.int64)
    a = v[f[:, 0]]
    b = v[f[:, 1]]
    c = v[f[:, 2]]
    face_n = np.cross(b - a, c - a)  # magnitude == 2 * area (area weighting)

    vn = np.zeros_like(v)
    np.add.at(vn, f[:, 0], face_n)
    np.add.at(vn, f[:, 1], face_n)
    np.add.at(vn, f[:, 2], face_n)

    lengths = np.linalg.norm(vn, axis=1)
    nz = lengths > 0
    vn[nz] /= lengths[nz][:, None]
    return vn


def _format_vec_block(prefix: str, arr: np.ndarray) -> str:
    """Format an (N, 3) array as newline-joined ``prefix x y z`` lines."""
    return "".join(
        f"{prefix} {row[0]:.6f} {row[1]:.6f} {row[2]:.6f}\n" for row in arr
    )


def write_obj(
    path: Union[str, Path],
    name: str,
    vertices: np.ndarray,
    faces: np.ndarray,
    normals: Optional[np.ndarray] = None,
    smooth: bool = True,
) -> Path:
    """Write a mesh to Wavefront OBJ (welded, optionally with smooth normals).

    Args:
        path: Output file path.
        name: Object name (written as the ``o <name>`` group).
        vertices: Vertex array, shape (N, 3).
        faces: Triangle indices, shape (M, 3), 0-based.
        normals: Optional precomputed per-vertex normals, shape (N, 3). Ignored
            when ``smooth`` is False. If None and ``smooth`` is True, area-weighted
            vertex normals are computed automatically.
        smooth: When True (default), emit ``vn`` records and reference them from
            each face (``f v//vn``) for smooth shading. When False, emit only
            vertex/face records and let the importer compute normals.

    Returns:
        Path: Resolved path to the written OBJ file.

    Note:
        - OBJ indices are 1-based; this writer converts from the 0-based ``faces``.
        - Uses atomic write-and-replace to avoid partial files on error.
    """
    path = Path(path)
    verts = np.asarray(vertices, dtype=np.float64)
    f = np.asarray(faces, dtype=np.int64)

    header = f"# PotFoundry OBJ export\no {name or 'potfoundry'}\n"
    body = [header, _format_vec_block("v", verts)]

    if smooth:
        if normals is None:
            normals = compute_vertex_normals(verts, f)
        vn = np.asarray(normals, dtype=np.float64)
        body.append(_format_vec_block("vn", vn))
        # Per-vertex normals share vertex indices, so f uses "v//vn" with equal
        # position and normal indices.
        f1 = f + 1
        body.append(
            "".join(
                f"f {i}//{i} {j}//{j} {k}//{k}\n" for i, j, k in f1
            )
        )
    else:
        f1 = f + 1
        body.append("".join(f"f {i} {j} {k}\n" for i, j, k in f1))

    atomic_write_bytes(path, "".join(body).encode("ascii"))
    return path
