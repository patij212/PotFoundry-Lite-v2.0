"""3MF writer for units-aware, manifold mesh interchange.

3MF (3D Manufacturing Format) is an OPC/ZIP package containing an XML model.
Compared with STL it adds two properties that matter for importing into
Rhino/Grasshopper and modern slicers:

* the model declares physical **units** (we always write ``millimeter``), so
  the importer does not have to guess scale; and
* it stores an **indexed mesh** (shared vertices) whose triangles the spec
  requires to be wound counter-clockwise as seen from outside -- exactly the
  outward orientation that :func:`potfoundry.core.geometry.build_pot_mesh`
  guarantees.

Only the minimal core-spec package needed for a single mesh object is emitted:
``[Content_Types].xml``, ``_rels/.rels`` and ``3D/3dmodel.model``.

Public API:
    write_3mf(path, name, vertices, faces[, unit]) -> Path
"""
from __future__ import annotations

import zipfile
from pathlib import Path
from typing import Union
from xml.sax.saxutils import escape

import numpy as np

from .stl import atomic_write_bytes

__all__ = ["write_3mf"]

_CORE_NS = "http://schemas.microsoft.com/3dmanufacturing/core/2015/02"

_CONTENT_TYPES = (
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    '<Default Extension="rels" '
    'ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    '<Default Extension="model" '
    'ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>'
    "</Types>"
)

_RELS = (
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    '<Relationships '
    'xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    '<Relationship Target="/3D/3dmodel.model" Id="rel0" '
    'Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>'
    "</Relationships>"
)

_VALID_UNITS = {
    "micron", "millimeter", "centimeter", "inch", "foot", "meter",
}


def _build_model_xml(name: str, vertices: np.ndarray, faces: np.ndarray,
                     unit: str) -> bytes:
    v = np.asarray(vertices, dtype=float)
    f = np.asarray(faces)

    parts = [
        '<?xml version="1.0" encoding="UTF-8"?>\n',
        f'<model unit="{unit}" xml:lang="en-US" xmlns="{_CORE_NS}">',
        f'<metadata name="Title">{escape(name or "potfoundry")}</metadata>',
        '<resources>',
        '<object id="1" type="model"><mesh><vertices>',
    ]
    # Vertices. ``%r`` of a float round-trips exactly; fixed precision keeps the
    # file compact while staying well within micron tolerance for mm-scale pots.
    parts.extend(
        f'<vertex x="{x:.6f}" y="{y:.6f}" z="{z:.6f}"/>'
        for x, y, z in v
    )
    parts.append('</vertices><triangles>')
    parts.extend(
        f'<triangle v1="{int(a)}" v2="{int(b)}" v3="{int(c)}"/>'
        for a, b, c in f
    )
    parts.append('</triangles></mesh></object>')
    parts.append('</resources>')
    parts.append('<build><item objectid="1"/></build>')
    parts.append('</model>')
    return "".join(parts).encode("utf-8")


def write_3mf(path: Union[str, Path], name: str, vertices: np.ndarray,
              faces: np.ndarray, unit: str = "millimeter") -> Path:
    """Write a mesh to a minimal, valid 3MF package.

    Args:
        path: Output file path (``.3mf``).
        name: Model title embedded in the package metadata.
        vertices: Vertex array, shape (N, 3).
        faces: Triangle indices, shape (M, 3); must reference valid vertices and
            be consistently wound counter-clockwise as seen from outside.
        unit: 3MF length unit. Defaults to ``"millimeter"``.

    Returns:
        Path: The written package path.

    Raises:
        ValueError: If ``unit`` is not a valid 3MF unit, if arrays are not
            (k, 3), or if any face index is out of range.
    """
    path = Path(path)
    v = np.asarray(vertices, dtype=float)
    f = np.asarray(faces)

    if unit not in _VALID_UNITS:
        raise ValueError(
            f"Invalid 3MF unit {unit!r}; expected one of {sorted(_VALID_UNITS)}"
        )
    if v.ndim != 2 or v.shape[1] != 3:
        raise ValueError(f"vertices must have shape (N, 3), got {v.shape}")
    if f.ndim != 2 or f.shape[1] != 3:
        raise ValueError(f"faces must have shape (M, 3), got {f.shape}")
    if f.size and (f.min() < 0 or f.max() >= len(v)):
        raise ValueError(
            "faces reference vertex indices outside [0, "
            f"{len(v) - 1}] (got range [{int(f.min())}, {int(f.max())}])"
        )

    model_xml = _build_model_xml(name, v, f, unit)

    # Build the OPC/ZIP package in memory, then write atomically.
    import io
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", _CONTENT_TYPES)
        zf.writestr("_rels/.rels", _RELS)
        zf.writestr("3D/3dmodel.model", model_xml)
    atomic_write_bytes(path, buf.getvalue())
    return path
