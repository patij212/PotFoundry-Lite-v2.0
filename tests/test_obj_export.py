"""Tests for indexed OBJ export (Grasshopper/Rhino-friendly).

Binary STL explodes a welded, indexed mesh into independent triangles with only
faceted per-face normals. Rhino/Grasshopper import that as triangle soup and must
re-weld it. Wavefront OBJ preserves the *indexed* topology (one shared vertex per
corner) and can carry smooth per-vertex normals, so it imports as a single
connected, smoothly-shaded mesh.

These tests verify the OBJ writer:
  - round-trips the indexed vertices and faces (welded topology preserved),
  - emits unit-length per-vertex normals (one per vertex),
  - uses 1-based indices and the same winding as the source mesh,
  - parses cleanly.

Run with: PYTHONPATH=. pytest tests/test_obj_export.py -v
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from potfoundry import STYLES, build_pot_mesh
from potfoundry.core.io.obj import write_obj


def _parse_obj(path: Path):
    verts, normals, faces, faces_vn = [], [], [], []
    for line in Path(path).read_text().splitlines():
        parts = line.split()
        if not parts:
            continue
        tag = parts[0]
        if tag == "v":
            verts.append([float(x) for x in parts[1:4]])
        elif tag == "vn":
            normals.append([float(x) for x in parts[1:4]])
        elif tag == "f":
            vi, ni = [], []
            for tok in parts[1:]:
                fields = tok.split("/")
                vi.append(int(fields[0]))
                if len(fields) == 3 and fields[2]:
                    ni.append(int(fields[2]))
            faces.append(vi)
            faces_vn.append(ni)
    return (
        np.array(verts, dtype=float),
        np.array(normals, dtype=float),
        np.array(faces, dtype=int),
        faces_vn,
    )


@pytest.fixture()
def sample_mesh():
    style_fn = STYLES["SuperformulaBlossom"][0]
    return build_pot_mesh(
        H=100, Rt=60, Rb=40,
        t_wall=3, t_bottom=3, r_drain=8,
        expn=1.1, n_theta=60, n_z=30,
        r_outer_fn=style_fn, style_opts={},
    )


def test_obj_roundtrips_indexed_topology(tmp_path, sample_mesh):
    verts, faces, _ = sample_mesh
    out = write_obj(tmp_path / "pot.obj", "Pot", verts, faces)
    assert out.exists()

    pverts, pnormals, pfaces, _ = _parse_obj(out)

    # Welded, indexed topology preserved exactly.
    assert pverts.shape == verts.shape
    assert pfaces.shape == faces.shape
    np.testing.assert_allclose(pverts, verts, atol=1e-4)
    # OBJ is 1-based; subtract to compare indices and winding.
    np.testing.assert_array_equal(pfaces - 1, faces)


def test_obj_has_unit_vertex_normals(tmp_path, sample_mesh):
    verts, faces, _ = sample_mesh
    out = write_obj(tmp_path / "pot.obj", "Pot", verts, faces)
    _, normals, _, faces_vn = _parse_obj(out)

    # One normal per vertex.
    assert normals.shape == verts.shape
    lengths = np.linalg.norm(normals, axis=1)
    np.testing.assert_allclose(lengths, 1.0, atol=1e-4)

    # Normal indices match vertex indices (smooth shading references shared verts).
    for vi_face, ni_face in zip((faces + 1).tolist(), faces_vn):
        assert ni_face == vi_face


def test_obj_outer_wall_normals_point_outward(tmp_path, sample_mesh):
    verts, faces, _ = sample_mesh
    out = write_obj(tmp_path / "pot.obj", "Pot", verts, faces)
    pverts, normals, _, _ = _parse_obj(out)

    # build_pot_mesh appends the outer-wall rings first: (n_z + 1) * n_theta
    # vertices. Slice them unambiguously (radius alone can't separate the inner
    # wall, whose normals *correctly* point inward).
    n_theta, n_z = 60, 30
    n_outer = (n_z + 1) * n_theta
    z = pverts[:n_outer, 2]
    mid = (z > 20) & (z < 80)

    radial = pverts[:n_outer, :2][mid]
    radial_unit = radial / np.linalg.norm(radial, axis=1)[:, None]
    dots = np.einsum("ij,ij->i", normals[:n_outer][mid][:, :2], radial_unit)
    # Mid-height outer-wall smooth normals point away from the axis (outward).
    assert np.mean(dots > 0) > 0.95


def test_obj_writes_for_all_styles(tmp_path):
    for name, (style_fn, _desc) in STYLES.items():
        verts, faces, _ = build_pot_mesh(
            H=100, Rt=60, Rb=40,
            t_wall=3, t_bottom=3, r_drain=8,
            expn=1.1, n_theta=48, n_z=24,
            r_outer_fn=style_fn, style_opts={},
        )
        out = write_obj(tmp_path / f"{name}.obj", name, verts, faces)
        pverts, _, pfaces, _ = _parse_obj(out)
        assert pverts.shape == verts.shape
        assert pfaces.shape == faces.shape


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
