"""Mesh orientation correctness tests (Rhino / Grasshopper export quality).

A mesh that is topologically watertight can still import badly into CAD tools
like Rhino or Grasshopper if its *face winding* is wrong:

1. **Global inversion** — if every normal points into the solid instead of out
   of it, the model imports "inside-out": shading is wrong, Boolean operations
   fail, and the user must manually run "Flip Normals".

2. **Inconsistent winding** — if some face groups disagree on orientation,
   even Rhino's "Unify Normals" cannot fully repair the surface, leaving
   visible artifacts and unreliable solids.

These tests assert the two invariants that guarantee a clean CAD import:

* The mesh is *consistently oriented* — every interior directed edge ``(a, b)``
  is matched by exactly one opposite directed edge ``(b, a)``. This is the
  manifold orientation condition.
* The mesh normals point *outward* — the divergence-theorem signed volume is
  strictly positive and equals the enclosed solid volume.
"""
from __future__ import annotations

from collections import Counter

import numpy as np
import pytest

from potfoundry import build_pot_mesh, STYLES

STYLE_NAMES = list(STYLES.keys())


def signed_volume(verts: np.ndarray, faces: np.ndarray) -> float:
    """Divergence-theorem signed volume.

    For a closed mesh with consistently *outward* normals this equals the
    positive enclosed volume; a globally inverted mesh yields its negative.
    """
    v0 = verts[faces[:, 0]]
    v1 = verts[faces[:, 1]]
    v2 = verts[faces[:, 2]]
    return float(np.sum(np.einsum("ij,ij->i", v0, np.cross(v1, v2))) / 6.0)


def count_winding_inconsistencies(faces: np.ndarray) -> int:
    """Count directed edges whose opposite is not matched one-for-one.

    Zero means the mesh is consistently oriented (a valid manifold orientation).
    """
    directed: Counter = Counter()
    for tri in faces:
        a, b, c = int(tri[0]), int(tri[1]), int(tri[2])
        directed[(a, b)] += 1
        directed[(b, c)] += 1
        directed[(c, a)] += 1
    bad = 0
    for (a, b), n in directed.items():
        if directed.get((b, a), 0) != n:
            bad += 1
    return bad


# A spread of parameter sets, including deep-clamp / large-drain cases that
# stress the bottom-slab and drain-cylinder seams.
PARAM_SETS = [
    dict(H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10, expn=1.1, n_theta=168, n_z=84),
    dict(H=100, Rt=60, Rb=40, t_wall=3, t_bottom=3, r_drain=12, expn=1.1, n_theta=120, n_z=60),
    dict(H=150, Rt=40, Rb=35, t_wall=3, t_bottom=3, r_drain=25, expn=0.8, n_theta=96, n_z=48),
]


@pytest.mark.parametrize("style_name", STYLE_NAMES)
@pytest.mark.parametrize("params", PARAM_SETS)
def test_mesh_is_consistently_oriented(style_name, params):
    """Every interior edge is traversed once in each direction (no winding flips)."""
    style_fn = STYLES[style_name][0]
    verts, faces, _ = build_pot_mesh(r_outer_fn=style_fn, style_opts={}, **params)

    bad = count_winding_inconsistencies(faces)
    assert bad == 0, (
        f"{style_name}: {bad} inconsistently-wound directed edges; "
        "mesh is not a valid manifold orientation"
    )


@pytest.mark.parametrize("style_name", STYLE_NAMES)
@pytest.mark.parametrize("params", PARAM_SETS)
def test_mesh_normals_point_outward(style_name, params):
    """Signed volume is strictly positive => normals point out of the solid."""
    style_fn = STYLES[style_name][0]
    verts, faces, _ = build_pot_mesh(r_outer_fn=style_fn, style_opts={}, **params)

    vol = signed_volume(verts, faces)
    assert vol > 0.0, (
        f"{style_name}: signed volume {vol:.1f} <= 0; mesh normals are inverted "
        "(imports inside-out in Rhino/Grasshopper)"
    )


@pytest.mark.parametrize("style_name", STYLE_NAMES)
def test_outermost_face_points_outward(style_name):
    """The outermost mid-height face must have an outward-pointing normal.

    Per-face counterpart to the global signed-volume check. The face with the
    largest centroid radius sits at a locally-convex point of the outer wall
    (a petal tip, a ridge crest, or a plain wall) where the surface
    unambiguously faces away from the axis — so its normal's radial component
    must be positive for *any* style. A negative value means inverted winding.
    """
    style_fn = STYLES[style_name][0]
    verts, faces, _ = build_pot_mesh(
        H=100, Rt=60, Rb=40, t_wall=3, t_bottom=3, r_drain=8,
        expn=1.1, n_theta=96, n_z=48, r_outer_fn=style_fn, style_opts={},
    )

    v0 = verts[faces[:, 0]]
    v1 = verts[faces[:, 1]]
    v2 = verts[faces[:, 2]]
    normals = np.cross(v1 - v0, v2 - v0)
    centers = (v0 + v1 + v2) / 3.0
    radius = np.hypot(centers[:, 0], centers[:, 1])

    mid = (centers[:, 2] > 20) & (centers[:, 2] < 80)
    masked_radius = np.where(mid, radius, -np.inf)
    fi = int(np.argmax(masked_radius))

    radial_unit = centers[fi, :2] / np.linalg.norm(centers[fi, :2])
    radial_component = float(np.dot(normals[fi, :2], radial_unit))
    assert radial_component > 0, (
        f"{style_name}: outermost face normal points inward "
        f"(radial component {radial_component:.2f}); winding is inverted"
    )
