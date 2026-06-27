"""Unit tests for the mesh orientation-repair utilities.

These prove ``orient_outward`` can turn an inconsistently wound / inside-out
mesh into a consistently outward-oriented manifold, independent of the pot
builder. The fixture is a unit cube with deliberately scrambled winding.

Run with: PYTHONPATH=. pytest tests/test_mesh_repair.py -v
"""
from __future__ import annotations

import numpy as np

from potfoundry import is_consistently_oriented, orient_outward, signed_volume


def _cube():
    """Unit cube (8 verts, 12 triangles) with all faces wound outward."""
    verts = np.array([
        [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
        [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
    ], dtype=float)
    faces = np.array([
        [0, 3, 2], [0, 2, 1],   # bottom (z=0), normal -z
        [4, 5, 6], [4, 6, 7],   # top (z=1), normal +z
        [0, 1, 5], [0, 5, 4],   # front (y=0), normal -y
        [2, 3, 7], [2, 7, 6],   # back (y=1), normal +y
        [1, 2, 6], [1, 6, 5],   # right (x=1), normal +x
        [3, 0, 4], [3, 4, 7],   # left (x=0), normal -x
    ], dtype=np.int64)
    return verts, faces


def test_reference_cube_is_already_outward():
    verts, faces = _cube()
    assert is_consistently_oriented(faces)
    assert signed_volume(verts, faces) == 1.0  # unit cube


def test_orient_outward_repairs_globally_inverted_mesh():
    """An all-flipped (inside-out) cube is consistent but has negative volume."""
    verts, faces = _cube()
    inverted = faces[:, ::-1].copy()
    assert is_consistently_oriented(inverted)          # still consistent...
    assert signed_volume(verts, inverted) < 0          # ...but inside-out

    repaired = orient_outward(verts, inverted)
    assert is_consistently_oriented(repaired)
    assert signed_volume(verts, repaired) > 0


def test_orient_outward_repairs_mixed_winding():
    """Flip a handful of faces to break consistency, then repair."""
    verts, faces = _cube()
    broken = faces.copy()
    for i in (0, 3, 7, 10):
        broken[i] = broken[i][::-1]
    assert not is_consistently_oriented(broken)

    repaired = orient_outward(verts, broken)
    assert is_consistently_oriented(repaired)
    assert signed_volume(verts, repaired) > 0


def test_orient_outward_preserves_triangle_set():
    """Repair only rewinds faces; the set of triangles (as vertex sets) is kept."""
    verts, faces = _cube()
    broken = faces.copy()
    broken[2] = broken[2][::-1]
    repaired = orient_outward(verts, broken)

    def as_sets(fs):
        return sorted(tuple(sorted(map(int, f))) for f in fs)

    assert as_sets(repaired) == as_sets(faces)


def test_orient_outward_idempotent_on_good_mesh():
    verts, faces = _cube()
    once = orient_outward(verts, faces)
    twice = orient_outward(verts, once)
    np.testing.assert_array_equal(once, twice)
    assert signed_volume(verts, once) > 0


def test_empty_mesh_is_handled():
    verts = np.zeros((0, 3), dtype=float)
    faces = np.zeros((0, 3), dtype=np.int64)
    out = orient_outward(verts, faces)
    assert out.shape == (0, 3)
