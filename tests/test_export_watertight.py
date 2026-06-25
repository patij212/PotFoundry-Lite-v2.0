"""Position-welded watertightness stress test (CAD import fidelity).

STL is a *triangle soup*: it stores raw coordinates with no shared-vertex
information. When a CAD tool such as Rhino or Grasshopper imports an STL it
re-welds vertices by position. A mesh that looks closed in index space can
still import with **naked edges** (an open surface, not a solid) if welding
exposes a gap, or with **non-manifold edges** if three or more faces meet an
edge.

This module verifies, over a broad grid of styles and parameters (including
thick walls, large drains and extreme flares), that after welding by position
each generated mesh is:

* **closed** — no naked edges (every edge shared by exactly two faces),
* **manifold** — no edge shared by more than two faces,
* **non-degenerate** — no triangle collapses to an edge after welding,
* **outward-oriented** — strictly positive signed volume.

The checks are fully vectorised so the full grid runs quickly.
"""
from __future__ import annotations

import numpy as np
import pytest

from potfoundry import build_pot_mesh, signed_volume, STYLES

STYLE_NAMES = list(STYLES.keys())


def weld_and_check(verts: np.ndarray, faces: np.ndarray, decimals: int = 5):
    """Weld vertices by rounded position and report manifold defects.

    Returns:
        (naked_edges, nonmanifold_edges, degenerate_faces) counts.
    """
    # Weld coincident vertices the way an STL importer would.
    _, inv = np.unique(np.round(verts, decimals), axis=0, return_inverse=True)
    wf = inv[faces]

    # Degenerate triangles: two welded corners coincide.
    degenerate = int(
        np.count_nonzero(
            (wf[:, 0] == wf[:, 1]) | (wf[:, 1] == wf[:, 2]) | (wf[:, 0] == wf[:, 2])
        )
    )

    # Undirected edges, sorted per row so (a,b) and (b,a) collapse.
    e = np.concatenate([wf[:, [0, 1]], wf[:, [1, 2]], wf[:, [2, 0]]], axis=0)
    e.sort(axis=1)
    _, counts = np.unique(e, axis=0, return_counts=True)
    naked = int(np.count_nonzero(counts == 1))
    nonmanifold = int(np.count_nonzero(counts > 2))
    return naked, nonmanifold, degenerate


# A grid spanning short/tall, wide/narrow, thin/thick walls, small/large drains
# and concave/convex flares. Combinations that violate the builder's own size
# preconditions (drain too large for the base) are skipped.
HEIGHTS = [60, 200]
SHAPES = [(70, 50), (40, 60), (90, 30)]
WALLS = [2.0, 6.0]
DRAINS = [5, 28]
EXPNS = [0.7, 1.6]


def _valid(Rb, t_wall, r_drain):
    return 0 < r_drain < (Rb - t_wall - 2.0)


@pytest.mark.parametrize("style_name", STYLE_NAMES)
def test_welded_mesh_is_a_closed_solid(style_name):
    """Across the parameter grid, every welded mesh is a closed, outward solid."""
    style_fn = STYLES[style_name][0]
    tested = 0
    for H in HEIGHTS:
        for Rt, Rb in SHAPES:
            for t_wall in WALLS:
                for r_drain in DRAINS:
                    if not _valid(Rb, t_wall, r_drain):
                        continue
                    for expn in EXPNS:
                        verts, faces, _ = build_pot_mesh(
                            H=H, Rt=Rt, Rb=Rb, t_wall=t_wall, t_bottom=3,
                            r_drain=r_drain, expn=expn, n_theta=48, n_z=24,
                            r_outer_fn=style_fn, style_opts={},
                        )
                        naked, nonman, degen = weld_and_check(verts, faces)
                        ctx = (
                            f"{style_name} H={H} Rt={Rt} Rb={Rb} t_wall={t_wall} "
                            f"r_drain={r_drain} expn={expn}"
                        )
                        assert naked == 0, f"{ctx}: {naked} naked edges (open surface)"
                        assert nonman == 0, f"{ctx}: {nonman} non-manifold edges"
                        assert degen == 0, f"{ctx}: {degen} degenerate faces after weld"
                        assert signed_volume(verts, faces) > 0, f"{ctx}: inverted normals"
                        tested += 1
    assert tested >= 8, "stress grid unexpectedly small"
