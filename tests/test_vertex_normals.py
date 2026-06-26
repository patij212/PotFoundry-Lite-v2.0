"""Tests for smooth per-vertex normals used in OBJ export.

Welded vertex normals let Rhino/Grasshopper reconstruct and shade the pot's
curved surface smoothly instead of as visibly faceted triangles. Because the
periodic theta seam shares vertices (modular indexing), area-weighted averaging
is automatically consistent across the seam.
"""
from __future__ import annotations

import numpy as np
import pytest

from potfoundry import build_pot_mesh, STYLES
from potfoundry.core.mesh import compute_vertex_normals


def _mesh(style_name, n_theta=64, n_z=32, opts=None):
    fn = STYLES[style_name][0]
    return build_pot_mesh(
        H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
        expn=1.1, n_theta=n_theta, n_z=n_z, r_outer_fn=fn, style_opts=opts or {},
    )


@pytest.mark.parametrize("style_name", list(STYLES.keys()))
def test_vertex_normals_unit_length(style_name):
    verts, faces, _ = _mesh(style_name)
    vn = compute_vertex_normals(verts, faces)
    assert vn.shape == verts.shape
    lengths = np.linalg.norm(vn, axis=1)
    # Every normal is unit length (a vertex on a closed solid always has faces).
    np.testing.assert_allclose(lengths, 1.0, atol=1e-6)


@pytest.mark.parametrize("style_name", list(STYLES.keys()))
def test_vertex_normals_agree_with_incident_faces(style_name):
    """Each vertex normal should sit in the same half-space as its faces' normals."""
    verts, faces, _ = _mesh(style_name)
    vn = compute_vertex_normals(verts, faces)

    v0, v1, v2 = verts[faces[:, 0]], verts[faces[:, 1]], verts[faces[:, 2]]
    fn = np.cross(v1 - v0, v2 - v0)  # outward (mesh is outward-wound)

    # For each face, the three incident vertex normals must not oppose the face
    # normal -> dot >= 0. A tiny negative tolerance covers sharp concave seams.
    dots = np.concatenate([
        np.einsum("ij,ij->i", vn[faces[:, k]], fn) for k in range(3)
    ])
    frac_ok = float((dots >= -1e-6).mean())
    assert frac_ok > 0.98, f"{style_name}: only {frac_ok:.3f} of vertex normals agree"


def test_vertex_normals_flip_with_winding():
    verts, faces, _ = _mesh("SuperellipseMorph")
    vn = compute_vertex_normals(verts, faces)
    vn_flipped = compute_vertex_normals(verts, faces[:, ::-1])
    np.testing.assert_allclose(vn, -vn_flipped, atol=1e-6)


def test_vertex_normals_seam_consistent():
    """Vertices on the theta seam are shared, so normals are single-valued there."""
    # Smooth low-frequency style so the surface is genuinely smooth at the seam.
    verts, faces, _ = _mesh("SuperellipseMorph", n_theta=72, n_z=36)
    vn = compute_vertex_normals(verts, faces)
    # No NaNs/zeros anywhere (would indicate an unreferenced or degenerate vertex).
    assert np.all(np.isfinite(vn))
    assert np.all(np.linalg.norm(vn, axis=1) > 0.5)


def test_obj_with_smooth_normals_roundtrip(tmp_path):
    from potfoundry import write_obj

    verts, faces, _ = _mesh("FourierBloom")
    vn = compute_vertex_normals(verts, faces)
    out = tmp_path / "pot.obj"
    write_obj(out, "pot", verts, faces, normals=vn)

    text = out.read_text()
    assert "vn " in text
    # faces must reference normals: "f a//a b//b c//c"
    assert "//" in text
    n_vn = sum(1 for ln in text.splitlines() if ln.startswith("vn "))
    assert n_vn == len(verts)
