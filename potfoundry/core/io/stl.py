"""Binary STL writer + atomic save utilities (PF2)

This module provides the **recommended** STL export functionality for PotFoundry.
Binary STL files are:
- Smaller (50-90% size reduction vs ASCII)
- Faster to write and read
- Universally supported by all modern slicers and CAD tools

Public API:
    write_stl_binary(path, name, vertices, faces[, normals]) - **Use this for all exports**
    atomic_write_bytes(path, data) - Safe atomic file writing utility

Implementation Notes:
- Uses vectorized numpy struct packing for speed
- Always writes little-endian floats per STL specification
- Uses atomic replace to avoid partial/corrupt files on errors
- Auto-computes face normals if not provided

Example:
    >>> from potfoundry import write_stl_binary
    >>> write_stl_binary("pot.stl", "MyPot", vertices, faces)
"""

from __future__ import annotations
from pathlib import Path
from typing import Optional, Union
import numpy as np
import numpy.typing as npt
import os

__all__ = ["write_stl_binary", "atomic_write_bytes"]


def _ensure_dir(p: Path) -> None:
    """Ensure parent directory exists for given path."""
    p.parent.mkdir(parents=True, exist_ok=True)


def atomic_write_bytes(path: Union[str, Path], data: bytes) -> None:
    """Write bytes to file atomically to prevent partial writes.

    Writes to a temporary file first, syncs to disk, then atomically
    replaces the target file. This prevents partial/corrupt files if
    the write is interrupted.

    Args:
        path: Target file path
        data: Bytes to write

    Note:
        Uses os.replace() which is atomic on both Unix and Windows
    """
    path = Path(path)
    _ensure_dir(path)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "wb") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def _pack_header(name: str) -> bytes:
    """Pack STL header (80 bytes, name encoded as ASCII)."""
    header = (name or "potfoundry").encode("ascii", errors="replace")[:80]
    return header.ljust(80, b"\0")


def _compute_face_normals(
    vertices: npt.NDArray[np.float64], faces: npt.NDArray[np.int32]
) -> npt.NDArray[np.float32]:
    """Compute face normals for triangular mesh using vectorized cross product.

    Args:
        vertices: Vertex array (N, 3)
        faces: Face indices (M, 3)

    Returns:
        Normal vectors (M, 3), normalized to unit length where possible
    """
    v = vertices.astype(np.float32, copy=False)
    f = faces.astype(np.int64, copy=False)
    a = v[f[:, 0]]
    b = v[f[:, 1]]
    c = v[f[:, 2]]
    n = np.cross(b - a, c - a)
    lens = np.linalg.norm(n, axis=1)
    mask = lens > 0
    n[mask] /= lens[mask][:, None]
    n[~mask] = np.array([0.0, 0.0, 0.0], dtype=np.float32)
    return n.astype(np.float32, copy=False)


def _interleave_records(
    normals: npt.NDArray[np.float32],
    vertices: npt.NDArray[np.float64],
    faces: npt.NDArray[np.int32],
) -> bytes:
    """Pack normals and triangle vertices into binary STL facet records.

    Creates the binary body of an STL file. Each facet record is 50 bytes:
    - 12 bytes: normal vector (3 × float32)
    - 36 bytes: three vertices (9 × float32)
    - 2 bytes: attribute (unused, always 0)

    Args:
        normals: Face normals (M, 3)
        vertices: Vertex array (N, 3)
        faces: Face indices (M, 3)

    Returns:
        bytes: Binary facet records (M × 50 bytes)
    """
    M = faces.shape[0]
    v = vertices.astype(np.float32, copy=False)
    f = faces.astype(np.int64, copy=False)
    n = normals.astype(np.float32, copy=False)
    a = v[f[:, 0]]
    b = v[f[:, 1]]
    c = v[f[:, 2]]
    facet_dtype = np.dtype(
        [
            ("normals", "<f4", (3,)),
            ("v1", "<f4", (3,)),
            ("v2", "<f4", (3,)),
            ("v3", "<f4", (3,)),
            ("attr", "<u2"),
        ]
    )
    recs = np.empty(M, dtype=facet_dtype)
    recs["normals"] = n
    recs["v1"] = a
    recs["v2"] = b
    recs["v3"] = c
    recs["attr"] = 0
    return recs.tobytes(order="C")


def write_stl_binary(
    path: Union[str, Path],
    name: str,
    vertices: npt.NDArray[np.float64],
    faces: npt.NDArray[np.int32],
    normals: Optional[npt.NDArray[np.float32]] = None,
) -> Path:
    """Write mesh to binary STL file (RECOMMENDED for all exports).

    Binary STL is the preferred format for PotFoundry exports. It produces
    files that are 50-90% smaller than ASCII STL and write/read much faster
    while being universally supported by all modern slicers and CAD software.

    Args:
        path: Output file path (str or Path)
        name: Model name (embedded in STL header, max 80 chars)
        vertices: Vertex array, shape (N, 3), dtype float or float32
        faces: Face indices array, shape (M, 3), dtype int or int32
        normals: Optional face normals, shape (M, 3). If None, computed automatically.

    Returns:
        Path: Resolved path to the written STL file

    Raises:
        IOError: If file cannot be written
        ValueError: If vertices/faces have invalid shapes

    Example:
        >>> verts, faces, _ = build_pot_mesh(H=100, Rt=50, Rb=40, ...)
        >>> write_stl_binary("my_pot.stl", "FlowerPot", verts, faces)
        Path('my_pot.stl')

    Note:
        - Uses atomic write-and-replace to prevent partial files on errors
        - Automatically computes face normals if not provided
        - Always writes little-endian format per STL specification
    """
    path = Path(path)
    if normals is None:
        normals = _compute_face_normals(vertices, faces)
    header = _pack_header(name)
    tri_count = np.uint32(faces.shape[0]).tobytes()
    body = _interleave_records(normals, vertices, faces)
    buf = header + tri_count + body
    atomic_write_bytes(path, buf)
    return path
