"""Tests for the reusable mesh export-quality report.

mesh_quality_report() turns the properties a CAD tool (Rhino/Grasshopper) or a
slicer cares about into a single, fast, vectorized report so the pipeline and UI
can state "export-ready" instead of guessing. It must agree with a slow,
obviously-correct reference on real pot meshes, and it must correctly flag known
bad meshes (open, non-manifold, inside-out).
"""
from __future__ import annotations

from collections import Counter

import numpy as np
import pytest

from potfoundry import build_pot_mesh, STYLES, mesh_quality_report


def _reference(verts, faces):
    und = Counter(
        tuple(sorted((int(a), int(b))))
        for f in faces
        for a, b in [(f[i], f[(i + 1) % 3]) for i in range(3)]
    )
    dirc = Counter(
        (int(a), int(b))
        for f in faces
        for a, b in [(f[i], f[(i + 1) % 3]) for i in range(3)]
    )
    v0, v1, v2 = verts[faces[:, 0]], verts[faces[:, 1]], verts[faces[:, 2]]
    areas = 0.5 * np.linalg.norm(np.cross(v1 - v0, v2 - v0), axis=1)
    return {
        "non_manifold_edges": sum(1 for c in und.values() if c != 2),
        "inconsistent_edges": sum(1 for c in dirc.values() if c != 1),
        "degenerate_faces": int(np.count_nonzero(areas < 1e-9)),
    }


@pytest.mark.parametrize("style_name", list(STYLES.keys()))
def test_report_matches_reference_on_real_meshes(style_name):
    fn = STYLES[style_name][0]
    verts, faces, _ = build_pot_mesh(
        H=110, Rt=65, Rb=48, t_wall=3, t_bottom=3, r_drain=9,
        expn=1.1, n_theta=72, n_z=36, r_outer_fn=fn, style_opts={},
    )
    rep = mesh_quality_report(verts, faces)
    ref = _reference(verts, faces)

    assert rep["non_manifold_edges"] == ref["non_manifold_edges"]
    assert rep["inconsistent_edges"] == ref["inconsistent_edges"]
    assert rep["degenerate_faces"] == ref["degenerate_faces"]


def test_real_pot_is_export_ready():
    fn = STYLES["SuperformulaBlossom"][0]
    verts, faces, _ = build_pot_mesh(
        H=110, Rt=65, Rb=48, t_wall=3, t_bottom=3, r_drain=9,
        expn=1.1, n_theta=72, n_z=36, r_outer_fn=fn, style_opts={},
    )
    rep = mesh_quality_report(verts, faces)
    assert rep["watertight"] is True
    assert rep["winding_consistent"] is True
    assert rep["outward"] is True
    assert rep["degenerate_faces"] == 0
    assert rep["export_ready"] is True
    assert rep["signed_volume"] > 0
    assert rep["vertex_count"] == len(verts)
    assert rep["face_count"] == len(faces)


def test_open_mesh_flagged_not_watertight():
    # A single triangle: three boundary (once-used) edges.
    verts = np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0]], dtype=float)
    faces = np.array([[0, 1, 2]], dtype=int)
    rep = mesh_quality_report(verts, faces)
    assert rep["watertight"] is False
    assert rep["non_manifold_edges"] == 3
    assert rep["export_ready"] is False


def test_inconsistent_winding_flagged():
    # Two triangles sharing edge (0,1) wound the SAME way => directed edge (0,1)
    # appears twice; the mesh is non-manifold-open but winding is inconsistent.
    verts = np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]], dtype=float)
    faces = np.array([[0, 1, 2], [0, 1, 3]], dtype=int)
    rep = mesh_quality_report(verts, faces)
    assert rep["winding_consistent"] is False
    assert rep["export_ready"] is False


def test_inside_out_mesh_flagged():
    fn = STYLES["FourierBloom"][0]
    verts, faces, _ = build_pot_mesh(
        H=100, Rt=60, Rb=45, t_wall=3, t_bottom=3, r_drain=8,
        expn=1.1, n_theta=48, n_z=24, r_outer_fn=fn, style_opts={},
    )
    flipped = faces[:, [0, 2, 1]]  # reverse every triangle => inward normals
    rep = mesh_quality_report(verts, flipped)
    assert rep["watertight"] is True
    assert rep["winding_consistent"] is True  # still coherent, just reversed
    assert rep["outward"] is False
    assert rep["export_ready"] is False


def test_degenerate_face_flagged():
    verts = np.array([[0, 0, 0], [1, 0, 0], [2, 0, 0]], dtype=float)  # collinear
    faces = np.array([[0, 1, 2]], dtype=int)
    rep = mesh_quality_report(verts, faces)
    assert rep["degenerate_faces"] == 1
