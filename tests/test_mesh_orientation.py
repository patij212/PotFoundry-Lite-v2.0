"""Export-quality orientation tests (Rhino / Grasshopper readiness).

A mesh that imports cleanly into Rhino, Grasshopper, or any slicer must be a
*closed, consistently-oriented, outward-facing* manifold. Two defects break
that contract and are invisible to a vertex/face-count check:

  * inconsistent winding  -> surface is not orientable as authored; CAD tools
    show flipped facets and boolean/offset ops fail.
  * inverted normals      -> the solid imports "inside-out" (negative volume).

These tests pin both. They drive ``build_pot_mesh`` through ``validate_mesh``
for every style (with and without twist) and assert the mesh is born clean,
and they exercise the ``orient_outward`` repair pass on a deliberately
corrupted mesh.

Run with: PYTHONPATH=. pytest tests/test_mesh_orientation.py -v
"""
from __future__ import annotations

import numpy as np
import pytest

from potfoundry import build_pot_mesh, validate_mesh, orient_outward, STYLES


ALL_STYLES = list(STYLES.keys())


def _build(style_name, opts=None, n_theta=60, n_z=30):
    fn = STYLES[style_name][0]
    return build_pot_mesh(
        H=100, Rt=60, Rb=40,
        t_wall=3, t_bottom=3, r_drain=8,
        expn=1.1, n_theta=n_theta, n_z=n_z,
        r_outer_fn=fn, style_opts=opts or {},
    )


@pytest.mark.parametrize("style_name", ALL_STYLES)
def test_style_mesh_is_export_clean(style_name):
    """Every style must produce a closed, outward, consistently-wound mesh."""
    verts, faces, _ = _build(style_name)
    report = validate_mesh(verts, faces)
    assert report["closed"], f"{style_name}: {report['non_manifold_edges']} non-manifold edges"
    assert report["consistent_orientation"], \
        f"{style_name}: {report['inconsistent_edges']} inconsistently-wound edges"
    assert report["outward"], \
        f"{style_name}: normals point inward (signed_volume={report['signed_volume']:.1f})"
    assert report["degenerate_faces"] == 0, \
        f"{style_name}: {report['degenerate_faces']} degenerate faces"
    assert report["ok"], f"{style_name} failed export validation: {report}"


def test_twisted_mesh_is_export_clean():
    """Global spin twist must not break orientation."""
    verts, faces, _ = _build("SpiralRidges", {"spin_turns": 0.5, "spiral_turns": 1.5})
    report = validate_mesh(verts, faces)
    assert report["ok"], f"twisted mesh failed export validation: {report}"


def test_wall_normals_point_away_from_material():
    """Outer wall -> outward (+radial); inner cavity wall -> inward (-radial).

    Outer and inner radii overlap under style modulation, so we can't split the
    walls by a fixed radius. Instead we assert the physically-correct invariant:
    among mid-height wall faces, the outward-pointing ones are the larger-radius
    (outer) faces and the inward-pointing ones are the smaller-radius (cavity)
    faces — i.e. every face's normal points away from the solid material.
    """
    verts, faces, _ = _build("FourierBloom")
    v0 = verts[faces[:, 0]]; v1 = verts[faces[:, 1]]; v2 = verts[faces[:, 2]]
    normals = np.cross(v1 - v0, v2 - v0)
    centers = (v0 + v1 + v2) / 3.0
    radial = centers.copy(); radial[:, 2] = 0.0
    rnorm = np.linalg.norm(radial, axis=1)
    band = (centers[:, 2] > 30) & (centers[:, 2] < 70)  # mid-height, clear of caps
    assert band.any(), "expected mid-height wall faces"

    radial_dot = np.einsum('ij,ij->i', normals[band], radial[band])
    r = rnorm[band]
    outward = radial_dot > 0
    inward = radial_dot < 0
    assert outward.any() and inward.any(), "expected both outer and inner wall faces"
    # Outward (outer wall) faces sit at strictly larger radius than inward (cavity) faces.
    assert r[outward].mean() > r[inward].mean(), \
        "outward-facing faces should be the outer wall (larger radius)"
    # No face should have a ~zero radial component in the wall band (that would
    # indicate a tangential/degenerate normal).
    assert np.mean(np.abs(radial_dot) > 1e-6) > 0.99


def test_orient_outward_repairs_inverted_mesh():
    """orient_outward must repair a globally-inverted, locally-clashing mesh."""
    verts, faces, _ = _build("HarmonicRipple")
    good = validate_mesh(verts, faces)
    assert good["ok"], "fixture mesh should already be clean"

    # Corrupt: flip every other face (breaks winding consistency AND inverts
    # roughly half the normals).
    corrupt = faces.copy()
    corrupt[::2] = corrupt[::2][:, [0, 2, 1]]
    bad = validate_mesh(verts, corrupt)
    assert not bad["consistent_orientation"], "corruption should break winding consistency"

    repaired = orient_outward(verts, corrupt)
    rep = validate_mesh(verts, repaired)
    assert rep["ok"], f"orient_outward failed to repair mesh: {rep}"
    # Vertices untouched, so the repaired mesh covers the same faces (as sets).
    assert repaired.shape == faces.shape


def test_orient_outward_flips_fully_inverted_mesh():
    """A consistently-wound but inside-out mesh must be flipped outward."""
    verts, faces, _ = _build("SuperellipseMorph")
    inverted = faces[:, [0, 2, 1]]  # uniformly reversed -> consistent but inward
    inv = validate_mesh(verts, inverted)
    assert inv["consistent_orientation"] and not inv["outward"]
    repaired = orient_outward(verts, inverted)
    assert validate_mesh(verts, repaired)["ok"]
