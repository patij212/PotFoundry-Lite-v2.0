"""OBJ export tests — clean indexed-mesh interchange for Rhino / Grasshopper.

Binary STL stores an unwelded triangle soup (every triangle carries its own
three vertices), so a typical pot exports ~3x more vertices than it has and
Rhino/Grasshopper must re-weld by tolerance on import — which can leave naked
edges. Wavefront OBJ stores explicit shared-vertex topology, so the welded
indexed mesh PotFoundry already builds round-trips exactly: same vertex count,
watertight, consistently wound, outward normals.

These tests pin that OBJ export preserves the mesh's clean topology.
"""
from __future__ import annotations

from collections import Counter

import numpy as np
import pytest

from potfoundry import build_pot_mesh, STYLES, write_obj


COMMON = dict(
    H=100, Rt=60, Rb=40, t_wall=3, t_bottom=3, r_drain=8,
    expn=1.1, n_theta=120, n_z=60,
)


def parse_obj(text: str):
    """Minimal OBJ parser -> (vertices Nx3 float, faces Mx3 int, zero-based)."""
    verts = []
    faces = []
    for line in text.splitlines():
        parts = line.split()
        if not parts:
            continue
        if parts[0] == "v":
            verts.append([float(x) for x in parts[1:4]])
        elif parts[0] == "f":
            # face tokens may be "i", "i/j", or "i//k"; take the vertex index.
            # OBJ is 1-based on disk -> convert to 0-based.
            idx = [int(tok.split("/")[0]) - 1 for tok in parts[1:]]
            assert len(idx) == 3, "exporter must emit triangles"
            faces.append(idx)
    return np.array(verts, dtype=float), np.array(faces, dtype=int)


def signed_volume(verts: np.ndarray, faces: np.ndarray) -> float:
    a = verts[faces[:, 0]]
    b = verts[faces[:, 1]]
    c = verts[faces[:, 2]]
    return float(np.einsum("ij,ij->i", a, np.cross(b, c)).sum() / 6.0)


def test_obj_roundtrips_to_welded_indexed_mesh(tmp_path):
    style_fn = STYLES["SuperformulaBlossom"][0]
    verts, faces, _ = build_pot_mesh(r_outer_fn=style_fn, style_opts={}, **COMMON)

    out = tmp_path / "pot.obj"
    ret = write_obj(out, "pot", verts, faces)
    assert ret == out and out.exists()

    pv, pf = parse_obj(out.read_text())

    # Same indexed topology — no triangle-soup vertex duplication.
    assert pv.shape == verts.shape, "OBJ must preserve the welded vertex count"
    assert pf.shape == faces.shape
    np.testing.assert_allclose(pv, verts, atol=1e-4)

    # Faces must be valid 1-based indices on disk (parsed back to 0-based here).
    assert pf.min() >= 0 and pf.max() < len(pv)


def test_obj_faces_are_one_indexed_on_disk(tmp_path):
    style_fn = STYLES["FourierBloom"][0]
    verts, faces, _ = build_pot_mesh(r_outer_fn=style_fn, style_opts={}, **COMMON)
    out = tmp_path / "pot.obj"
    write_obj(out, "pot", verts, faces)

    text = out.read_text()
    # The smallest face index referenced must be 1 (OBJ is 1-based, never 0).
    min_face_idx = min(
        int(tok.split("/")[0])
        for line in text.splitlines() if line.startswith("f ")
        for tok in line.split()[1:]
    )
    assert min_face_idx == 1, "OBJ face indices must be 1-based"


@pytest.mark.parametrize("style_name", list(STYLES.keys()))
def test_obj_mesh_is_watertight_and_outward(tmp_path, style_name):
    style_fn = STYLES[style_name][0]
    verts, faces, _ = build_pot_mesh(r_outer_fn=style_fn, style_opts={}, **COMMON)
    out = tmp_path / f"{style_name}.obj"
    write_obj(out, style_name, verts, faces)

    pv, pf = parse_obj(out.read_text())

    # Watertight: every undirected edge shared by exactly two faces.
    und: Counter = Counter()
    di: Counter = Counter()
    for tri in pf:
        for i in range(3):
            a, b = int(tri[i]), int(tri[(i + 1) % 3])
            und[tuple(sorted((a, b)))] += 1
            di[(a, b)] += 1
    assert all(c == 2 for c in und.values()), f"{style_name}: OBJ not watertight"

    # Consistently wound + outward (positive signed volume).
    dup = sum(1 for _, c in di.items() if c != 1)
    assert dup == 0, f"{style_name}: OBJ winding inconsistent"
    assert signed_volume(pv, pf) > 0, f"{style_name}: OBJ normals inverted"


def test_obj_with_vertex_normals(tmp_path):
    """When normals are requested, OBJ carries vn lines and f v//vn references."""
    style_fn = STYLES["HarmonicRipple"][0]
    verts, faces, _ = build_pot_mesh(r_outer_fn=style_fn, style_opts={}, **COMMON)
    out = tmp_path / "pot.obj"
    write_obj(out, "pot", verts, faces, vertex_normals=True)

    text = out.read_text()
    vn_lines = [ln for ln in text.splitlines() if ln.startswith("vn ")]
    assert len(vn_lines) == len(verts), "one vertex normal per vertex"
    # Face references must include a normal index (v//vn or v/vt/vn form).
    f_lines = [ln for ln in text.splitlines() if ln.startswith("f ")]
    assert all("//" in ln or ln.count("/") >= 2 for ln in f_lines)
