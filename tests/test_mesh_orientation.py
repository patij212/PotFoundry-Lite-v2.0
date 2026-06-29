"""Mesh orientation regression tests (Rhino/Grasshopper export quality).

A mesh imports cleanly into Rhino/Grasshopper only when its faces are
*coherently oriented* with normals pointing **outward** (away from the solid
material). Two properties capture this:

1. **Coherent orientation** — every directed (half-)edge appears exactly once.
   Equivalently, each shared edge is traversed in opposite directions by its two
   adjacent faces. A watertight mesh can still fail this if some regions are
   wound the opposite way to their neighbours; Rhino then reports clashing
   normals and renders surfaces inside-out until "Unify Normals" is run.

2. **Outward normals** — the signed volume (divergence theorem) is positive.
   A negative signed volume means the surface is inverted (normals point into
   the solid), which makes boolean operations and offsets fail in Rhino.

These tests pin both properties for every style and a range of parameters so
the procedural mesh is born Rhino-clean, with no manual healing required.
"""
from __future__ import annotations

from collections import Counter

import numpy as np
import pytest

from potfoundry import build_pot_mesh, STYLES


def _signed_volume(verts: np.ndarray, faces: np.ndarray) -> float:
    """Signed volume via the divergence theorem.

    Positive when faces are wound counter-clockwise as seen from outside
    (i.e. normals point outward).
    """
    a = verts[faces[:, 0]]
    b = verts[faces[:, 1]]
    c = verts[faces[:, 2]]
    return float(np.sum(np.einsum("ij,ij->i", a, np.cross(b, c))) / 6.0)


def _directed_edge_counts(faces: np.ndarray) -> Counter:
    counts: Counter = Counter()
    for tri in faces:
        a, b, c = int(tri[0]), int(tri[1]), int(tri[2])
        counts[(a, b)] += 1
        counts[(b, c)] += 1
        counts[(c, a)] += 1
    return counts


_PARAM_SETS = [
    dict(H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10, expn=1.1),
    dict(H=100, Rt=60, Rb=40, t_wall=3, t_bottom=3, r_drain=8, expn=1.1),
    dict(H=80, Rt=45, Rb=55, t_wall=4, t_bottom=5, r_drain=6, expn=0.8),
]


@pytest.mark.parametrize("style_name", list(STYLES.keys()))
@pytest.mark.parametrize("params", _PARAM_SETS)
def test_signed_volume_positive(style_name, params):
    """Normals must point outward (positive signed volume) for Rhino import."""
    style_fn = STYLES[style_name][0]
    verts, faces, _ = build_pot_mesh(
        n_theta=80, n_z=40, r_outer_fn=style_fn, style_opts={}, **params
    )
    vol = _signed_volume(verts, faces)
    assert vol > 0, (
        f"{style_name}: signed volume {vol:.1f} <= 0 — mesh normals are inverted "
        f"(would import inside-out in Rhino/Grasshopper)"
    )


@pytest.mark.parametrize("style_name", list(STYLES.keys()))
@pytest.mark.parametrize("params", _PARAM_SETS)
def test_orientation_is_coherent(style_name, params):
    """Every directed edge must appear exactly once (consistent winding)."""
    style_fn = STYLES[style_name][0]
    verts, faces, _ = build_pot_mesh(
        n_theta=80, n_z=40, r_outer_fn=style_fn, style_opts={}, **params
    )
    counts = _directed_edge_counts(faces)

    # Same directed edge used by two faces => those faces wind the same way.
    same_dir = [e for e, c in counts.items() if c > 1]
    # An edge whose reverse is absent => its two faces are inconsistently wound.
    missing_reverse = [e for e in counts if (e[1], e[0]) not in counts]

    assert not same_dir and not missing_reverse, (
        f"{style_name}: {len(same_dir)} same-direction edges and "
        f"{len(missing_reverse)} edges missing their reverse — orientation is "
        f"incoherent (Rhino would report clashing normals)"
    )
