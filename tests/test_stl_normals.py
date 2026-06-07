"""Regression: binary STL must store outward-pointing facet normals.

Facet normals in binary STL are derived from the triangle winding (right-hand
rule). Before the mesh-winding fix the pot was not coherently oriented, so the
exported STL carried inward / inconsistent facet normals on the wall and cap
sub-surfaces — wrong for slicers that trust the normal field and for any CAD
tool that re-imports the STL. These tests lock the corrected behaviour:

* every stored facet normal matches its triangle's right-hand-rule winding, and
* the de-welded triangle soup encloses a positive (outward) signed volume.
"""
from __future__ import annotations

import struct
from pathlib import Path

import numpy as np

from potfoundry import build_pot_mesh, STYLES, write_stl_binary


def _read_binary_stl(path: Path):
    data = path.read_bytes()
    n = struct.unpack("<I", data[80:84])[0]
    normals = np.empty((n, 3), dtype=np.float64)
    tris = np.empty((n, 3, 3), dtype=np.float64)
    off = 84
    for i in range(n):
        rec = data[off:off + 50]
        off += 50
        vals = struct.unpack("<12f", rec[:48])
        normals[i] = vals[0:3]
        tris[i, 0] = vals[3:6]
        tris[i, 1] = vals[6:9]
        tris[i, 2] = vals[9:12]
    return normals, tris


def _make_mesh(style="SuperformulaBlossom"):
    fn = STYLES[style][0]
    return build_pot_mesh(
        H=100, Rt=60, Rb=40,
        t_wall=3, t_bottom=3, r_drain=8,
        expn=1.1, n_theta=48, n_z=24,
        r_outer_fn=fn, style_opts={},
    )


def test_stl_facet_normals_match_winding(tmp_path):
    verts, faces, _ = _make_mesh()
    out = tmp_path / "pot.stl"
    write_stl_binary(out, "pot", verts, faces)

    normals, tris = _read_binary_stl(out)
    a, b, c = tris[:, 0], tris[:, 1], tris[:, 2]
    wind = np.cross(b - a, c - a)
    lens = np.linalg.norm(wind, axis=1)
    ok = lens > 0
    wind[ok] /= lens[ok][:, None]

    # Stored normal should point the same way as the winding normal.
    dots = np.einsum("ij,ij->i", normals[ok], wind[ok])
    assert np.all(dots > 0.99), "stored STL normals must match right-hand winding"


def test_stl_triangle_soup_is_outward(tmp_path):
    """The exported (de-welded) triangles still enclose a positive volume."""
    verts, faces, _ = _make_mesh()
    out = tmp_path / "pot.stl"
    write_stl_binary(out, "pot", verts, faces)

    _, tris = _read_binary_stl(out)
    a, b, c = tris[:, 0], tris[:, 1], tris[:, 2]
    signed_vol = np.einsum("ij,ij->i", a, np.cross(b, c)).sum() / 6.0
    assert signed_vol > 0, f"STL normals point inward (vol {signed_vol})"
