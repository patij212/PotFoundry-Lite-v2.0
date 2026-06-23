"""Mesh orientation / export-quality regression tests.

For a mesh to import cleanly into Grasshopper / Rhino (and to slice correctly),
it must be a *coherently oriented* closed manifold:

1. Every interior edge is shared by exactly two faces (manifold / watertight).
2. The two faces sharing an edge traverse it in *opposite* directions
   (coherent winding — no flipped faces).
3. The global orientation is *outward* (positive signed volume), so face
   normals derived from winding point away from the solid. Rhino reports
   inward-facing meshes as "inside out" and flags them under Check Mesh.

These properties are independent of mesh resolution and must hold for every
style across the supported parameter envelope, not just one sample.

Run with: PYTHONPATH=. pytest tests/test_mesh_orientation.py -v
"""
from __future__ import annotations

from collections import Counter

import numpy as np
import pytest

from potfoundry import build_pot_mesh, STYLES


def signed_volume(verts: np.ndarray, faces: np.ndarray) -> float:
    """Signed volume via the divergence theorem.

    Positive when faces are wound counter-clockwise as seen from outside
    (i.e. normals point outward).
    """
    v0 = verts[faces[:, 0]]
    v1 = verts[faces[:, 1]]
    v2 = verts[faces[:, 2]]
    return float(np.sum(np.einsum("ij,ij->i", v0, np.cross(v1, v2))) / 6.0)


def winding_report(faces: np.ndarray) -> tuple[int, int, int]:
    """Classify directed edges of a closed manifold mesh.

    Returns (incoherent, boundary, nonmanifold):
      * incoherent  - undirected edges whose two faces wind the same way
      * boundary    - undirected edges used by only one face
      * nonmanifold - undirected edges used by more than two faces
    """
    directed = Counter()
    for f in faces:
        for i in range(3):
            a, b = int(f[i]), int(f[(i + 1) % 3])
            directed[(a, b)] += 1

    undirected = Counter()
    for (a, b), c in directed.items():
        undirected[tuple(sorted((a, b)))] += c

    incoherent = boundary = nonmanifold = 0
    for (a, b), total in undirected.items():
        if total == 1:
            boundary += 1
        elif total > 2:
            nonmanifold += 1
        else:  # total == 2: must be one each direction for coherence
            if directed.get((a, b), 0) != 1 or directed.get((b, a), 0) != 1:
                incoherent += 1
    return incoherent, boundary, nonmanifold


# A small but meaningful slice of the parameter envelope, including a case
# where the inner wall clamps against the drain.
PARAM_SETS = [
    dict(H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10, expn=1.1,
         n_theta=120, n_z=60),
    dict(H=80, Rt=40, Rb=30, t_wall=8, t_bottom=4, r_drain=18, expn=1.1,
         n_theta=80, n_z=40),
    dict(H=200, Rt=50, Rb=90, t_wall=4, t_bottom=5, r_drain=12, expn=0.8,
         n_theta=96, n_z=48),
]


@pytest.mark.parametrize("style_name", list(STYLES.keys()))
@pytest.mark.parametrize("params", PARAM_SETS)
def test_mesh_is_coherently_oriented_outward(style_name, params):
    style_fn = STYLES[style_name][0]
    verts, faces, _ = build_pot_mesh(r_outer_fn=style_fn, style_opts={}, **params)

    incoherent, boundary, nonmanifold = winding_report(faces)

    assert boundary == 0, f"{style_name}: {boundary} boundary (open) edges"
    assert nonmanifold == 0, f"{style_name}: {nonmanifold} non-manifold edges"
    assert incoherent == 0, (
        f"{style_name}: {incoherent} edges with flipped winding "
        "(mesh not coherently oriented)"
    )

    vol = signed_volume(verts, faces)
    assert vol > 0, (
        f"{style_name}: signed volume {vol:.1f} <= 0 — normals point inward "
        "(mesh would import inside-out in Rhino/Grasshopper)"
    )
