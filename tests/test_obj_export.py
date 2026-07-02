"""Tests for the welded OBJ exporter (potfoundry.core.io.obj).

OBJ is the format we recommend for CAD round-tripping (Rhino / Grasshopper):
unlike STL — which is unwelded triangle soup that duplicates every vertex three
times and carries only per-facet normals — OBJ preserves the mesh's already
*indexed / welded* topology and can carry smooth per-vertex normals. That means
Rhino imports the pot as a single closed mesh with no naked edges and correct
smooth shading, instead of a shell that needs Weld + Unify Normals.

These tests pin the export contract:
  * vertex / face counts are preserved (welded, not tripled),
  * faces are valid 1-based indices,
  * per-vertex normals are unit length and point outward,
  * the file re-parses to a mesh congruent with the input.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from potfoundry import STYLES, build_pot_mesh
from potfoundry.core.io.obj import write_obj

_PARAMS = dict(
    H=100, Rt=60, Rb=40,
    t_wall=3, t_bottom=3, r_drain=8,
    expn=1.1, n_theta=48, n_z=24,
)


def _mesh():
    fn = STYLES["SuperformulaBlossom"][0]
    return build_pot_mesh(r_outer_fn=fn, style_opts={}, **_PARAMS)


def _parse_obj(path: Path):
    """Minimal OBJ parser: returns (verts, vnormals, faces, face_normal_idx)."""
    verts: list[list[float]] = []
    vns: list[list[float]] = []
    faces: list[list[int]] = []
    fns: list[list[int]] = []
    for line in Path(path).read_text().splitlines():
        parts = line.split()
        if not parts:
            continue
        tag = parts[0]
        if tag == "v":
            verts.append([float(x) for x in parts[1:4]])
        elif tag == "vn":
            vns.append([float(x) for x in parts[1:4]])
        elif tag == "f":
            vi, ni = [], []
            for tok in parts[1:]:
                fields = tok.split("/")
                vi.append(int(fields[0]))
                if len(fields) == 3 and fields[2]:
                    ni.append(int(fields[2]))
            faces.append(vi)
            fns.append(ni)
    return (
        np.array(verts, dtype=float),
        np.array(vns, dtype=float) if vns else np.empty((0, 3)),
        np.array(faces, dtype=int),
        fns,
    )


def test_write_obj_returns_path_and_creates_file(tmp_path: Path):
    verts, faces, _ = _mesh()
    out = tmp_path / "pot.obj"
    result = write_obj(out, "Pot", verts, faces)
    assert isinstance(result, Path)
    assert result.exists() and result.stat().st_size > 0


def test_obj_preserves_welded_topology(tmp_path: Path):
    """Vertex and face counts match the indexed mesh (STL would triple verts)."""
    verts, faces, _ = _mesh()
    out = write_obj(tmp_path / "pot.obj", "Pot", verts, faces)
    pverts, pvns, pfaces, _ = _parse_obj(out)

    assert len(pverts) == len(verts), "OBJ must keep welded vertices"
    assert len(pfaces) == len(faces)
    # Geometry preserved (OBJ writes with finite precision → allow small tol).
    assert np.allclose(pverts, verts, atol=1e-4)


def test_obj_faces_are_valid_one_based_indices(tmp_path: Path):
    verts, faces, _ = _mesh()
    out = write_obj(tmp_path / "pot.obj", "Pot", verts, faces)
    _, _, pfaces, _ = _parse_obj(out)

    assert pfaces.min() >= 1, "OBJ indices are 1-based"
    assert pfaces.max() <= len(verts)
    # Reconstruct 0-based faces and confirm they equal the input faces.
    np.testing.assert_array_equal(pfaces - 1, faces)


def test_obj_vertex_normals_are_unit_and_outward(tmp_path: Path):
    verts, faces, _ = _mesh()
    out = write_obj(tmp_path / "pot.obj", "Pot", verts, faces, smooth=True)
    pverts, pvns, _, fns = _parse_obj(out)

    assert len(pvns) == len(pverts), "smooth OBJ has one normal per vertex"
    lengths = np.linalg.norm(pvns, axis=1)
    assert np.allclose(lengths, 1.0, atol=1e-3), "vertex normals must be unit"

    # Outer-wall vertices (leading (n_z+1)*n_theta indices) should have normals
    # pointing away from the Z axis.
    n_outer = (_PARAMS["n_z"] + 1) * _PARAMS["n_theta"]
    ow = pverts[:n_outer]
    radial = ow.copy()
    radial[:, 2] = 0.0
    rl = np.linalg.norm(radial, axis=1)
    keep = rl > 1.0
    dots = np.einsum("ij,ij->i", pvns[:n_outer][keep], radial[keep] / rl[keep, None])
    assert float((dots > 0).mean()) > 0.99, "outer-wall normals should face outward"


def test_obj_smooth_false_omits_normals(tmp_path: Path):
    verts, faces, _ = _mesh()
    out = write_obj(tmp_path / "pot.obj", "Pot", verts, faces, smooth=False)
    _, pvns, pfaces, fns = _parse_obj(out)
    assert len(pvns) == 0, "smooth=False should not emit vertex normals"
    assert all(len(n) == 0 for n in fns), "faces should have no normal refs"
    np.testing.assert_array_equal(pfaces - 1, faces)


def test_obj_is_exposed_in_public_api():
    import potfoundry

    assert hasattr(potfoundry, "write_obj")
    assert potfoundry.write_obj is write_obj
