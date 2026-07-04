"""OBJ export tests — indexed-mesh export for Rhino / Grasshopper.

Binary STL de-indexes every triangle (3 vertices per face), so a mesh with N
shared vertices is written as 3*M vertices. On import, Rhino has to re-weld
those duplicates by a distance tolerance; when that guess is wrong the mesh
comes in with "naked edges" and is not recognised as closed.

OBJ instead stores a shared vertex table plus 1-based face indices, so the
exact topology PotFoundry built is preserved: the importer welds nothing and
the mesh is guaranteed closed. These tests pin down that the writer:

* preserves the vertex count and face topology exactly (no de-indexing),
* emits a spec-correct, re-parseable OBJ (1-based faces), and
* round-trips to a mesh that is still a watertight, coherently-wound manifold.
"""

from __future__ import annotations

from collections import Counter

import numpy as np
import pytest

from potfoundry import build_pot_mesh, STYLES
from potfoundry.core.io.obj import write_obj


def _parse_obj(path):
    verts = []
    faces = []
    name = None
    with open(path, "r") as fh:
        for line in fh:
            parts = line.split()
            if not parts:
                continue
            tag = parts[0]
            if tag == "v":
                verts.append([float(x) for x in parts[1:4]])
            elif tag == "f":
                # face tokens may be "i", "i/j", "i//k", or "i/j/k"; take vertex idx
                idx = [int(p.split("/")[0]) for p in parts[1:]]
                faces.append(idx)
            elif tag == "o":
                name = parts[1] if len(parts) > 1 else ""
    return np.array(verts, dtype=float), np.array(faces, dtype=int), name


def _build():
    fn = STYLES["SuperformulaBlossom"][0]
    return build_pot_mesh(
        H=120,
        Rt=70,
        Rb=50,
        t_wall=3,
        t_bottom=3,
        r_drain=10,
        expn=1.1,
        n_theta=64,
        n_z=32,
        r_outer_fn=fn,
        style_opts={},
    )


def test_obj_preserves_indexed_topology(tmp_path):
    verts, faces, _ = _build()
    out = write_obj(tmp_path / "pot.obj", "Pot", verts, faces)
    assert out.exists()

    pv, pf, name = _parse_obj(out)
    # No de-indexing: vertex table matches the mesh exactly.
    assert len(pv) == len(verts), "OBJ must keep the shared vertex table"
    assert pf.shape == faces.shape, "Face count/shape must be preserved"
    assert name == "Pot"


def test_obj_faces_are_one_based_and_in_range(tmp_path):
    verts, faces, _ = _build()
    out = write_obj(tmp_path / "pot.obj", "Pot", verts, faces)
    _, pf, _ = _parse_obj(out)
    # OBJ face indices are 1-based; every index must be within the vertex table.
    assert pf.min() >= 1, "OBJ face indices are 1-based"
    assert pf.max() <= len(verts)
    # Re-based faces must match the original topology exactly.
    assert np.array_equal(pf - 1, faces)


def test_obj_roundtrip_geometry_matches(tmp_path):
    verts, faces, _ = _build()
    out = write_obj(tmp_path / "pot.obj", "Pot", verts, faces)
    pv, pf, _ = _parse_obj(out)
    # Positions survive the 6-dp text round-trip.
    assert np.allclose(pv, verts, atol=1e-5)
    assert np.array_equal(pf - 1, faces)


def test_obj_roundtrip_is_watertight_and_coherent(tmp_path):
    """The re-parsed OBJ mesh is still a closed, coherently-wound manifold."""
    verts, faces, _ = _build()
    out = write_obj(tmp_path / "pot.obj", "Pot", verts, faces)
    pv, pf, _ = _parse_obj(out)
    pf0 = pf - 1

    undirected = Counter(
        tuple(sorted((int(a), int(b))))
        for face in pf0
        for a, b in [(face[i], face[(i + 1) % 3]) for i in range(3)]
    )
    assert all(c == 2 for c in undirected.values()), "OBJ mesh must stay watertight"

    directed = Counter(
        (int(a), int(b))
        for face in pf0
        for a, b in [(face[i], face[(i + 1) % 3]) for i in range(3)]
    )
    assert all(c == 1 for c in directed.values()), "OBJ mesh must stay coherently wound"


def test_obj_with_normals_references_vertex_normals(tmp_path):
    verts, faces, _ = _build()
    out = write_obj(tmp_path / "pot.obj", "Pot", verts, faces, include_normals=True)
    text = out.read_text()
    assert "vn " in text, "include_normals should emit vertex normals"
    # Face lines must reference normals as 'v//vn'.
    f_lines = [ln for ln in text.splitlines() if ln.startswith("f ")]
    assert f_lines and all("//" in tok for ln in f_lines for tok in ln.split()[1:])

    # Emitted normals are unit length ...
    vn = np.array(
        [
            [float(x) for x in ln.split()[1:4]]
            for ln in text.splitlines()
            if ln.startswith("vn ")
        ]
    )
    lengths = np.linalg.norm(vn, axis=1)
    assert np.allclose(lengths, 1.0, atol=1e-4), "vertex normals must be unit length"

    # ... and point outward on the outer wall: a mid-height vertex whose radius
    # is close to the pot's max radius sits on the exterior wall, where the
    # normal should have a positive radial component (away from the Z axis).
    r = np.hypot(verts[:, 0], verts[:, 1])
    z = verts[:, 2]
    wall = (z > 30) & (z < 90) & (r > 0.9 * r.max())
    idx = np.where(wall)[0]
    assert idx.size, "expected some exterior wall vertices to sample"
    radial = verts[idx, :2] / np.linalg.norm(verts[idx, :2], axis=1)[:, None]
    dots = np.einsum("ij,ij->i", vn[idx, :2], radial)
    assert np.median(dots) > 0.5, "outer-wall vertex normals must point outward"


@pytest.mark.parametrize("style_name", list(STYLES.keys()))
def test_obj_all_styles(tmp_path, style_name):
    fn = STYLES[style_name][0]
    verts, faces, _ = build_pot_mesh(
        H=100,
        Rt=60,
        Rb=45,
        t_wall=3,
        t_bottom=3,
        r_drain=8,
        expn=1.1,
        n_theta=48,
        n_z=24,
        r_outer_fn=fn,
        style_opts={},
    )
    out = write_obj(tmp_path / f"{style_name}.obj", style_name, verts, faces)
    pv, pf, _ = _parse_obj(out)
    assert len(pv) == len(verts)
    assert np.array_equal(pf - 1, faces)
