"""Native Rhino ``.3dm`` exporter (gold standard for Rhino / Grasshopper).

A ``.3dm`` file is what Rhino and Grasshopper consume most faithfully: it
records the model's unit system and stores a real Rhino mesh object, so the pot
opens at the correct millimetre scale with smooth vertex normals and no import
dialog. Rhino's own validity checks (``IsValid`` / ``IsClosed``) then confirm the
mesh is a closed, correctly-oriented solid — the payoff of the outward winding
and welded topology fixed upstream.

``rhino3dm`` is an optional dependency (a few-MB binary wheel). Import is lazy so
the rest of PotFoundry works without it; :func:`write_3dm` raises a clear,
actionable error when the package is missing.
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional, Union

import numpy as np

from .normals import compute_vertex_normals

__all__ = ["write_3dm", "RHINO3DM_AVAILABLE"]

try:  # pragma: no cover - exercised indirectly via the availability flag
    import rhino3dm as _r3
    RHINO3DM_AVAILABLE = True
except Exception:  # pragma: no cover
    _r3 = None
    RHINO3DM_AVAILABLE = False


# Rhino 7/8 file version. 0 lets rhino3dm pick its newest supported version.
_DEFAULT_3DM_VERSION = 0


def write_3dm(
    path: Union[str, Path],
    name: str,
    vertices: np.ndarray,
    faces: np.ndarray,
    normals: Optional[np.ndarray] = None,
    *,
    version: int = _DEFAULT_3DM_VERSION,
) -> Path:
    """Write the mesh to a native Rhino ``.3dm`` file in millimetres.

    Args:
        path: Output file path.
        name: Object name (stored as the Rhino object's name attribute).
        vertices: Vertex array, shape (N, 3).
        faces: Triangle indices, shape (M, 3), 0-indexed.
        normals: Optional per-vertex normals, shape (N, 3). Area-weighted
            normals are computed from the mesh when omitted.
        version: 3dm file version (0 = newest supported by rhino3dm).

    Returns:
        Path: the resolved output path.

    Raises:
        RuntimeError: if ``rhino3dm`` is not installed.
        IOError: if the file cannot be written.
    """
    if not RHINO3DM_AVAILABLE:
        raise RuntimeError(
            "3dm export requires the optional 'rhino3dm' package. "
            "Install it with: pip install rhino3dm"
        )

    path = Path(path)
    v = np.asarray(vertices, dtype=np.float64)
    f = np.asarray(faces, dtype=np.int64)
    if normals is None:
        normals = compute_vertex_normals(v, f)
    vn = np.asarray(normals, dtype=np.float64)

    mesh = _r3.Mesh()
    for x, y, z in v:
        mesh.Vertices.Add(float(x), float(y), float(z))
    for a, b, c in f:
        mesh.Faces.AddFace(int(a), int(b), int(c))
    for nx, ny, nz in vn:
        mesh.Normals.Add(float(nx), float(ny), float(nz))
    # Drop unused capacity so vertex/normal/face counts are exact on read-back.
    mesh.Compact()

    model = _r3.File3dm()
    model.Settings.ModelUnitSystem = _r3.UnitSystem.Millimeters

    attrs = _r3.ObjectAttributes()
    attrs.Name = name
    model.Objects.AddMesh(mesh, attrs)

    if not model.Write(str(path), version):
        raise IOError(f"Failed to write 3dm file: {path}")
    return path
