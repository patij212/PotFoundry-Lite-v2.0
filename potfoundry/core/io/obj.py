"""Welded indexed mesh export — Wavefront OBJ (PF2).

Why OBJ in addition to binary STL?
----------------------------------
:func:`potfoundry.build_pot_mesh` produces a *welded*, *indexed* mesh — one
shared vertex array plus faces that reference vertices by index. That topology
is watertight and manifold.

Binary STL discards it: every triangle stores three independent vertex copies
with no shared-vertex information. Imported into Rhino / Grasshopper that mesh is
"unwelded" — thousands of coincident-but-separate vertices, a sea of naked edges,
and no closed solid for Boolean / offset / MeshToNURB operations.

Wavefront OBJ keeps the indexed topology directly (``v`` lines + ``f`` lines that
reference vertices by 1-based index), so Rhino imports a welded, closed mesh.
That is the baseline for "Rhino export quality", which is why this is the
recommended interchange format for CAD round-tripping.

Public API:
    write_obj(path, name, vertices, faces[, normals]) - welded OBJ export
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional, Union

import numpy as np

from .stl import atomic_write_bytes

__all__ = ["write_obj"]


def _format_vertices(vertices: np.ndarray) -> list[str]:
    """Format vertex positions as OBJ ``v`` lines.

    Uses %.6f — micron precision at millimetre scale — which keeps files compact
    while preserving enough accuracy that the welded topology survives a
    round-trip (coincident vertices stay coincident).
    """
    v = np.asarray(vertices, dtype=float)
    if v.ndim != 2 or v.shape[1] != 3:
        raise ValueError(f"vertices must have shape (N, 3), got {v.shape}")
    return [f"v {x:.6f} {y:.6f} {z:.6f}" for x, y, z in v]


def _format_normals(normals: np.ndarray) -> list[str]:
    """Format per-vertex normals as OBJ ``vn`` lines."""
    n = np.asarray(normals, dtype=float)
    if n.ndim != 2 or n.shape[1] != 3:
        raise ValueError(f"normals must have shape (N, 3), got {n.shape}")
    return [f"vn {x:.6f} {y:.6f} {z:.6f}" for x, y, z in n]


def _format_faces(faces: np.ndarray, with_normals: bool) -> list[str]:
    """Format triangle faces as OBJ ``f`` lines (1-based indices).

    With per-vertex normals we emit ``v//vn`` (shared index, no texture coords),
    which is the form Rhino reads as a smooth-shaded welded mesh.
    """
    f = np.asarray(faces, dtype=np.int64)
    if f.ndim != 2 or f.shape[1] != 3:
        raise ValueError(f"faces must have shape (M, 3), got {f.shape}")
    # OBJ indices are 1-based.
    f1 = f + 1
    if with_normals:
        return [f"f {a}//{a} {b}//{b} {c}//{c}" for a, b, c in f1]
    return [f"f {a} {b} {c}" for a, b, c in f1]


def write_obj(
    path: Union[str, Path],
    name: str,
    vertices: np.ndarray,
    faces: np.ndarray,
    normals: Optional[np.ndarray] = None,
) -> Path:
    """Write a welded indexed mesh to a Wavefront OBJ file.

    OBJ preserves the shared-vertex topology of the source mesh, so the result
    imports into Rhino / Grasshopper as a welded, watertight, closed mesh — the
    baseline for CAD round-tripping. (Binary STL, by contrast, de-welds every
    triangle and imports as a naked-edge shell.)

    Args:
        path: Output file path (``.obj``).
        name: Object name, written as both ``o`` and ``g`` so Rhino names the
            imported object/layer. Sanitised to a single OBJ-safe token.
        vertices: Vertex array, shape (N, 3).
        faces: Triangle index array, shape (M, 3), 0-based.
        normals: Optional per-vertex normals, shape (N, 3). When provided, faces
            reference them as ``v//vn`` for smooth shading.

    Returns:
        Path: Resolved path to the written OBJ file.

    Raises:
        ValueError: If vertices/faces/normals have invalid shapes, or normals are
            given but do not match the vertex count.

    Example:
        >>> verts, faces, _ = build_pot_mesh(...)
        >>> write_obj("pot.obj", "FlowerPot", verts, faces)
        Path('pot.obj')
    """
    path = Path(path)
    v = np.asarray(vertices, dtype=float)
    f = np.asarray(faces, dtype=np.int64)

    with_normals = normals is not None
    if with_normals and np.asarray(normals).shape[0] != v.shape[0]:
        raise ValueError(
            "per-vertex normals must match vertex count: "
            f"{np.asarray(normals).shape[0]} normals vs {v.shape[0]} vertices"
        )

    # A single OBJ-safe token (no whitespace) so `o`/`g` names parse cleanly.
    safe_name = ("".join(ch if (ch.isalnum() or ch in "._-") else "_"
                         for ch in (name or "potfoundry")) or "potfoundry")

    lines: list[str] = [
        "# Wavefront OBJ exported by PotFoundry",
        "# Welded indexed mesh (Rhino/Grasshopper-ready)",
        f"o {safe_name}",
        f"g {safe_name}",
    ]
    lines.extend(_format_vertices(v))
    if with_normals:
        lines.extend(_format_normals(np.asarray(normals, dtype=float)))
    lines.extend(_format_faces(f, with_normals))

    data = ("\n".join(lines) + "\n").encode("ascii", errors="replace")
    atomic_write_bytes(path, data)
    return path
