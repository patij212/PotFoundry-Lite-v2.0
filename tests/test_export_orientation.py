"""Mesh orientation / export-quality regression tests.

Rhino, Grasshopper and most CAD/slicer toolchains expect an imported solid to
be a *closed, manifold mesh with consistently outward-facing normals*. Two
properties capture this precisely:

1. **Consistent orientation** — across every shared edge, the two adjacent
   faces traverse that edge in *opposite* directions. Equivalently, each
   directed half-edge ``(a, b)`` occurs exactly once in the whole mesh. When
   this fails, Rhino reports "mesh has inconsistent face normals" and boolean
   / shelling / printing operations become unreliable.

2. **Outward orientation** — the signed volume of the closed mesh (via the
   divergence theorem) is positive. A negative signed volume means the solid
   is "inside-out": normals point inward, which slicers interpret as a void.

These tests assert both properties hold for *every* style, with and without
the global twist, so that any future style or geometry change cannot silently
regress export quality.
"""
from __future__ import annotations

from collections import Counter

import numpy as np
import pytest

from potfoundry import build_pot_mesh, STYLES


def _directed_halfedge_counts(faces: np.ndarray) -> Counter:
    """Count occurrences of each directed half-edge ``(a, b)``."""
    he: Counter = Counter()
    for a, b, c in faces:
        for v1, v2 in ((int(a), int(b)), (int(b), int(c)), (int(c), int(a))):
            he[(v1, v2)] += 1
    return he


def _signed_volume(verts: np.ndarray, faces: np.ndarray) -> float:
    """Signed volume via the divergence theorem (positive => outward normals)."""
    v0 = verts[faces[:, 0]]
    v1 = verts[faces[:, 1]]
    v2 = verts[faces[:, 2]]
    return float(np.sum(np.einsum("ij,ij->i", v0, np.cross(v1, v2))) / 6.0)


# A representative spread of styles and options. Twist exercises the rotated
# placement path; the plain case exercises the drain/rim caps.
_CASES = [
    (name, opts)
    for name in STYLES
    for opts in ({}, {"spin_turns": 0.5})
]


@pytest.mark.parametrize("style_name,opts", _CASES)
def test_mesh_is_consistently_oriented(style_name, opts):
    """Every directed half-edge must occur exactly once (consistent winding)."""
    style_fn = STYLES[style_name][0]
    verts, faces, _ = build_pot_mesh(
        H=120, Rt=70, Rb=50,
        t_wall=3, t_bottom=3, r_drain=10,
        expn=1.1, n_theta=80, n_z=40,
        r_outer_fn=style_fn, style_opts=opts,
    )

    he = _directed_halfedge_counts(faces)
    inconsistent = [e for e, n in he.items() if n != 1]

    assert not inconsistent, (
        f"{style_name} {opts}: {len(inconsistent)} directed half-edges are "
        f"duplicated -> faces are not consistently wound (Rhino would report "
        f"inconsistent normals). Examples: {inconsistent[:5]}"
    )


@pytest.mark.parametrize("style_name,opts", _CASES)
def test_mesh_normals_point_outward(style_name, opts):
    """The closed mesh must have positive signed volume (outward normals)."""
    style_fn = STYLES[style_name][0]
    verts, faces, _ = build_pot_mesh(
        H=120, Rt=70, Rb=50,
        t_wall=3, t_bottom=3, r_drain=10,
        expn=1.1, n_theta=80, n_z=40,
        r_outer_fn=style_fn, style_opts=opts,
    )

    vol = _signed_volume(verts, faces)
    assert vol > 0.0, (
        f"{style_name} {opts}: signed volume {vol:.1f} <= 0 -> mesh is "
        f"inside-out (normals point inward); slicers read this as a void."
    )
