"""Tests for the reusable mesh-validation module.

``potfoundry.core.mesh_validate.validate_mesh`` consolidates the export-quality
invariants (watertight, consistently oriented, outward normals, non-degenerate)
into a single fast, dependency-free report the exporter/app can gate on.
"""
from __future__ import annotations

import numpy as np
import pytest

from potfoundry import STYLES, build_pot_mesh
from potfoundry.core.mesh_validate import validate_mesh


def _pot(style="FourierBloom", **kw):
    p = dict(H=100, Rt=60, Rb=40, t_wall=3, t_bottom=3, r_drain=8,
             expn=1.1, n_theta=96, n_z=48)
    p.update(kw)
    return build_pot_mesh(r_outer_fn=STYLES[style][0], style_opts={}, **p)


@pytest.mark.parametrize("style_name", list(STYLES))
def test_generated_pot_is_export_ready(style_name):
    verts, faces, _ = _pot(style_name)
    report = validate_mesh(verts, faces)
    assert report.is_export_ready, report
    assert report.is_watertight
    assert report.is_oriented
    assert report.is_outward
    assert report.n_boundary_edges == 0
    assert report.n_nonmanifold_edges == 0
    assert report.n_inconsistent_edges == 0
    assert report.n_degenerate_faces == 0
    assert report.signed_volume > 0
    assert report.n_faces == len(faces)
    assert report.n_vertices == len(verts)


def test_detects_inverted_mesh():
    """A globally flipped mesh is watertight but not outward-oriented."""
    verts, faces, _ = _pot()
    flipped = faces[:, ::-1].copy()
    report = validate_mesh(verts, flipped)
    assert report.is_watertight
    assert report.is_oriented        # still mutually consistent...
    assert not report.is_outward     # ...but inside-out
    assert report.signed_volume < 0
    assert not report.is_export_ready


def test_detects_boundary_edge_hole():
    """Removing a face opens boundary edges -> not watertight, not export-ready."""
    verts, faces, _ = _pot()
    holed = faces[1:].copy()  # drop one triangle
    report = validate_mesh(verts, holed)
    assert not report.is_watertight
    assert report.n_boundary_edges > 0
    assert not report.is_export_ready


def test_detects_inconsistent_winding():
    """Flipping a single interior face creates a non-orientable seam."""
    verts, faces, _ = _pot()
    bad = faces.copy()
    bad[0] = bad[0][::-1]
    report = validate_mesh(verts, bad)
    assert report.n_inconsistent_edges > 0
    assert not report.is_oriented
    assert not report.is_export_ready


def test_detects_degenerate_face():
    """A face with two identical vertex indices is degenerate (zero area)."""
    verts, faces, _ = _pot()
    bad = faces.copy()
    bad[0] = np.array([bad[0][0], bad[0][0], bad[0][1]])
    report = validate_mesh(verts, bad)
    assert report.n_degenerate_faces >= 1
    assert not report.is_export_ready
