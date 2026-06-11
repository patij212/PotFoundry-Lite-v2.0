"""Mesh manifold / orientation quality gate for export to Grasshopper/Rhino.

Slicers and CAD packages (Rhino, Grasshopper, PrusaSlicer, Cura) expect a
closed, *consistently oriented* triangle mesh whose face normals point
**outward** from the enclosed solid. A mesh that is merely watertight
(2-manifold) but whose faces are inconsistently wound — or whose normals
point inward — renders with holes, shades black, and triggers "bad normals"
repairs on import.

These tests assert the strongest practical guarantee for a triangle soup to
be a valid solid:

  1. Closed 2-manifold .... every undirected edge is shared by exactly 2 faces.
  2. Consistently oriented . every interior edge is traversed once in each
                             direction by its two incident faces.
  3. Outward normals ....... the signed volume (divergence theorem) is positive.
  4. No degenerate faces ... every triangle has non-zero area.

The orientation properties are purely topological (they depend on the face
index structure, not on vertex positions), so they must hold identically for
every style and every parameter combination. We therefore sweep styles, twist,
bell modulation, and a near-degenerate drain clamp.

Run with: PYTHONPATH=. pytest tests/test_mesh_manifold.py -v
"""
from __future__ import annotations

from collections import Counter

import numpy as np
import pytest

from potfoundry import STYLES, build_pot_mesh


def analyze_mesh(verts: np.ndarray, faces: np.ndarray) -> dict:
    """Return manifold/orientation diagnostics for a triangle mesh.

    Args:
        verts: Vertex array (N, 3)
        faces: Face index array (M, 3)

    Returns:
        Dict with:
          non_manifold_edges: count of undirected edges not shared by exactly 2 faces
          inconsistent_edges: count of 2-manifold edges whose two faces wind the
                              same way (orientation defect)
          degenerate_faces:   count of zero-area triangles
          signed_volume:      enclosed signed volume (positive => outward normals)
    """
    faces = np.asarray(faces, dtype=np.int64)

    # Directed edges of every triangle: (v0->v1), (v1->v2), (v2->v0)
    a = faces[:, [0, 1, 2]].reshape(-1)
    b = faces[:, [1, 2, 0]].reshape(-1)

    directed = Counter(zip(a.tolist(), b.tolist()))
    undirected: Counter = Counter()
    for (u, v), c in directed.items():
        undirected[(u, v) if u < v else (v, u)] += c

    non_manifold = sum(1 for c in undirected.values() if c != 2)

    inconsistent = 0
    for (u, v), c in undirected.items():
        if c != 2:
            continue
        # Consistent orientation => one face says u->v and the other v->u,
        # i.e. each directed form appears exactly once.
        if not (directed.get((u, v), 0) == 1 and directed.get((v, u), 0) == 1):
            inconsistent += 1

    v0 = verts[faces[:, 0]]
    v1 = verts[faces[:, 1]]
    v2 = verts[faces[:, 2]]
    areas = 0.5 * np.linalg.norm(np.cross(v1 - v0, v2 - v0), axis=1)
    degenerate = int(np.count_nonzero(areas < 1e-9))

    signed_volume = float(np.einsum("ij,ij->i", v0, np.cross(v1, v2)).sum() / 6.0)

    return {
        "non_manifold_edges": int(non_manifold),
        "inconsistent_edges": int(inconsistent),
        "degenerate_faces": degenerate,
        "signed_volume": signed_volume,
    }


# (style_name, style_opts) cases. Orientation is topological, so every case
# must pass identically; we vary geometry to guard the invariant broadly.
_CASES = [
    ("SuperformulaBlossom", {}),
    ("FourierBloom", {}),
    ("SpiralRidges", {}),
    ("SuperellipseMorph", {}),
    ("HarmonicRipple", {}),
    ("SpiralRidges", {"spin_turns": 1.0}),
    ("HarmonicRipple", {"spin_turns": 0.5, "spin_phase_deg": 30.0}),
    ("SuperformulaBlossom", {"bell_amp": 0.3}),
]


@pytest.mark.parametrize("style_name,opts", _CASES)
def test_mesh_is_oriented_solid(style_name, opts):
    """Every exported mesh must be a closed, outward-oriented manifold."""
    style_fn = STYLES[style_name][0]
    verts, faces, _ = build_pot_mesh(
        H=100, Rt=60, Rb=40,
        t_wall=3, t_bottom=3, r_drain=8,
        expn=1.1, n_theta=80, n_z=40,
        r_outer_fn=style_fn, style_opts=opts,
    )
    report = analyze_mesh(verts, faces)

    assert report["non_manifold_edges"] == 0, (
        f"{style_name} {opts}: {report['non_manifold_edges']} non-manifold edges"
    )
    assert report["inconsistent_edges"] == 0, (
        f"{style_name} {opts}: {report['inconsistent_edges']} inconsistently "
        "oriented edges (mesh faces are not consistently wound)"
    )
    assert report["degenerate_faces"] == 0, (
        f"{style_name} {opts}: {report['degenerate_faces']} degenerate faces"
    )
    assert report["signed_volume"] > 0, (
        f"{style_name} {opts}: signed volume {report['signed_volume']:.1f} <= 0 "
        "(face normals point inward, not outward)"
    )


def test_drain_clamp_near_degenerate_still_oriented():
    """A large drain that forces heavy inner-wall clamping stays a valid solid."""
    style_fn = STYLES["SuperformulaBlossom"][0]
    # r_drain close to the (Rb - t_wall - 2) limit maximizes inner-wall clamping.
    verts, faces, _ = build_pot_mesh(
        H=100, Rt=60, Rb=40,
        t_wall=3, t_bottom=3, r_drain=34,
        expn=1.1, n_theta=80, n_z=40,
        r_outer_fn=style_fn, style_opts={},
    )
    report = analyze_mesh(verts, faces)
    assert report["non_manifold_edges"] == 0
    assert report["inconsistent_edges"] == 0
    assert report["signed_volume"] > 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
