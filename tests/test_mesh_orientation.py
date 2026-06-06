"""Mesh orientation / export-validity tests.

These tests pin the requirements that make a mesh a *valid closed solid* when
imported into CAD/parametric tools such as Rhino and Grasshopper (and slicers):

1. Consistent orientation — every interior edge is shared by exactly two faces
   that traverse it in *opposite* directions. A directed half-edge that has no
   opposite twin means two adjacent faces disagree on winding (a "flipped
   face"), which Rhino reports as a non-orientable / invalid mesh.

2. Outward normals — the closed mesh must enclose a *positive* signed volume.
   A negative signed volume means the whole solid is wound inside-out, so every
   face normal points into the material instead of away from it.

These are stronger than the index-based watertightness check in
``test_golden_meshes.py`` (which only counts undirected edge multiplicity and
is satisfied by any structured grid regardless of orientation).

Run with: PYTHONPATH=. pytest tests/test_mesh_orientation.py -v
"""
from __future__ import annotations

from collections import Counter

import numpy as np
import pytest

from potfoundry import STYLES, build_pot_mesh


def _signed_volume(verts: np.ndarray, faces: np.ndarray) -> float:
    """Signed volume of a triangle soup via the divergence theorem.

    Positive when face normals (right-hand rule over winding) point outward.
    """
    v0 = verts[faces[:, 0]]
    v1 = verts[faces[:, 1]]
    v2 = verts[faces[:, 2]]
    return float(np.einsum("ij,ij->i", v0, np.cross(v1, v2)).sum() / 6.0)


def _inconsistent_directed_edges(faces: np.ndarray) -> int:
    """Count directed half-edges whose opposite-direction twin is missing.

    Zero means the mesh is consistently oriented (a coherent manifold).
    """
    he: Counter = Counter()
    for f in faces:
        a, b, c = int(f[0]), int(f[1]), int(f[2])
        for x, y in ((a, b), (b, c), (c, a)):
            he[(x, y)] += 1
    bad = 0
    for (x, y), n in he.items():
        # a directed edge should appear once, and its reverse exactly once
        if n != 1 or he.get((y, x), 0) != 1:
            bad += 1
    return bad


_PARAMS = dict(
    H=100, Rt=60, Rb=40, t_wall=3, t_bottom=3, r_drain=8,
    expn=1.1, n_theta=120, n_z=60,
)


@pytest.mark.parametrize("style_name", list(STYLES))
def test_mesh_is_consistently_oriented(style_name):
    style_fn = STYLES[style_name][0]
    _verts, faces, _ = build_pot_mesh(r_outer_fn=style_fn, style_opts={}, **_PARAMS)
    bad = _inconsistent_directed_edges(faces)
    assert bad == 0, (
        f"{style_name}: {bad} directed half-edges have no opposite twin "
        f"(adjacent faces disagree on winding -> flipped faces)"
    )


@pytest.mark.parametrize("style_name", list(STYLES))
def test_mesh_normals_point_outward(style_name):
    style_fn = STYLES[style_name][0]
    verts, faces, _ = build_pot_mesh(r_outer_fn=style_fn, style_opts={}, **_PARAMS)
    sv = _signed_volume(verts, faces)
    assert sv > 0, (
        f"{style_name}: signed volume {sv:.1f} <= 0 -> mesh is wound "
        f"inside-out (normals point inward)"
    )


def test_outer_wall_faces_point_away_from_axis():
    """The exterior wall must have normals pointing away from the Z axis."""
    style_fn = STYLES["FourierBloom"][0]
    n_theta, n_z = _PARAMS["n_theta"], _PARAMS["n_z"]
    verts, faces, _ = build_pot_mesh(r_outer_fn=style_fn, style_opts={}, **_PARAMS)

    # The first (n_z+1)*n_theta vertices are the outer-wall rings.
    n_outer_v = (n_z + 1) * n_theta
    outer = np.all(faces < n_outer_v, axis=1)

    v0, v1, v2 = verts[faces[:, 0]], verts[faces[:, 1]], verts[faces[:, 2]]
    normals = np.cross(v1 - v0, v2 - v0)
    centroids = (v0 + v1 + v2) / 3.0

    # Restrict to mid-height pure-outer-wall faces (avoid bottom/rim joints).
    zc = centroids[:, 2]
    mid = outer & (zc > 20) & (zc < 80)
    assert mid.sum() > 0

    radial_dot = np.einsum("ij,ij->i", normals[mid][:, :2], centroids[mid][:, :2])
    frac_outward = float((radial_dot > 0).mean())
    assert frac_outward > 0.99, (
        f"Only {frac_outward:.1%} of outer-wall faces point outward; "
        f"exterior normals are inverted"
    )
