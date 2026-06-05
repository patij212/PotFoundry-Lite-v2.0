"""End-to-end STL export-quality tests (Rhino/Grasshopper import fidelity).

The existing integration tests verify the binary STL file's *structure*
(header, triangle count, byte size). They never parse the geometry back to
confirm that the exported file, once re-welded by coordinate the way Rhino /
Grasshopper weld an imported mesh, is still a watertight, consistently
outward-oriented solid.

These tests close that gap: they read the binary STL back, weld vertices by
exact coordinate, and re-run the manifold / winding / outward-normal checks on
the reconstructed mesh. They also verify that the per-facet normals stored in
the file agree with the triangle winding (a slicer or CAD tool that trusts the
stored normal must get the same outward direction the winding implies).
"""
from __future__ import annotations

import struct
import tempfile
from collections import Counter
from pathlib import Path

import numpy as np
import pytest

from potfoundry import build_pot_mesh, write_stl_binary, STYLES


def _read_binary_stl(path: Path):
    """Parse a binary STL into (normals[M,3], tris[M,3,3])."""
    data = Path(path).read_bytes()
    tri_count = struct.unpack_from("<I", data, 80)[0]
    normals = np.empty((tri_count, 3), dtype=np.float64)
    tris = np.empty((tri_count, 3, 3), dtype=np.float64)
    off = 84
    for i in range(tri_count):
        vals = struct.unpack_from("<12f", data, off)
        normals[i] = vals[0:3]
        tris[i, 0] = vals[3:6]
        tris[i, 1] = vals[6:9]
        tris[i, 2] = vals[9:12]
        off += 50
    return normals, tris


def _weld(tris: np.ndarray):
    """Weld triangle soup into (verts, faces) by exact coordinate, as a CAD
    importer does. Returns indexed mesh."""
    flat = tris.reshape(-1, 3)
    # Use float32 view of the bytes as the key, since the file stored float32.
    keys = flat.astype(np.float32).view([("", np.float32)] * 3).ravel()
    uniq, inv = np.unique(keys, return_inverse=True)
    verts = uniq.view(np.float32).reshape(-1, 3).astype(np.float64)
    faces = inv.reshape(-1, 3).astype(np.int64)
    return verts, faces


def _signed_volume(verts, faces):
    v0, v1, v2 = verts[faces[:, 0]], verts[faces[:, 1]], verts[faces[:, 2]]
    return float(np.einsum("ij,ij->i", v0, np.cross(v1, v2)).sum() / 6.0)


STYLE_NAMES = list(STYLES.keys())


@pytest.mark.parametrize("style_name", STYLE_NAMES)
def test_exported_stl_welds_into_watertight_oriented_solid(style_name):
    style_fn = STYLES[style_name][0]
    verts, faces, _ = build_pot_mesh(
        H=100, Rt=60, Rb=45, t_wall=3, t_bottom=3, r_drain=8,
        expn=1.1, n_theta=72, n_z=36, r_outer_fn=style_fn, style_opts={},
    )
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / f"{style_name}.stl"
        write_stl_binary(path, style_name, verts, faces)
        stored_normals, tris = _read_binary_stl(path)

    wverts, wfaces = _weld(tris)

    # Welding must recover a closed manifold (no T-junctions / cracks introduced
    # by float32 rounding of the export).
    undirected = Counter()
    directed = Counter()
    for f in wfaces:
        a, b, c = int(f[0]), int(f[1]), int(f[2])
        for x, y in ((a, b), (b, c), (c, a)):
            undirected[(x, y) if x < y else (y, x)] += 1
            directed[(x, y)] += 1
    non_manifold = [e for e, n in undirected.items() if n != 2]
    flipped = [e for e, n in directed.items() if n != 1]
    assert not non_manifold, f"{style_name}: exported STL not watertight after weld ({len(non_manifold)} edges)"
    assert not flipped, f"{style_name}: exported STL has inconsistent winding after weld ({len(flipped)} edges)"

    # Normals point outward.
    assert _signed_volume(wverts, wfaces) > 0, f"{style_name}: exported solid is inside-out"


@pytest.mark.parametrize("style_name", STYLE_NAMES)
def test_stored_facet_normals_agree_with_winding(style_name):
    """The normal written into each facet record must agree with the geometric
    winding (so tools that trust the stored normal see the same outward side)."""
    style_fn = STYLES[style_name][0]
    verts, faces, _ = build_pot_mesh(
        H=100, Rt=60, Rb=45, t_wall=3, t_bottom=3, r_drain=8,
        expn=1.1, n_theta=72, n_z=36, r_outer_fn=style_fn, style_opts={},
    )
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / f"{style_name}.stl"
        write_stl_binary(path, style_name, verts, faces)
        stored_normals, tris = _read_binary_stl(path)

    geo = np.cross(tris[:, 1] - tris[:, 0], tris[:, 2] - tris[:, 0])
    glen = np.linalg.norm(geo, axis=1)
    nlen = np.linalg.norm(stored_normals, axis=1)
    valid = (glen > 1e-9) & (nlen > 1e-9)
    dots = np.einsum("ij,ij->i", geo[valid], stored_normals[valid]) / (glen[valid] * nlen[valid])
    # Stored normal must never oppose the winding direction.
    assert np.all(dots > 0.99), (
        f"{style_name}: {(dots <= 0.99).sum()} stored facet normals disagree with winding"
    )
