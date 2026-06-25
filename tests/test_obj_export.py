"""Wavefront OBJ export tests (Rhino / Grasshopper import quality).

Unlike STL (a triangle soup of raw coordinates), OBJ stores **shared vertices**
and optional **vertex normals**. This is the format CAD/parametric tools such
as Rhino and Grasshopper import most cleanly:

* shared ``v`` records mean the importer does not have to guess a weld
  tolerance — the mesh arrives already closed;
* ``vn`` smooth normals give correct shading on curved walls instead of a
  faceted look.

These tests verify the writer emits a well-formed OBJ that round-trips back to
the same closed, outward-oriented solid, with vertices shared (not duplicated)
and outward-consistent vertex normals.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from potfoundry import build_pot_mesh, signed_volume, STYLES
from potfoundry.core.io.obj import write_obj


def parse_obj(path: Path):
    """Minimal OBJ parser returning (vertices, normals, faces, face_normal_idx)."""
    verts, normals, faces, fnorm = [], [], [], []
    for line in path.read_text().splitlines():
        if line.startswith("v "):
            verts.append([float(x) for x in line.split()[1:4]])
        elif line.startswith("vn "):
            normals.append([float(x) for x in line.split()[1:4]])
        elif line.startswith("f "):
            tri, nidx = [], []
            for tok in line.split()[1:]:
                parts = tok.split("/")
                tri.append(int(parts[0]))
                if len(parts) == 3 and parts[2]:
                    nidx.append(int(parts[2]))
            faces.append(tri)
            fnorm.append(nidx)
    return (
        np.array(verts, dtype=float),
        np.array(normals, dtype=float) if normals else None,
        np.array(faces, dtype=int),
        fnorm,
    )


def _pot():
    fn = STYLES["SuperformulaBlossom"][0]
    return build_pot_mesh(
        H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
        expn=1.1, n_theta=72, n_z=36, r_outer_fn=fn, style_opts={},
    )


def test_obj_shares_vertices_not_triangle_soup(tmp_path):
    """Vertex records equal the mesh vertex count (no per-triangle duplication)."""
    verts, faces, _ = _pot()
    out = write_obj(tmp_path / "pot.obj", "Pot", verts, faces)

    pv, _, pf, _ = parse_obj(out)
    assert pv.shape == verts.shape, "OBJ must store shared vertices, not a soup"
    assert pf.shape[0] == faces.shape[0]
    # Triangle soup would have written 3x as many vertices as faces.
    assert pv.shape[0] < 3 * pf.shape[0]


def test_obj_faces_are_one_indexed_and_in_range(tmp_path):
    verts, faces, _ = _pot()
    out = write_obj(tmp_path / "pot.obj", "Pot", verts, faces)
    pv, _, pf, _ = parse_obj(out)
    assert pf.min() >= 1, "OBJ face indices are 1-based"
    assert pf.max() <= pv.shape[0]


def test_obj_roundtrips_to_same_closed_outward_solid(tmp_path):
    """Parsing the OBJ back reproduces the same outward-oriented closed solid."""
    verts, faces, _ = _pot()
    out = write_obj(tmp_path / "pot.obj", "Pot", verts, faces)
    pv, _, pf, _ = parse_obj(out)

    faces0 = pf[:, :3] - 1  # back to 0-based
    # OBJ coords are written at ~1e-5 mm precision; allow 1 micron round-trip.
    np.testing.assert_allclose(pv, verts, atol=1e-3)
    np.testing.assert_array_equal(faces0, faces)

    vol = signed_volume(pv, faces0)
    assert vol > 0, "round-tripped OBJ solid must keep outward normals"

    # Closed: every welded edge shared by exactly two faces.
    _, inv = np.unique(np.round(pv, 5), axis=0, return_inverse=True)
    wf = inv[faces0]
    e = np.concatenate([wf[:, [0, 1]], wf[:, [1, 2]], wf[:, [2, 0]]], axis=0)
    e.sort(axis=1)
    _, counts = np.unique(e, axis=0, return_counts=True)
    assert np.all(counts == 2), "round-tripped OBJ must be a closed manifold"


def test_obj_includes_outward_vertex_normals(tmp_path):
    """Vertex normals are written and agree with the outward face winding."""
    verts, faces, _ = _pot()
    out = write_obj(tmp_path / "pot.obj", "Pot", verts, faces, include_normals=True)
    pv, vn, pf, fnorm = parse_obj(out)

    assert vn is not None and vn.shape[0] == pv.shape[0], "expected one vn per vertex"
    # Normals are unit length.
    lengths = np.linalg.norm(vn, axis=1)
    assert np.allclose(lengths, 1.0, atol=1e-5)
    # Each face references a normal index per vertex.
    assert all(len(n) == 3 for n in fnorm)

    # A smooth vertex normal should agree with the average of its incident
    # outward face normals: check the dot product is positive everywhere.
    fv0, fv1, fv2 = verts[faces[:, 0]], verts[faces[:, 1]], verts[faces[:, 2]]
    face_n = np.cross(fv1 - fv0, fv2 - fv0)
    acc = np.zeros_like(verts)
    for k in range(3):
        np.add.at(acc, faces[:, k], face_n)
    norms = np.linalg.norm(acc, axis=1, keepdims=True)
    expected = acc / np.where(norms == 0, 1.0, norms)
    dots = np.einsum("ij,ij->i", expected, vn)
    nonzero = norms[:, 0] > 1e-9
    assert np.all(dots[nonzero] > 0), "vertex normals must point outward"


def test_obj_writer_returns_path_and_names_object(tmp_path):
    verts, faces, _ = _pot()
    out = write_obj(tmp_path / "pot.obj", "MyPot", verts, faces)
    assert isinstance(out, Path) and out.exists()
    text = out.read_text()
    assert "o MyPot" in text or "g MyPot" in text
