"""Mesh-quality invariants for clean CAD import (all styles).

The existing watertightness test in ``test_golden_meshes.py`` covers a single
style. Rhino/Grasshopper import quality additionally requires, for *every*
style: no degenerate (zero-area or repeated-index) triangles, a clean closed
2-manifold, and no coincident duplicate vertices in the index buffer (the mesh
is already welded, so STL/OBJ welding is unambiguous). These tests pin all of
that across the full style set.
"""
from __future__ import annotations

from collections import Counter

import numpy as np
import pytest

from potfoundry import build_pot_mesh, STYLES

_COMMON = dict(
    H=120.0, Rt=70.0, Rb=50.0, t_wall=3.0, t_bottom=3.0, r_drain=10.0,
    expn=1.1, n_theta=72, n_z=36,
)


def _mesh(style_name: str):
    return build_pot_mesh(r_outer_fn=STYLES[style_name][0], style_opts={}, **_COMMON)


@pytest.mark.parametrize("style_name", list(STYLES.keys()))
def test_no_zero_area_triangles(style_name: str) -> None:
    verts, faces, _ = _mesh(style_name)
    v0, v1, v2 = verts[faces[:, 0]], verts[faces[:, 1]], verts[faces[:, 2]]
    areas = 0.5 * np.linalg.norm(np.cross(v1 - v0, v2 - v0), axis=1)
    n_degen = int(np.count_nonzero(areas < 1e-9))
    assert n_degen == 0, f"{style_name}: {n_degen} zero-area triangles"


@pytest.mark.parametrize("style_name", list(STYLES.keys()))
def test_no_repeated_index_faces(style_name: str) -> None:
    _, faces, _ = _mesh(style_name)
    repeated = (
        (faces[:, 0] == faces[:, 1])
        | (faces[:, 1] == faces[:, 2])
        | (faces[:, 0] == faces[:, 2])
    )
    assert not np.any(repeated), (
        f"{style_name}: {int(np.count_nonzero(repeated))} faces repeat a vertex index"
    )


@pytest.mark.parametrize("style_name", list(STYLES.keys()))
def test_closed_two_manifold(style_name: str) -> None:
    _, faces, _ = _mesh(style_name)
    edges: Counter = Counter()
    for face in faces:
        for i in range(3):
            edges[tuple(sorted((int(face[i]), int(face[(i + 1) % 3]))))] += 1
    non_manifold = [e for e, c in edges.items() if c != 2]
    assert non_manifold == [], (
        f"{style_name}: {len(non_manifold)} edges not shared by exactly two faces"
    )


@pytest.mark.parametrize("style_name", list(STYLES.keys()))
def test_no_coincident_duplicate_vertices(style_name: str) -> None:
    """The index buffer must already be welded (no two vertices at one point)."""
    verts, _, _ = _mesh(style_name)
    rounded = np.round(verts, 6)
    unique = np.unique(rounded, axis=0)
    n_dup = len(verts) - len(unique)
    assert n_dup == 0, f"{style_name}: {n_dup} coincident duplicate vertices"
