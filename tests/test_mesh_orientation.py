"""Mesh orientation / normal-direction tests for export quality.

For a watertight mesh to be recognized as a valid *closed solid* by CAD tools
(Rhino / Grasshopper) and printed correctly by slicers, every triangle must be
wound so its normal points *outward*. By the divergence theorem, a closed mesh
whose triangles are consistently wound counter-clockwise when viewed from
outside has a strictly positive signed volume::

    V = (1/6) * sum_i  v0_i . (v1_i x v2_i)

A negative signed volume means the global winding is inverted (normals point
inward), which causes Rhino to treat the solid as "inside-out" and breaks
boolean / offset / wall-thickness operations.

These tests pin that invariant across every style, with and without spin.

Run with: PYTHONPATH=. pytest tests/test_mesh_orientation.py -v
"""
from __future__ import annotations

import numpy as np
import pytest

from potfoundry import build_pot_mesh, STYLES


def signed_volume(verts: np.ndarray, faces: np.ndarray) -> float:
    """Signed volume of a triangle soup via the divergence theorem.

    Positive => triangles wound CCW seen from outside (outward normals).
    """
    v0 = verts[faces[:, 0]]
    v1 = verts[faces[:, 1]]
    v2 = verts[faces[:, 2]]
    return float(np.sum(np.einsum("ij,ij->i", v0, np.cross(v1, v2))) / 6.0)


_PARAMS = dict(
    H=100, Rt=60, Rb=40,
    t_wall=3, t_bottom=3, r_drain=8,
    expn=1.1, n_theta=120, n_z=60,
)


@pytest.mark.parametrize("style_name", list(STYLES.keys()))
@pytest.mark.parametrize("opts,label", [({}, "default"), ({"spin_turns": 0.5, "spin_phase_deg": 15}, "spin")])
def test_outward_normals_positive_volume(style_name, opts, label):
    """Every style must export with outward-facing normals (positive volume)."""
    style_fn = STYLES[style_name][0]
    verts, faces, _ = build_pot_mesh(r_outer_fn=style_fn, style_opts=opts, **_PARAMS)

    vol = signed_volume(verts, faces)
    assert vol > 0.0, (
        f"{style_name} ({label}) has inverted normals: signed volume "
        f"{vol:.1f} <= 0 — mesh would import inside-out in Rhino/Grasshopper"
    )


def test_signed_volume_matches_geometric_estimate():
    """Sanity: |signed volume| should be in the ballpark of a thin-walled pot.

    Catches a winding fix that accidentally also corrupts geometry.
    """
    style_fn = STYLES["SuperformulaBlossom"][0]
    verts, faces, _ = build_pot_mesh(r_outer_fn=style_fn, style_opts={}, **_PARAMS)
    vol = signed_volume(verts, faces)

    # Solid material volume of a tapered thin wall + base is well under the
    # bounding cylinder volume and well above zero.
    assert 1_000.0 < vol < 500_000.0, f"signed volume {vol:.1f} out of plausible range"


@pytest.mark.parametrize("style_name", list(STYLES.keys()))
def test_winding_is_consistently_oriented(style_name):
    """Every shared edge is traversed in opposite directions by its two faces.

    Consistency is what makes the global signed-volume sign meaningful: a
    watertight, consistently-wound mesh with positive volume has *all* normals
    pointing outward (no per-face exceptions). This catches a partial flip that
    a single net-volume check could mask.
    """
    style_fn = STYLES[style_name][0]
    verts, faces, _ = build_pot_mesh(r_outer_fn=style_fn, style_opts={}, **_PARAMS)

    seen: dict[tuple[int, int], int] = {}
    for f in faces:
        for i in range(3):
            a = int(f[i])
            b = int(f[(i + 1) % 3])
            key = (a, b) if a < b else (b, a)
            sign = 1 if a < b else -1
            seen[key] = seen.get(key, 0) + sign

    # For consistent orientation every undirected edge is used once forward and
    # once backward, so the signed sum per edge is exactly 0.
    inconsistent = [e for e, s in seen.items() if s != 0]
    assert not inconsistent, (
        f"{style_name}: {len(inconsistent)} edges have inconsistent winding "
        "(mesh is not coherently oriented)"
    )
