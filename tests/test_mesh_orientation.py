"""Mesh orientation tests — export quality for Rhino / Grasshopper.

Rhino, Grasshopper and most NURBS/CAD pipelines only recognise a mesh as a
*solid* when it is a consistently-oriented, watertight manifold whose face
normals all point **outward**. Such a mesh has:

  * Zero orientation defects — every interior edge is shared by exactly two
    faces that traverse it in opposite directions (a coherently oriented
    manifold), and
  * A positive signed volume — the global winding points outward, so the
    divergence-theorem volume is positive.

A mesh can be perfectly watertight (every edge shared by two faces) yet still
be unusable in Rhino because individual regions disagree on winding, or because
the whole solid is wound inside-out. These tests pin that property down for the
generated pot mesh across every style.

Run with: PYTHONPATH=. pytest tests/test_mesh_orientation.py -v
"""
from __future__ import annotations

from collections import Counter

import numpy as np
import pytest

from potfoundry import build_pot_mesh, STYLES


def signed_volume(verts: np.ndarray, faces: np.ndarray) -> float:
    """Signed volume via the divergence theorem (sum of tetra volumes).

    Positive when faces are wound counter-clockwise as seen from outside
    (outward normals); negative when the mesh is wound inside-out.
    """
    v0 = verts[faces[:, 0]]
    v1 = verts[faces[:, 1]]
    v2 = verts[faces[:, 2]]
    return float(np.sum(np.einsum("ij,ij->i", v0, np.cross(v1, v2))) / 6.0)


def orientation_defects(faces: np.ndarray) -> int:
    """Count interior edges whose two faces are wound inconsistently.

    In a coherently oriented manifold each undirected edge appears exactly
    once in each direction. An edge that appears twice in the *same* direction
    means its two faces disagree on winding -> an orientation defect.
    """
    directed: Counter = Counter()
    for face in faces:
        for i in range(3):
            directed[(int(face[i]), int(face[(i + 1) % 3]))] += 1
    return sum(1 for c in directed.values() if c != 1)


# Representative parameter set kept small for speed while still exercising the
# drain / rim / wall junctions that historically disagreed on winding.
_COMMON = dict(
    H=120.0, Rt=70.0, Rb=50.0, t_wall=3.0, t_bottom=3.0, r_drain=10.0,
    expn=1.1, n_theta=80, n_z=40,
)


@pytest.mark.parametrize("style_name", list(STYLES.keys()))
def test_mesh_is_consistently_oriented(style_name: str) -> None:
    """Every style must produce a coherently oriented manifold (no defects)."""
    style_fn = STYLES[style_name][0]
    verts, faces, _ = build_pot_mesh(r_outer_fn=style_fn, style_opts={}, **_COMMON)

    defects = orientation_defects(faces)
    assert defects == 0, (
        f"{style_name}: {defects} edges have inconsistently wound neighbours; "
        "Rhino/Grasshopper will report flipped/naked normals."
    )


@pytest.mark.parametrize("style_name", list(STYLES.keys()))
def test_mesh_normals_point_outward(style_name: str) -> None:
    """Every style must be wound outward (positive signed volume)."""
    style_fn = STYLES[style_name][0]
    verts, faces, _ = build_pot_mesh(r_outer_fn=style_fn, style_opts={}, **_COMMON)

    vol = signed_volume(verts, faces)
    assert vol > 0.0, (
        f"{style_name}: signed volume {vol:.1f} mm^3 is not positive; the solid "
        "is wound inside-out and imports as an inverted solid."
    )


def test_outer_and_inner_wall_normals_have_correct_sign() -> None:
    """Outer-wall normals point away from the axis; inner-wall normals toward it.

    A correctly oriented hollow solid has *both* surfaces correct: the outer
    wall faces outward and the inner (cavity) wall faces inward. To separate the
    two surfaces unambiguously we use a plain surface of revolution (no petals),
    so within a thin height band the outer and inner radii differ cleanly by
    ``t_wall`` and can be split by a midpoint threshold.
    """
    # Plain cone profile: outer radius is exactly r0, no angular modulation.
    plain = lambda theta, z, r0, H, opts: np.full_like(np.asarray(theta, float), r0)  # noqa: E731

    verts, faces, _ = build_pot_mesh(r_outer_fn=plain, style_opts={}, **_COMMON)

    v0 = verts[faces[:, 0]]
    v1 = verts[faces[:, 1]]
    v2 = verts[faces[:, 2]]
    normals = np.cross(v1 - v0, v2 - v0)
    centers = (v0 + v1 + v2) / 3.0
    radius = np.hypot(centers[:, 0], centers[:, 1])

    # Thin mid-height band so outer (~r0) and inner (~r0 - t_wall) are separable.
    band = (centers[:, 2] > 58) & (centers[:, 2] < 62)
    band_radii = radius[band]
    assert band_radii.size > 0, "no faces in mid-height band"
    split = 0.5 * (band_radii.min() + band_radii.max())

    radial = centers.copy()
    radial[:, 2] = 0.0
    dot = np.einsum("ij,ij->i", normals[:, :2], radial[:, :2])

    outer = band & (radius > split)
    inner = band & (radius < split)

    outer_outward = float(np.mean(dot[outer] > 0))
    inner_inward = float(np.mean(dot[inner] < 0))

    assert outer_outward > 0.99, (
        f"Only {outer_outward:.1%} of outer-wall faces point outward."
    )
    assert inner_inward > 0.99, (
        f"Only {inner_inward:.1%} of inner-wall faces point inward (into cavity)."
    )
