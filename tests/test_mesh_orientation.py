"""Mesh orientation / export-quality regression tests.

These tests guard the properties that a triangle mesh MUST satisfy to import
cleanly into Rhino / Grasshopper (and to print correctly):

1. **Watertight**   - every undirected edge is shared by exactly two faces.
2. **Orientable & consistently wound** - every *directed* edge appears exactly
   once. When two adjacent faces are wound consistently, the shared edge is
   traversed in opposite directions, so each directed edge occurs once. A
   mismatch means a flipped face (a "naked"/non-manifold seam in Rhino).
3. **Outward facing** - the signed volume (divergence theorem) is positive,
   i.e. face normals point *out* of the solid. A negative volume means the
   model imports inside-out.

The earlier ``test_mesh_has_consistent_normals`` test used a per-face radial
heuristic that is unreliable for decorative (petalled) profiles, so it was
stubbed out. The divergence-theorem signed volume below is exact for any
closed manifold regardless of surface decoration.
"""
from __future__ import annotations

from collections import Counter

import numpy as np
import pytest

from potfoundry import build_pot_mesh, STYLES


ALL_STYLES = [
    "SuperformulaBlossom",
    "FourierBloom",
    "SpiralRidges",
    "SuperellipseMorph",
    "HarmonicRipple",
]


def _signed_volume(verts: np.ndarray, faces: np.ndarray) -> float:
    """Signed volume of a closed triangle mesh via the divergence theorem.

    V = (1/6) * sum over faces of  v0 . (v1 x v2)

    Positive when faces are wound counter-clockwise as seen from outside
    (i.e. normals point outward).
    """
    v0 = verts[faces[:, 0]]
    v1 = verts[faces[:, 1]]
    v2 = verts[faces[:, 2]]
    return float(np.einsum("ij,ij->i", v0, np.cross(v1, v2)).sum() / 6.0)


def _directed_edge_counts(faces: np.ndarray) -> Counter:
    counts: Counter = Counter()
    for f in faces:
        a, b, c = int(f[0]), int(f[1]), int(f[2])
        counts[(a, b)] += 1
        counts[(b, c)] += 1
        counts[(c, a)] += 1
    return counts


def _undirected_edge_counts(faces: np.ndarray) -> Counter:
    counts: Counter = Counter()
    for f in faces:
        for i in range(3):
            a, b = int(f[i]), int(f[(i + 1) % 3])
            counts[(a, b) if a < b else (b, a)] += 1
    return counts


def _build(style_name: str, n_theta: int = 120, n_z: int = 60, opts: dict | None = None):
    style_fn = STYLES[style_name][0]
    return build_pot_mesh(
        H=120, Rt=70, Rb=50,
        t_wall=3, t_bottom=3, r_drain=10,
        expn=1.1, n_theta=n_theta, n_z=n_z,
        r_outer_fn=style_fn, style_opts=opts or {},
    )


class TestMeshOrientation:
    @pytest.mark.parametrize("style_name", ALL_STYLES)
    def test_watertight(self, style_name):
        verts, faces, _ = _build(style_name)
        counts = _undirected_edge_counts(faces)
        bad = [e for e, c in counts.items() if c != 2]
        assert not bad, f"{style_name}: {len(bad)} non-manifold edges (not watertight)"

    @pytest.mark.parametrize("style_name", ALL_STYLES)
    def test_consistently_oriented(self, style_name):
        """Every directed edge must appear exactly once (no flipped faces)."""
        verts, faces, _ = _build(style_name)
        counts = _directed_edge_counts(faces)
        bad = [e for e, c in counts.items() if c != 1]
        assert not bad, (
            f"{style_name}: {len(bad)} directed edges traversed more than once "
            f"-> inconsistent winding (flipped faces / seams Rhino reports as naked)"
        )

    @pytest.mark.parametrize("style_name", ALL_STYLES)
    def test_normals_point_outward(self, style_name):
        """Signed volume must be positive so normals face out of the solid."""
        verts, faces, _ = _build(style_name)
        vol = _signed_volume(verts, faces)
        assert vol > 0, (
            f"{style_name}: signed volume {vol:.1f} <= 0 -> normals point inward, "
            f"model would import inside-out into Rhino/Grasshopper"
        )

    @pytest.mark.parametrize("n_theta,n_z", [(8, 4), (60, 30), (168, 84)])
    def test_orientation_independent_of_resolution(self, n_theta, n_z):
        """Orientation correctness must hold at every resolution."""
        verts, faces, _ = _build("SuperformulaBlossom", n_theta=n_theta, n_z=n_z)
        assert _signed_volume(verts, faces) > 0
        counts = _directed_edge_counts(faces)
        assert all(c == 1 for c in counts.values())
