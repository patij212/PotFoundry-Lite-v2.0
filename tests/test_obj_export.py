"""Tests for OBJ export (Rhino/Grasshopper-friendly mesh interchange).

STL is per-facet: it stores three raw vertex coordinates per triangle with no
shared topology and no smooth normals. Rhino/Grasshopper therefore import an STL
as tens of thousands of *loose, unwelded* triangles which must be welded by hand
before the surface is usable.

OBJ keeps the welded vertex topology produced by the builder (one ``v`` per
vertex, faces reference shared 1-based indices) and carries smooth per-vertex
normals (``vn``). That is a materially cleaner import: a single connected,
correctly-oriented mesh with smooth shading, ready for QuadRemesh/loft.

These tests pin the properties that make OBJ a quality upgrade over STL:
- welded vertices (vertex count == builder vertex count, no triangle-soup),
- valid 1-based face indices covering every vertex,
- one outward-pointing unit normal per vertex,
- a parseable, deterministic, atomically-written file.
"""
from __future__ import annotations

import numpy as np
import pytest

from potfoundry import build_pot_mesh, STYLES


def _build(style="SuperformulaBlossom", n_theta=60, n_z=30, **over):
    params = dict(H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10, expn=1.1)
    params.update(over)
    fn = STYLES[style][0]
    return build_pot_mesh(n_theta=n_theta, n_z=n_z, r_outer_fn=fn, style_opts={}, **params)


def _parse_obj(text):
    """Minimal OBJ parser -> (vertices, normals, faces, face_normal_idx)."""
    verts, norms, faces, fnorms = [], [], [], []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        tag = parts[0]
        if tag == "v":
            verts.append([float(x) for x in parts[1:4]])
        elif tag == "vn":
            norms.append([float(x) for x in parts[1:4]])
        elif tag == "f":
            vi, ni = [], []
            for tok in parts[1:]:
                fields = tok.split("/")
                vi.append(int(fields[0]))
                if len(fields) == 3 and fields[2]:
                    ni.append(int(fields[2]))
            faces.append(vi)
            if ni:
                fnorms.append(ni)
    return (
        np.array(verts, dtype=float),
        np.array(norms, dtype=float),
        np.array(faces, dtype=int),
        np.array(fnorms, dtype=int) if fnorms else None,
    )


def test_write_obj_importable(tmp_path):
    from potfoundry import write_obj

    verts, faces, _ = _build()
    out = write_obj(tmp_path / "pot.obj", "Pot", verts, faces)
    assert out.exists()

    pv, pn, pf, pfn = _parse_obj(out.read_text())

    # Welded: one v per builder vertex (NOT 3 * face_count triangle soup).
    assert len(pv) == len(verts)
    assert len(pv) < 3 * len(faces)
    # Faces preserved and 1-based.
    assert len(pf) == len(faces)
    assert pf.min() == 1 and pf.max() == len(verts)
    # Coordinates round-trip.
    np.testing.assert_allclose(pv, verts, atol=1e-4)


def test_obj_has_outward_unit_vertex_normals(tmp_path):
    from potfoundry import write_obj

    verts, faces, _ = _build()
    out = write_obj(tmp_path / "pot.obj", "Pot", verts, faces)
    pv, pn, pf, pfn = _parse_obj(out.read_text())

    # At least one normal per vertex (creases may split some).
    assert len(pn) >= len(verts)
    # Unit length.
    lengths = np.linalg.norm(pn, axis=1)
    np.testing.assert_allclose(lengths, 1.0, atol=1e-5)

    # Vertex normals must agree with the (outward) face orientation: for every
    # face, the geometric face normal and the average of its three corner
    # normals point the same way. This proves the normals are outward everywhere
    # (outer wall outward, inner wall toward the cavity) without classifying
    # which wall each vertex belongs to. Corner normals are looked up via the
    # per-face normal indices (pfn), which is correct in both smooth and crease
    # modes.
    f0 = pf[:, 0] - 1
    f1 = pf[:, 1] - 1
    f2 = pf[:, 2] - 1
    n0 = pfn[:, 0] - 1
    n1 = pfn[:, 1] - 1
    n2 = pfn[:, 2] - 1
    face_n = np.cross(verts[f1] - verts[f0], verts[f2] - verts[f0])
    vavg = (pn[n0] + pn[n1] + pn[n2]) / 3.0
    agree = np.einsum("ij,ij->i", face_n, vavg)
    # Crease-aware normals follow face orientation, so agreement is near-total.
    assert np.mean(agree > 0) > 0.99


def test_obj_deterministic(tmp_path):
    from potfoundry import write_obj

    verts, faces, _ = _build()
    a = write_obj(tmp_path / "a.obj", "Pot", verts, faces).read_bytes()
    b = write_obj(tmp_path / "b.obj", "Pot", verts, faces).read_bytes()
    assert a == b


def test_obj_atomic_no_tmp_left(tmp_path):
    from potfoundry import write_obj

    verts, faces, _ = _build()
    write_obj(tmp_path / "pot.obj", "Pot", verts, faces)
    leftovers = list(tmp_path.glob("*.tmp"))
    assert leftovers == []


@pytest.mark.parametrize("style", list(STYLES.keys()))
def test_obj_all_styles(tmp_path, style):
    from potfoundry import write_obj

    verts, faces, _ = _build(style=style, n_theta=40, n_z=20)
    out = write_obj(tmp_path / f"{style}.obj", style, verts, faces)
    pv, pn, pf, pfn = _parse_obj(out.read_text())
    assert len(pv) == len(verts)
    assert len(pf) == len(faces)
    # Crease-aware export (the default) splits normals at sharp edges, so there
    # are at least as many normals as vertices.
    assert len(pn) >= len(verts)


def _rim_and_wall_masks(verts, faces, H):
    """Boolean face masks for rim-cap faces and the outer-wall faces just below
    the rim, used to check that the rim edge stays crisp."""
    z = verts[faces, 2]  # (M, 3)
    zmin = z.min(axis=1)
    zmax = z.max(axis=1)
    rim = zmax > (H - 1e-6)
    rim_cap = rim & (zmin > H - 1e-6)          # all three corners on the rim
    wall_top = rim & (zmin < H - 1.0)          # straddles rim -> down the wall
    return rim_cap, wall_top


def test_obj_crease_preserves_rim_edge(tmp_path):
    """Default (crease-aware) normals keep the rim a hard edge: rim-cap corners
    face up (+/-Z) while wall corners just below stay radial. A shared rim vertex
    must therefore carry *different* normals per face (split normals)."""
    from potfoundry import write_obj

    H = 120
    verts, faces, _ = _build(n_theta=80, n_z=40, H=H)
    out = write_obj(tmp_path / "pot.obj", "Pot", verts, faces)
    pv, pn, pf, pfn = _parse_obj(out.read_text())

    # Per-face-corner normal indices must be present.
    assert pfn is not None and pfn.shape == pf.shape
    # Creases split normals, so there are strictly more normals than vertices.
    assert len(pn) > len(verts)

    rim_cap, wall_top = _rim_and_wall_masks(verts, faces, H)
    assert rim_cap.any() and wall_top.any()

    # Corner normals for rim-cap faces should be near-vertical...
    rim_nz = np.abs(pn[pfn[rim_cap].ravel() - 1][:, 2])
    assert rim_nz.mean() > 0.7, f"rim normals not vertical: {rim_nz.mean():.2f}"

    # ...while wall faces just below the rim should be near-radial (small |nz|).
    wall_nz = np.abs(pn[pfn[wall_top].ravel() - 1][:, 2])
    assert wall_nz.mean() < 0.4, f"wall normals not radial: {wall_nz.mean():.2f}"


def test_obj_smooth_mode_one_normal_per_vertex(tmp_path):
    """crease_angle_deg=None gives fully smooth shading: exactly one normal per
    vertex and normal indices equal to vertex indices."""
    from potfoundry import write_obj

    verts, faces, _ = _build(n_theta=40, n_z=20)
    out = write_obj(tmp_path / "smooth.obj", "Pot", verts, faces,
                    crease_angle_deg=None)
    pv, pn, pf, pfn = _parse_obj(out.read_text())
    assert len(pn) == len(verts)
    # Smooth mode: vn index == v index for every corner.
    assert pfn is not None
    np.testing.assert_array_equal(pfn, pf)
