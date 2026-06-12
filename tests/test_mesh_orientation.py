"""Mesh orientation invariants for Grasshopper/Rhino-grade STL export.

A mesh that is merely *watertight* (every undirected edge shared by two faces)
can still import badly into Rhino/Grasshopper: if face winding is inconsistent
or globally inverted, normals point the wrong way, breaking shading, boolean
operations, and "closed solid" detection.

These tests pin two stronger invariants on top of watertightness:

1. **Consistent orientation (orientable surface).** For a closed, consistently
   oriented manifold, every directed edge ``(a, b)`` appears exactly once, and
   its reverse ``(b, a)`` appears exactly once. Any duplicated directed edge
   means two adjacent faces disagree on winding.

2. **Outward orientation.** The signed volume computed from face winding must be
   positive, i.e. STL face normals point *out* of the solid. This is what
   slicers and Rhino expect; negative volume means inverted normals.

Run with: PYTHONPATH=. pytest tests/test_mesh_orientation.py -v
"""
from __future__ import annotations

from collections import Counter

import numpy as np
import pytest

from potfoundry import build_pot_mesh, STYLES


def _directed_edge_counts(faces: np.ndarray) -> Counter:
    counts: Counter = Counter()
    for a, b, c in faces:
        counts[(int(a), int(b))] += 1
        counts[(int(b), int(c))] += 1
        counts[(int(c), int(a))] += 1
    return counts


def _signed_volume(verts: np.ndarray, faces: np.ndarray) -> float:
    v0 = verts[faces[:, 0]]
    v1 = verts[faces[:, 1]]
    v2 = verts[faces[:, 2]]
    return float(np.sum(np.einsum("ij,ij->i", v0, np.cross(v1, v2))) / 6.0)


# A spread of styles, sizes and resolutions (including odd divisions) so the
# invariant cannot be satisfied by accident for one particular construction.
_CASES = [
    ("SuperformulaBlossom", 120, 70, 50, 168, 84),
    ("FourierBloom", 100, 60, 40, 120, 60),
    ("SpiralRidges", 90, 55, 45, 96, 48),
    ("SuperellipseMorph", 150, 80, 50, 121, 47),  # odd divisions
    ("HarmonicRipple", 110, 65, 48, 144, 72),
]


@pytest.mark.parametrize("style,H,Rt,Rb,nth,nz", _CASES)
def test_orientation_is_consistent(style, H, Rt, Rb, nth, nz):
    """Every directed edge appears exactly once (orientable, no winding clashes)."""
    fn = STYLES[style][0]
    verts, faces, _ = build_pot_mesh(
        H=H, Rt=Rt, Rb=Rb, t_wall=3, t_bottom=3, r_drain=10,
        expn=1.1, n_theta=nth, n_z=nz, r_outer_fn=fn, style_opts={},
    )
    dcounts = _directed_edge_counts(faces)
    duplicated = [e for e, n in dcounts.items() if n != 1]
    assert not duplicated, (
        f"{style}: {len(duplicated)} directed edges traversed >1x in the same "
        "direction -> adjacent faces disagree on winding (non-orientable export)"
    )


@pytest.mark.parametrize("style,H,Rt,Rb,nth,nz", _CASES)
def test_normals_point_outward(style, H, Rt, Rb, nth, nz):
    """Signed volume is positive -> STL normals point out of the solid."""
    fn = STYLES[style][0]
    verts, faces, _ = build_pot_mesh(
        H=H, Rt=Rt, Rb=Rb, t_wall=3, t_bottom=3, r_drain=10,
        expn=1.1, n_theta=nth, n_z=nz, r_outer_fn=fn, style_opts={},
    )
    vol = _signed_volume(verts, faces)
    assert vol > 0, (
        f"{style}: signed volume {vol:.1f} <= 0 -> inverted normals "
        "(Rhino/Grasshopper will see the solid inside-out)"
    )
