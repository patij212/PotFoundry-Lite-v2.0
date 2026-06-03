"""Mesh orientation tests — Grasshopper/Rhino export quality.

When a mesh is imported into Rhino/Grasshopper (via STL/OBJ), face *winding*
determines face direction. Two invariants must hold for a clean import:

1. **Coherent orientation** — every interior edge is traversed in opposite
   directions by its two adjacent triangles. Equivalently, for a closed
   manifold, every *directed* edge ``(a, b)`` appears exactly once. If a
   directed edge appears twice, two neighbouring faces disagree on winding and
   Rhino shows flipped/black faces at that seam.

2. **Outward normals** — the surface must enclose positive signed volume
   (divergence theorem). A negative signed volume means the whole solid is
   inside-out; Rhino imports every face flipped and downstream operations
   (offsets, booleans, thickening) break.

The pot mesh is a single closed 2-manifold shell (outer wall + inner wall +
rim + bottom slab + drain tube), so both invariants are well defined and must
hold for *every* style and resolution.

Run with: PYTHONPATH=. pytest tests/test_mesh_orientation.py -v
"""
from __future__ import annotations

from collections import Counter

import numpy as np
import pytest

from potfoundry import build_pot_mesh, STYLES


def _directed_edge_counts(faces: np.ndarray) -> Counter:
    """Count occurrences of each directed edge (a, b) across all triangles."""
    counts: Counter = Counter()
    a = faces[:, 0]
    b = faces[:, 1]
    c = faces[:, 2]
    for u, v in ((a, b), (b, c), (c, a)):
        for e in zip(u.tolist(), v.tolist()):
            counts[e] += 1
    return counts


def _signed_volume(verts: np.ndarray, faces: np.ndarray) -> float:
    """Signed volume of a closed triangle mesh (positive == outward normals)."""
    v0 = verts[faces[:, 0]]
    v1 = verts[faces[:, 1]]
    v2 = verts[faces[:, 2]]
    return float(np.einsum("ij,ij->i", v0, np.cross(v1, v2)).sum() / 6.0)


_BUILD_KW = dict(
    H=100, Rt=60, Rb=40, t_wall=3, t_bottom=3, r_drain=8,
    expn=1.1, n_theta=60, n_z=30,
)


@pytest.mark.parametrize("style_name", list(STYLES.keys()))
def test_orientation_is_coherent(style_name):
    """Every directed edge appears exactly once (no winding disagreements)."""
    fn = STYLES[style_name][0]
    _, faces, _ = build_pot_mesh(r_outer_fn=fn, style_opts={}, **_BUILD_KW)

    counts = _directed_edge_counts(faces)
    incoherent = {e: c for e, c in counts.items() if c != 1}
    assert not incoherent, (
        f"{style_name}: {len(incoherent)} directed edges have inconsistent "
        f"winding between adjacent faces (mesh not coherently oriented)"
    )


@pytest.mark.parametrize("style_name", list(STYLES.keys()))
def test_normals_point_outward(style_name):
    """Closed shell encloses positive signed volume (normals point outward)."""
    fn = STYLES[style_name][0]
    verts, faces, _ = build_pot_mesh(r_outer_fn=fn, style_opts={}, **_BUILD_KW)

    vol = _signed_volume(verts, faces)
    assert vol > 0, (
        f"{style_name}: signed volume {vol:.1f} <= 0 — mesh is inside-out "
        f"(normals point inward)"
    )


def test_orientation_holds_with_twist():
    """Coherence + outward normals survive a global spin/twist."""
    fn = STYLES["SpiralRidges"][0]
    opts = {"spin_turns": 0.75, "spiral_turns": 1.5}
    verts, faces, _ = build_pot_mesh(r_outer_fn=fn, style_opts=opts, **_BUILD_KW)

    counts = _directed_edge_counts(faces)
    assert all(c == 1 for c in counts.values()), "twisted mesh not coherent"
    assert _signed_volume(verts, faces) > 0, "twisted mesh is inside-out"


def _point_inside(points: np.ndarray, verts: np.ndarray, faces: np.ndarray,
                  direction: np.ndarray) -> np.ndarray:
    """Ray-parity point-in-solid test (vectorized Moeller-Trumbore).

    Returns a boolean per point: True if it lies inside the solid bounded by
    the mesh (odd number of ray crossings). Geometry-independent — works for the
    non-convex petal styles where a radial heuristic fails.
    """
    v0 = verts[faces[:, 0]]
    v1 = verts[faces[:, 1]]
    v2 = verts[faces[:, 2]]
    e1 = v1 - v0
    e2 = v2 - v0
    d = direction / np.linalg.norm(direction)
    h = np.cross(d, e2)
    a = np.einsum("ij,ij->i", e1, h)
    mask = np.abs(a) > 1e-9
    f = np.zeros_like(a)
    f[mask] = 1.0 / a[mask]
    q_const = np.cross  # local alias avoids attribute lookups in loop

    out = np.zeros(len(points), dtype=bool)
    for k, p in enumerate(points):
        s = p - v0
        u = f * np.einsum("ij,ij->i", s, h)
        q = q_const(s, e1)
        w = f * np.einsum("j,ij->i", d, q)
        t = f * np.einsum("ij,ij->i", e2, q)
        hit = mask & (u >= 0) & (u <= 1) & (w >= 0) & (u + w <= 1) & (t > 1e-7)
        out[k] = (int(np.count_nonzero(hit)) % 2) == 1
    return out


def test_face_normals_point_out_of_material():
    """Each face normal points *out of the solid material*, not into it.

    For a sample of faces, a tiny step along ``+normal`` from the face centroid
    must land outside the solid and a step along ``-normal`` must land inside.
    This is the property Rhino/Grasshopper rely on for correct shading, and it
    holds for non-convex (petal) geometry where radial heuristics do not.
    """
    fn = STYLES["SuperformulaBlossom"][0]
    verts, faces, _ = build_pot_mesh(
        H=100, Rt=60, Rb=40, t_wall=3, t_bottom=3, r_drain=8,
        expn=1.1, n_theta=40, n_z=20, r_outer_fn=fn, style_opts={},
    )

    v0 = verts[faces[:, 0]]
    v1 = verts[faces[:, 1]]
    v2 = verts[faces[:, 2]]
    normals = np.cross(v1 - v0, v2 - v0)
    nlen = np.linalg.norm(normals, axis=1)
    good = np.where(nlen > 1e-9)[0]
    nu = normals / np.maximum(nlen, 1e-9)[:, None]
    centers = (v0 + v1 + v2) / 3.0

    rng = np.random.default_rng(0)
    idx = rng.choice(good, size=60, replace=False)
    eps = 0.05
    ray = np.array([0.3, 0.7, 0.21])  # generic direction avoids axis degeneracy

    outside_ok = ~_point_inside(centers[idx] + eps * nu[idx], verts, faces, ray)
    inside_ok = _point_inside(centers[idx] - eps * nu[idx], verts, faces, ray)

    assert outside_ok.mean() > 0.98, (
        f"only {outside_ok.mean():.0%} of faces step outside along +normal"
    )
    assert inside_ok.mean() > 0.98, (
        f"only {inside_ok.mean():.0%} of faces step inside along -normal"
    )
