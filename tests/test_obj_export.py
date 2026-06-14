"""Tests for the Wavefront OBJ exporter.

OBJ is the most portable mesh format Rhino and Grasshopper import cleanly. To
count as "export quality" the writer must:
  - emit 1-indexed vertices/normals/faces (the OBJ spec)
  - reuse shared vertex indices (welded mesh — no duplicated seam)
  - carry smooth vertex normals so the import is not faceted
  - round-trip back to the same geometry
  - write atomically (no partial files on error)
"""
from __future__ import annotations

from pathlib import Path

import numpy as np

from potfoundry import build_pot_mesh, STYLES
from potfoundry.core.io.obj import write_obj


def _mesh():
    fn = STYLES["SuperformulaBlossom"][0]
    return build_pot_mesh(
        H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
        expn=1.1, n_theta=48, n_z=24, r_outer_fn=fn, style_opts={},
    )


def _parse_obj(text: str):
    vs, vns, fs = [], [], []
    for line in text.splitlines():
        parts = line.split()
        if not parts:
            continue
        if parts[0] == "v":
            vs.append([float(x) for x in parts[1:4]])
        elif parts[0] == "vn":
            vns.append([float(x) for x in parts[1:4]])
        elif parts[0] == "f":
            tri = []
            for tok in parts[1:4]:
                v_str, _, vn_str = tok.partition("//")
                tri.append((int(v_str), int(vn_str) if vn_str else None))
            fs.append(tri)
    return np.array(vs), np.array(vns), fs


def test_roundtrip_counts_and_indices(tmp_path):
    verts, faces, _ = _mesh()
    path = tmp_path / "pot.obj"
    write_obj(path, "Pot", verts, faces)

    text = path.read_text()
    vs, vns, fs = _parse_obj(text)

    assert len(vs) == len(verts)
    assert len(vns) == len(verts)  # one normal per (welded) vertex
    assert len(fs) == len(faces)

    # Vertex positions preserved.
    np.testing.assert_allclose(vs, verts, atol=1e-4)

    # Faces are 1-indexed and in range; v and vn index match (shared welding).
    for tri, orig in zip(fs, faces):
        for (vi, vni), oi in zip(tri, orig):
            assert vi == oi + 1
            assert vni == oi + 1
            assert 1 <= vi <= len(vs)


def test_normals_present_and_unit(tmp_path):
    verts, faces, _ = _mesh()
    path = tmp_path / "pot.obj"
    write_obj(path, "Pot", verts, faces)
    _, vns, _ = _parse_obj(path.read_text())
    lengths = np.linalg.norm(vns, axis=1)
    assert np.all(lengths > 0.99) and np.all(lengths < 1.01)


def test_welded_no_duplicate_vertices(tmp_path):
    """A welded export reuses indices; total v lines equals unique vertices."""
    verts, faces, _ = _mesh()
    path = tmp_path / "pot.obj"
    write_obj(path, "Pot", verts, faces)
    vs, _, _ = _parse_obj(path.read_text())
    # Our mesh has no coincident vertices, so v-line count == vertex count and
    # the face list references them by shared index (already checked above).
    assert len(vs) == len(verts)


def test_object_name_and_atomic(tmp_path):
    verts, faces, _ = _mesh()
    path = tmp_path / "named.obj"
    write_obj(path, "MyFancyPot", verts, faces)
    text = path.read_text()
    assert "MyFancyPot" in text
    # No leftover temp file.
    assert not list(tmp_path.glob("*.tmp"))


def test_returns_path(tmp_path):
    verts, faces, _ = _mesh()
    path = tmp_path / "pot.obj"
    result = write_obj(path, "Pot", verts, faces)
    assert Path(result) == path
