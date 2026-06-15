"""Mesh orientation tests for Rhino/Grasshopper export quality.

Rhino and Grasshopper rely on consistent, outward-facing mesh normals for
correct shading, ``Mesh.Volume``, capping, and boolean operations. Two failure
modes corrupt an import even when the mesh is "watertight" in the loose sense
that every (undirected) edge is shared by two faces:

  1. Globally inverted winding -> the mesh imports "inside-out" (negative
     enclosed volume, inverted shading).
  2. Locally inconsistent winding at a seam -> shading discontinuities and
     broken solid/boolean operations, because two adjacent faces disagree on
     which side is "out".

These tests assert the two guarantees an orientable closed manifold must meet
for every style:

  * Winding is globally consistent: each *directed* edge appears exactly once,
    and its reverse appears exactly once (every interior edge is traversed in
    opposite directions by its two faces).
  * Normals point outward: the divergence-theorem signed volume is positive.
"""
from __future__ import annotations

from collections import Counter

import numpy as np
import pytest

from potfoundry import build_pot_mesh, STYLES

# Lower resolution keeps the pure-Python edge bookkeeping fast while still
# exercising every construction group (walls, rim, bottom slab, drain).
PARAMS = dict(
    H=100, Rt=60, Rb=40, t_wall=3, t_bottom=3, r_drain=8,
    expn=1.1, n_theta=72, n_z=36,
)


def _signed_volume(verts: np.ndarray, faces: np.ndarray) -> float:
    """Enclosed signed volume via the divergence theorem.

    Positive iff the face winding produces consistently outward normals.
    """
    v0 = verts[faces[:, 0]]
    v1 = verts[faces[:, 1]]
    v2 = verts[faces[:, 2]]
    return float(np.einsum("ij,ij->i", v0, np.cross(v1, v2)).sum() / 6.0)


@pytest.mark.parametrize("style", list(STYLES))
def test_winding_globally_consistent(style):
    fn = STYLES[style][0]
    verts, faces, _ = build_pot_mesh(r_outer_fn=fn, style_opts={}, **PARAMS)

    directed = Counter()
    for a, b, c in faces:
        directed[(a, b)] += 1
        directed[(b, c)] += 1
        directed[(c, a)] += 1

    # Consistent orientation => no directed edge is traversed twice the same way.
    dup = [e for e, n in directed.items() if n != 1]
    assert not dup, (
        f"{style}: {len(dup)} directed edges wound inconsistently "
        f"(mesh is not a consistently-oriented manifold)"
    )

    # Closed manifold => every directed edge has exactly one reverse.
    missing_rev = [e for e in directed if directed.get((e[1], e[0]), 0) != 1]
    assert not missing_rev, (
        f"{style}: {len(missing_rev)} edges lack a single matching reverse "
        f"(mesh is not closed/orientable)"
    )


@pytest.mark.parametrize("style", list(STYLES))
def test_normals_point_outward(style):
    fn = STYLES[style][0]
    verts, faces, _ = build_pot_mesh(r_outer_fn=fn, style_opts={}, **PARAMS)
    vol = _signed_volume(verts, faces)
    assert vol > 0, (
        f"{style}: signed volume {vol:.1f} <= 0 -> mesh imports inside-out "
        f"(normals point inward)"
    )
