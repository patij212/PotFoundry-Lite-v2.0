"""Binary STL writer + atomic save utilities (PF2 PR-1)

This module provides:
- write_stl_binary(path, name, vertices, faces[, normals])
- atomic_write_bytes(path, data)

Notes:
- Uses vectorized numpy struct packing for speed.
- Always writes little-endian floats per STL spec.
- Uses atomic replace to avoid partial/corrupt files.
"""
from __future__ import annotations
from pathlib import Path
from typing import Optional, Union
import numpy as np
import os

__all__ = ['write_stl_binary', 'atomic_write_bytes']

def _ensure_dir(p: Path) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)

def atomic_write_bytes(path: Union[str, Path], data: bytes) -> None:
    path = Path(path)
    _ensure_dir(path)
    tmp = path.with_suffix(path.suffix + '.tmp')
    with open(tmp, 'wb') as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)

def _pack_header(name: str) -> bytes:
    header = (name or 'potfoundry').encode('ascii', errors='replace')[:80]
    return header.ljust(80, b'\0')

def _compute_face_normals(vertices: np.ndarray, faces: np.ndarray) -> np.ndarray:
    v = vertices.astype(np.float32, copy=False)
    f = faces.astype(np.int64, copy=False)
    a = v[f[:, 0]]; b = v[f[:, 1]]; c = v[f[:, 2]]
    n = np.cross(b - a, c - a)
    lens = np.linalg.norm(n, axis=1)
    mask = lens > 0
    n[mask] /= lens[mask][:, None]
    n[~mask] = np.array([0.0, 0.0, 0.0], dtype=np.float32)
    return n.astype(np.float32, copy=False)

def _interleave_records(normals: np.ndarray, vertices: np.ndarray, faces: np.ndarray) -> bytes:
    M = faces.shape[0]
    v = vertices.astype(np.float32, copy=False)
    f = faces.astype(np.int64, copy=False)
    n = normals.astype(np.float32, copy=False)
    a = v[f[:, 0]]; b = v[f[:, 1]]; c = v[f[:, 2]]
    facet_dtype = np.dtype([
        ('normals', '<f4', (3,)),
        ('v1', '<f4', (3,)),
        ('v2', '<f4', (3,)),
        ('v3', '<f4', (3,)),
        ('attr', '<u2'),
    ])
    recs = np.empty(M, dtype=facet_dtype)
    recs['normals'] = n
    recs['v1'] = a
    recs['v2'] = b
    recs['v3'] = c
    recs['attr'] = 0
    return recs.tobytes(order='C')

def write_stl_binary(path: Union[str, Path], name: str, vertices: np.ndarray, faces: np.ndarray, normals: Optional[np.ndarray]=None) -> Path:
    path = Path(path)
    if normals is None:
        normals = _compute_face_normals(vertices, faces)
    header = _pack_header(name)
    tri_count = np.uint32(faces.shape[0]).tobytes()
    body = _interleave_records(normals, vertices, faces)
    buf = header + tri_count + body
    atomic_write_bytes(path, buf)
    return path