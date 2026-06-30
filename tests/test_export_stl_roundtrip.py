"""End-to-end STL export-artifact regression tests.

`tests/test_export_orientation.py` proves the *in-memory* mesh is a manifold,
outward-oriented solid. But the artifact that actually lands in Rhino /
Grasshopper is the **binary STL file**, which goes through a lossy
transformation: vertices are written as float32 (welded indices are lost — STL
stores three explicit vertices per triangle) and each facet carries its own
stored normal. Those are exactly the places a writer regression hides.

These tests parse the exported bytes back and assert the recovered solid still
satisfies the import contract:

* the triangle count matches the source mesh;
* after welding coincident vertices, every edge is shared by exactly two faces
  (watertight / manifold survives the float32 round-trip);
* the recovered signed volume is positive (outward normals survive);
* every *stored* facet normal agrees with its triangle winding and is non-zero
  (Rhino can rely on the stored normals, not just recompute them).
"""
from __future__ import annotations

import struct
from collections import Counter

import numpy as np
import pytest

from potfoundry import build_pot_mesh, STYLES
from pfui.exporters import export_stl_bytes


def _parse_binary_stl(data: bytes) -> tuple[np.ndarray, np.ndarray]:
    """Parse binary STL bytes into (normals[M,3], triangles[M,3,3])."""
    count = struct.unpack("<I", data[80:84])[0]
    normals = np.empty((count, 3), dtype=np.float64)
    tris = np.empty((count, 3, 3), dtype=np.float64)
    off = 84
    for i in range(count):
        vals = struct.unpack("<12f", data[off:off + 48])
        normals[i] = vals[0:3]
        tris[i] = np.asarray(vals[3:12]).reshape(3, 3)
        off += 50  # 48 bytes payload + 2 byte attribute
    return normals, tris


def _weld(tris: np.ndarray, decimals: int = 3) -> tuple[np.ndarray, np.ndarray]:
    """Weld coincident triangle corners; return (unique_verts, faces)."""
    flat = tris.reshape(-1, 3)
    keyed = np.round(flat, decimals)
    uniq, inv = np.unique(keyed, axis=0, return_inverse=True)
    return uniq, inv.reshape(-1, 3)


def _signed_volume(verts: np.ndarray, faces: np.ndarray) -> float:
    v0 = verts[faces[:, 0]]
    v1 = verts[faces[:, 1]]
    v2 = verts[faces[:, 2]]
    return float(np.sum(np.einsum("ij,ij->i", v0, np.cross(v1, v2))) / 6.0)


_STYLES = list(STYLES)


@pytest.mark.parametrize("style_name", _STYLES)
def test_exported_stl_roundtrips_to_valid_solid(style_name):
    style_fn = STYLES[style_name][0]
    verts, faces, _ = build_pot_mesh(
        H=120, Rt=70, Rb=50,
        t_wall=3, t_bottom=3, r_drain=10,
        expn=1.1, n_theta=80, n_z=40,
        r_outer_fn=style_fn, style_opts={},
    )

    data, _safe = export_stl_bytes(style_name, verts, faces)
    normals, tris = _parse_binary_stl(data)

    # 1. Triangle count is preserved.
    assert len(tris) == len(faces), (
        f"{style_name}: STL has {len(tris)} triangles, mesh has {len(faces)}"
    )

    uniq, wfaces = _weld(tris)
    v0 = uniq[wfaces[:, 0]]
    v1 = uniq[wfaces[:, 1]]
    v2 = uniq[wfaces[:, 2]]

    # 2. Watertight / manifold survives the float32 round-trip.
    edge_counts: Counter = Counter()
    for a, b, c in wfaces:
        for x, y in ((int(a), int(b)), (int(b), int(c)), (int(c), int(a))):
            edge_counts[tuple(sorted((x, y)))] += 1
    non_manifold = [e for e, n in edge_counts.items() if n != 2]
    assert not non_manifold, (
        f"{style_name}: {len(non_manifold)} non-manifold edges after STL "
        f"round-trip -> exported file is not watertight"
    )

    # 3. Outward orientation survives.
    vol = _signed_volume(uniq, wfaces)
    assert vol > 0.0, f"{style_name}: exported STL signed volume {vol:.1f} <= 0"

    # 4. Stored facet normals agree with winding and are non-zero.
    winding = np.cross(v1 - v0, v2 - v0)
    dots = np.einsum("ij,ij->i", winding, normals)
    assert np.all(dots > 0.0), (
        f"{style_name}: {(dots <= 0).sum()} stored facet normals disagree with "
        f"triangle winding"
    )
    assert np.all(np.linalg.norm(normals, axis=1) > 1e-6), (
        f"{style_name}: exported STL contains zero-length facet normals"
    )
