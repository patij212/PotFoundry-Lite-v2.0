"""Mesh orientation / export-quality regression tests.

These assert the property that distinguishes a Rhino/Grasshopper/slicer-ready
solid from one that merely *looks* closed:

    The exported mesh must be a consistently wound, closed two-manifold with
    OUTWARD-facing normals (positive signed volume).

The pre-existing ``test_mesh_is_watertight`` only checks that every edge appears
twice; it passes even when adjacent triangles disagree on winding or when the
whole solid is inside-out. These tests close that gap and pin the regression.
"""
from __future__ import annotations

import numpy as np
import pytest

from potfoundry import build_pot_mesh, STYLES
from potfoundry.core.mesh import (
    edge_manifold_stats,
    is_oriented_manifold,
    orient_outward,
    signed_volume,
)

# A couple of resolutions, including an odd/low one, to catch seam-specific bugs.
RESOLUTIONS = [(64, 32), (168, 84), (48, 24)]


def _mesh(style_name, n_theta, n_z, opts=None):
    fn = STYLES[style_name][0]
    return build_pot_mesh(
        H=120, Rt=70, Rb=50,
        t_wall=3, t_bottom=3, r_drain=10,
        expn=1.1, n_theta=n_theta, n_z=n_z,
        r_outer_fn=fn, style_opts=opts or {},
    )


@pytest.mark.parametrize("style_name", list(STYLES.keys()))
@pytest.mark.parametrize("n_theta,n_z", RESOLUTIONS)
def test_builder_emits_oriented_manifold(style_name, n_theta, n_z):
    """build_pot_mesh must produce a consistently wound closed manifold."""
    verts, faces, _ = _mesh(style_name, n_theta, n_z)
    stats = edge_manifold_stats(verts, faces)
    assert stats.non_manifold_edges == 0, (
        f"{style_name}@{n_theta}x{n_z}: {stats.non_manifold_edges} non-manifold edges"
    )
    assert stats.inconsistent_edges == 0, (
        f"{style_name}@{n_theta}x{n_z}: {stats.inconsistent_edges} inconsistently "
        f"wound edges (adjacent face normals disagree)"
    )


@pytest.mark.parametrize("style_name", list(STYLES.keys()))
def test_builder_normals_point_outward(style_name):
    """A correctly oriented solid has positive signed volume (outward normals)."""
    verts, faces, _ = _mesh(style_name, 96, 48)
    vol = signed_volume(verts, faces)
    assert vol > 0.0, (
        f"{style_name}: signed volume {vol:.1f} <= 0 -> normals point inward "
        f"(solid is inside-out for slicers/Rhino)"
    )


def test_builder_with_twist_is_oriented_manifold():
    """Global spin/twist must not break orientation at the seams."""
    verts, faces, _ = _mesh(
        "SpiralRidges", 168, 84,
        opts={"spiral_turns": 1.5, "spin_turns": 0.75},
    )
    assert is_oriented_manifold(verts, faces)
    assert signed_volume(verts, faces) > 0.0


class TestOrientUtility:
    """Unit tests for the reusable orientation/repair pass."""

    def test_signed_volume_unit_cube(self):
        # Axis-aligned unit cube, outward-wound -> volume == 1.
        verts = np.array([
            [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
            [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
        ], dtype=float)
        faces = np.array([
            [0, 2, 1], [0, 3, 2],   # bottom (z=0), outward = -z
            [4, 5, 6], [4, 6, 7],   # top (z=1), outward = +z
            [0, 1, 5], [0, 5, 4],   # y=0
            [2, 3, 7], [2, 7, 6],   # y=1
            [1, 2, 6], [1, 6, 5],   # x=1
            [3, 0, 4], [3, 4, 7],   # x=0
        ])
        assert abs(signed_volume(verts, faces) - 1.0) < 1e-9
        assert is_oriented_manifold(verts, faces)

    def test_orient_outward_repairs_scrambled_cube(self):
        verts = np.array([
            [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
            [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
        ], dtype=float)
        faces = np.array([
            [0, 2, 1], [0, 3, 2],
            [4, 5, 6], [4, 6, 7],
            [0, 1, 5], [0, 5, 4],
            [2, 3, 7], [2, 7, 6],
            [1, 2, 6], [1, 6, 5],
            [3, 0, 4], [3, 4, 7],
        ])
        # Scramble: flip some windings and invert the whole thing.
        scrambled = faces.copy()
        scrambled[3] = scrambled[3][::-1]
        scrambled[7] = scrambled[7][::-1]
        scrambled = scrambled[:, ::-1]  # now inside-out
        assert not is_oriented_manifold(verts, scrambled)

        repaired = orient_outward(verts, scrambled)
        assert is_oriented_manifold(verts, repaired)
        assert signed_volume(verts, repaired) > 0.0

    def test_orient_outward_is_idempotent_on_builder_mesh(self):
        verts, faces, _ = _mesh("FourierBloom", 96, 48)
        once = orient_outward(verts, faces)
        twice = orient_outward(verts, once)
        np.testing.assert_array_equal(once, twice)
