"""Mesh orientation tests — export quality for Rhino/Grasshopper/slicers.

A closed, watertight solid must have *outward*-facing face normals with a
consistent (counter-clockwise-from-outside) winding. CAD tools such as
Rhino/Grasshopper and 3D-printing slicers rely on this convention to tell
"inside" from "outside". A mesh whose triangles are wound the wrong way
appears inside-out: boolean operations, thickening, and solid detection
fail or silently produce garbage.

The robust, orientation-only invariant is the signed volume computed via the
divergence theorem:

    V = (1/6) * Σ_faces  v0 · (v1 × v2)

For a closed manifold wound CCW-from-outside this is strictly positive and
equals the enclosed volume. A negative value means every face is wound the
wrong way (normals point inward).
"""
from __future__ import annotations

import numpy as np
import pytest

from potfoundry import build_pot_mesh, STYLES


def signed_volume(verts: np.ndarray, faces: np.ndarray) -> float:
    """Signed volume of a triangle mesh (positive iff outward-wound)."""
    v0 = verts[faces[:, 0]]
    v1 = verts[faces[:, 1]]
    v2 = verts[faces[:, 2]]
    return float(np.einsum("ij,ij->i", v0, np.cross(v1, v2)).sum() / 6.0)


COMMON = dict(
    H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
    expn=1.1, n_theta=96, n_z=48,
)


@pytest.mark.parametrize("style_name", list(STYLES.keys()))
def test_mesh_is_outward_oriented(style_name):
    """Every style must produce an outward-oriented (positive volume) solid."""
    style_fn = STYLES[style_name][0]
    verts, faces, _ = build_pot_mesh(r_outer_fn=style_fn, style_opts={}, **COMMON)

    vol = signed_volume(verts, faces)
    assert vol > 0, (
        f"{style_name}: signed volume {vol:.1f} <= 0 — face winding is "
        f"inverted (normals point inward), mesh is inside-out for export"
    )


# A straight, thick-walled cylinder: outer radius == 70 everywhere, inner
# radius == 60 everywhere. This gives the outer wall (~70) and inner wall
# (~60) non-overlapping radius bands so a radial normal test is unambiguous.
CYLINDER = dict(
    H=120, Rt=70, Rb=70, t_wall=10, t_bottom=5, r_drain=10,
    expn=1.0, n_theta=96, n_z=48,
)
# Flat circular profile: disable all SuperellipseMorph modulation.
CYLINDER_OPTS = {
    "se_m_base": 2.0, "se_m_top": 2.0, "se_c4_amp": 0.0, "se_c8_amp": 0.0,
}


def _wall_normals(centers, normals, lo, hi):
    """(radial_dot, mask) for wall faces whose center radius is in [lo, hi]."""
    rad = np.hypot(centers[:, 0], centers[:, 1])
    mask = (centers[:, 2] > 15) & (centers[:, 2] < 105) & (rad > lo) & (rad < hi)
    radial_unit = centers[:, :2] / (rad[:, None] + 1e-12)
    dot = np.einsum("ij,ij->i", normals[:, :2], radial_unit)
    return dot, mask


def test_outer_wall_normals_point_outward():
    """Outer-wall normals must point away from the Z axis (radially outward)."""
    style_fn = STYLES["SuperellipseMorph"][0]
    verts, faces, _ = build_pot_mesh(
        r_outer_fn=style_fn, style_opts=CYLINDER_OPTS, **CYLINDER
    )
    v0, v1, v2 = verts[faces[:, 0]], verts[faces[:, 1]], verts[faces[:, 2]]
    normals = np.cross(v1 - v0, v2 - v0)
    centers = (v0 + v1 + v2) / 3.0

    dot, outer_wall = _wall_normals(centers, normals, 65.0, 75.0)
    assert outer_wall.sum() > 100, "expected to find outer-wall faces"
    frac_outward = float((dot[outer_wall] > 0).mean())
    assert frac_outward > 0.99, (
        f"only {frac_outward:.1%} of outer-wall normals point outward"
    )


def test_inner_wall_normals_point_into_cavity():
    """Cavity (inner wall) normals must point toward the Z axis — i.e. away
    from the solid material and into the empty cavity."""
    style_fn = STYLES["SuperellipseMorph"][0]
    verts, faces, _ = build_pot_mesh(
        r_outer_fn=style_fn, style_opts=CYLINDER_OPTS, **CYLINDER
    )
    v0, v1, v2 = verts[faces[:, 0]], verts[faces[:, 1]], verts[faces[:, 2]]
    normals = np.cross(v1 - v0, v2 - v0)
    centers = (v0 + v1 + v2) / 3.0

    dot, inner_wall = _wall_normals(centers, normals, 55.0, 65.0)
    assert inner_wall.sum() > 100, "expected to find inner-wall faces"
    frac_inward = float((dot[inner_wall] < 0).mean())
    assert frac_inward > 0.99, (
        f"only {frac_inward:.1%} of inner-wall normals point into the cavity"
    )
