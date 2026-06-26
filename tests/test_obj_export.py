"""Tests for indexed Wavefront OBJ export.

OBJ preserves the *welded indexed* mesh (shared vertices + face indices), unlike
binary STL which writes an unwelded triangle soup. Rhino and Grasshopper import
OBJ directly as a connected mesh, so this format is central to export quality.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from potfoundry import build_pot_mesh, STYLES
from potfoundry.core.io.obj import write_obj
from potfoundry.core.mesh import edge_manifold_stats, signed_volume


def _parse_obj(path: Path):
    """Minimal OBJ parser -> (vertices Nx3 float, faces Mx3 int 0-based)."""
    verts = []
    faces = []
    for line in path.read_text().splitlines():
        if line.startswith("v "):
            _, x, y, z = line.split()[:4]
            verts.append((float(x), float(y), float(z)))
        elif line.startswith("f "):
            idx = []
            for tok in line.split()[1:]:
                # handles v, v/vt, v//vn, v/vt/vn
                idx.append(int(tok.split("/")[0]))
            assert len(idx) == 3, "expected triangular faces"
            faces.append(tuple(idx))
    return np.array(verts, dtype=float), np.array(faces, dtype=np.int64)


def test_obj_roundtrip_simple_triangle(tmp_path: Path):
    verts = np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0]], dtype=float)
    faces = np.array([[0, 1, 2]], dtype=np.int64)
    out = tmp_path / "tri.obj"
    write_obj(out, "tri", verts, faces)

    pv, pf = _parse_obj(out)
    assert len(pv) == 3
    assert len(pf) == 1
    # OBJ indices are 1-based.
    assert pf.min() >= 1
    np.testing.assert_allclose(pv, verts, atol=1e-6)
    # 1-based face references the same triangle.
    np.testing.assert_array_equal(pf - 1, faces)


def test_obj_has_header_and_counts(tmp_path: Path):
    verts = np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0]], dtype=float)
    faces = np.array([[0, 1, 2]], dtype=np.int64)
    out = tmp_path / "tri.obj"
    write_obj(out, "MyPot", verts, faces)
    text = out.read_text()
    assert text.startswith("#"), "OBJ should start with a comment header"
    assert "MyPot" in text
    assert text.count("\nv ") + text.startswith("v ") == 3  # 3 vertex lines


@pytest.mark.parametrize("style_name", list(STYLES.keys()))
def test_obj_preserves_indexed_pot_mesh(tmp_path: Path, style_name):
    """A full pot mesh round-trips through OBJ preserving topology + geometry."""
    fn = STYLES[style_name][0]
    verts, faces, _ = build_pot_mesh(
        H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
        expn=1.1, n_theta=64, n_z=32, r_outer_fn=fn, style_opts={},
    )
    out = tmp_path / f"{style_name}.obj"
    write_obj(out, style_name, verts, faces)

    pv, pf = _parse_obj(out)
    assert pv.shape == verts.shape
    assert pf.shape == faces.shape
    # Vertex count must equal the indexed (welded) vertex count -- NOT 3x faces.
    assert len(pv) < 3 * len(pf), "OBJ must keep shared vertices, not a soup"
    np.testing.assert_allclose(pv, verts, atol=1e-5)

    pf0 = pf - 1
    np.testing.assert_array_equal(pf0, faces)
    # Topology + orientation survive the round trip.
    stats = edge_manifold_stats(pv, pf0)
    assert stats.is_oriented_manifold
    assert signed_volume(pv, pf0) > 0.0


def test_obj_atomic_write_no_partial_file(tmp_path: Path, monkeypatch):
    """A failed write must not leave a corrupt target file in place."""
    verts = np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0]], dtype=float)
    faces = np.array([[0, 1, 2]], dtype=np.int64)
    out = tmp_path / "tri.obj"
    write_obj(out, "good", verts, faces)
    original = out.read_text()

    # Force the encoder to blow up mid-way; the existing file must be untouched.
    import potfoundry.core.io.obj as objmod

    def boom(*a, **k):
        raise RuntimeError("synthetic failure")

    monkeypatch.setattr(objmod, "_encode_obj", boom)
    with pytest.raises(RuntimeError):
        write_obj(out, "bad", verts, faces)
    assert out.read_text() == original, "target must be unchanged after failure"
    assert not list(tmp_path.glob("*.tmp")), "no temp file should remain"
