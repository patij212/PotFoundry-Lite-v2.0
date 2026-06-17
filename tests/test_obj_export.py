"""Tests for Wavefront OBJ export (Rhino / Grasshopper interchange).

OBJ is the native mesh interchange format for Rhino and Grasshopper. Unlike STL
— which stores an unindexed triangle soup that the importer must re-weld, in
float32 — OBJ preserves the *welded, indexed* topology that ``build_pot_mesh``
already produces, so the mesh imports as a single clean watertight object.

These tests pin the round-trip contract: counts, 1-based indexing, exact
topology, full-precision vertices, and preserved watertightness.
"""
from __future__ import annotations

from collections import Counter

import numpy as np

from potfoundry import build_pot_mesh, STYLES
from potfoundry.core.io.obj import write_obj


def _parse_obj(text: str):
    verts = []
    faces = []
    for line in text.splitlines():
        parts = line.split()
        if not parts:
            continue
        if parts[0] == "v":
            verts.append([float(parts[1]), float(parts[2]), float(parts[3])])
        elif parts[0] == "f":
            # Take the vertex index before any '/<tex>/<normal>' suffix; 1-based.
            idx = [int(p.split("/")[0]) for p in parts[1:]]
            faces.append(idx[:3])
    return np.array(verts, dtype=float), np.array(faces, dtype=int)


def _mesh():
    fn = STYLES["SuperformulaBlossom"][0]
    return build_pot_mesh(
        H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
        expn=1.1, n_theta=60, n_z=30, r_outer_fn=fn, style_opts={},
    )


def test_write_obj_returns_path_and_writes_file(tmp_path):
    verts, faces, _ = _mesh()
    out = write_obj(tmp_path / "pot.obj", "Pot", verts, faces)
    assert out.exists()
    assert out.suffix == ".obj"


def test_obj_roundtrip_preserves_counts(tmp_path):
    verts, faces, _ = _mesh()
    out = write_obj(tmp_path / "pot.obj", "Pot", verts, faces)
    pverts, pfaces = _parse_obj(out.read_text())
    assert len(pverts) == len(verts)
    assert len(pfaces) == len(faces)


def test_obj_uses_one_based_indices_in_range(tmp_path):
    verts, faces, _ = _mesh()
    out = write_obj(tmp_path / "pot.obj", "Pot", verts, faces)
    _, pfaces = _parse_obj(out.read_text())
    assert pfaces.min() >= 1, "OBJ face indices must be 1-based"
    assert pfaces.max() <= len(verts), "face index out of range"


def test_obj_roundtrip_preserves_exact_topology(tmp_path):
    verts, faces, _ = _mesh()
    out = write_obj(tmp_path / "pot.obj", "Pot", verts, faces)
    _, pfaces = _parse_obj(out.read_text())
    # OBJ is 1-based; converting back must reproduce the welded index buffer.
    np.testing.assert_array_equal(pfaces - 1, faces)


def test_obj_roundtrip_preserves_vertices(tmp_path):
    verts, faces, _ = _mesh()
    out = write_obj(tmp_path / "pot.obj", "Pot", verts, faces)
    pverts, _ = _parse_obj(out.read_text())
    # Full float precision (unlike float32 STL): tight tolerance.
    np.testing.assert_allclose(pverts, verts, atol=1e-5)


def test_obj_roundtrip_is_watertight(tmp_path):
    verts, faces, _ = _mesh()
    out = write_obj(tmp_path / "pot.obj", "Pot", verts, faces)
    _, pfaces = _parse_obj(out.read_text())
    edges: Counter = Counter()
    for face in pfaces - 1:
        for i in range(3):
            edges[tuple(sorted((int(face[i]), int(face[(i + 1) % 3]))))] += 1
    non_manifold = [e for e, c in edges.items() if c != 2]
    assert non_manifold == [], "OBJ round-trip must stay watertight"


def test_obj_embeds_object_name(tmp_path):
    verts, faces, _ = _mesh()
    out = write_obj(tmp_path / "pot.obj", "MyCoolPot", verts, faces)
    text = out.read_text()
    assert "MyCoolPot" in text


def test_obj_with_vertex_normals_emits_vn_and_references(tmp_path):
    verts, faces, _ = _mesh()
    normals = np.tile([0.0, 0.0, 1.0], (len(verts), 1))
    out = write_obj(tmp_path / "pot.obj", "Pot", verts, faces, normals=normals)
    text = out.read_text()
    n_vn = sum(1 for ln in text.splitlines() if ln.startswith("vn "))
    assert n_vn == len(verts)
    # Faces must reference normals via the v//vn form.
    assert "//" in text
    # Topology still round-trips.
    _, pfaces = _parse_obj(text)
    np.testing.assert_array_equal(pfaces - 1, faces)


def test_obj_rejects_bad_shapes(tmp_path):
    import pytest

    verts, faces, _ = _mesh()
    with pytest.raises(ValueError):
        write_obj(tmp_path / "a.obj", "x", verts[:, :2], faces)
    with pytest.raises(ValueError):
        write_obj(tmp_path / "b.obj", "x", verts, faces[:, :2])
    with pytest.raises(ValueError):
        write_obj(tmp_path / "c.obj", "x", verts, faces, normals=verts[:-1])
