"""Mesh orientation / manifold-consistency tests.

These guard the single most important property for importing PotFoundry meshes
into CAD/parametric tools (Rhino, Grasshopper) and for mesh booleans/slicing:

    The exported surface must be a *consistently oriented* closed manifold with
    outward-facing normals.

Two independent, rigorous checks are used:

1. **Consistent winding** — In a consistently oriented manifold every interior
   edge is traversed in *opposite* directions by the two faces that share it.
   Equivalently, no directed edge ``(a -> b)`` may appear in more than one face.
   Any duplicate directed edge means two adjacent faces disagree on orientation
   (one of them is flipped) — exactly the defect Rhino flags with "Unify
   Normals" and that makes mesh booleans fail.

2. **Outward normals** — The signed volume of a closed triangle mesh
   (via the divergence theorem) is positive iff the faces are wound
   counter-clockwise when viewed from outside, i.e. normals point outward.
   STL/OBJ/3MF and every slicer assume outward normals.

Run with: PYTHONPATH=. pytest tests/test_mesh_orientation.py -v
"""
from __future__ import annotations

from collections import Counter

import numpy as np
import pytest

from potfoundry import build_pot_mesh, STYLES


def count_inconsistent_directed_edges(faces: np.ndarray) -> int:
    """Return the number of directed edges shared (in the same direction) by >1 face.

    Zero means the winding is globally consistent across the whole mesh.
    """
    directed: Counter = Counter()
    for f in faces:
        for i in range(3):
            a, b = int(f[i]), int(f[(i + 1) % 3])
            directed[(a, b)] += 1
    return sum(1 for c in directed.values() if c > 1)


def signed_volume(verts: np.ndarray, faces: np.ndarray) -> float:
    """Signed volume of the closed mesh (positive => outward-facing normals)."""
    v0 = verts[faces[:, 0]]
    v1 = verts[faces[:, 1]]
    v2 = verts[faces[:, 2]]
    return float(np.sum(np.einsum("ij,ij->i", v0, np.cross(v1, v2))) / 6.0)


# Test all styles plus a few twisted/parametric variations to be thorough.
_CASES = [
    dict(H=100, Rt=60, Rb=40, t_wall=3, t_bottom=3, r_drain=8, expn=1.1,
         n_theta=120, n_z=60, style_opts={}),
    dict(H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10, expn=1.1,
         n_theta=168, n_z=84, style_opts={"spin_turns": 0.75}),
    dict(H=80, Rt=45, Rb=55, t_wall=4, t_bottom=5, r_drain=6, expn=0.9,
         n_theta=96, n_z=48, style_opts={"bell_amp": 0.15}),
]


@pytest.mark.parametrize("style_name", list(STYLES.keys()))
@pytest.mark.parametrize("case", _CASES)
def test_mesh_winding_is_consistent(style_name, case):
    """Every style/parameter combo must produce a consistently wound mesh."""
    style_fn = STYLES[style_name][0]
    verts, faces, _ = build_pot_mesh(r_outer_fn=style_fn, **case)
    bad = count_inconsistent_directed_edges(faces)
    assert bad == 0, (
        f"{style_name}: {bad} inconsistently wound edges — adjacent faces "
        f"disagree on orientation (Rhino/Grasshopper would flag flipped normals)."
    )


@pytest.mark.parametrize("style_name", list(STYLES.keys()))
@pytest.mark.parametrize("case", _CASES)
def test_mesh_normals_point_outward(style_name, case):
    """Signed volume must be positive => normals face outward (CAD/slicer convention)."""
    style_fn = STYLES[style_name][0]
    verts, faces, _ = build_pot_mesh(r_outer_fn=style_fn, **case)
    vol = signed_volume(verts, faces)
    assert vol > 0.0, (
        f"{style_name}: signed volume {vol:.1f} <= 0 — mesh is inside-out "
        f"(normals point inward)."
    )
