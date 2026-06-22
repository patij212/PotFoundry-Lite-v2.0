"""Mesh orientation / export-quality tests for PotFoundry.

These tests pin a defect that corrupts Grasshopper/Rhino imports: the
generated mesh must be a *consistently oriented, outward-facing*, watertight
manifold. Unlike most slicers (which silently auto-repair winding), Rhino and
Grasshopper respect the orientation encoded in the mesh. An inverted or
inconsistently wound mesh imports "inside-out": flipped shading, negative
``Volume``, and broken mesh operations (offset, thicken, boolean, MeshToNurb).

Quality contract for an exported solid:

1. **Manifold / watertight** — every undirected edge is shared by exactly two
   faces.
2. **Consistently oriented** — every *directed* edge appears exactly once, i.e.
   the two faces sharing an edge traverse it in opposite directions. This is
   the defining property of an orientable, consistently wound surface.
3. **Outward-facing** — the closed surface encloses positive signed volume, so
   face normals point out of the solid. (Rhino reports a positive ``Volume``.)
4. **Non-degenerate** — no zero-area faces, which Rhino flags as bad.

Run with: PYTHONPATH=. pytest tests/test_mesh_orientation.py -v
"""
from __future__ import annotations

from collections import Counter

import numpy as np
import pytest

from potfoundry import STYLES, build_pot_mesh


def signed_volume(verts: np.ndarray, faces: np.ndarray) -> float:
    """Signed volume via the divergence theorem.

    Positive when faces are wound counter-clockwise as seen from outside
    (normals point outward); negative when the mesh is inverted.
    """
    v0 = verts[faces[:, 0]]
    v1 = verts[faces[:, 1]]
    v2 = verts[faces[:, 2]]
    return float(np.sum(np.einsum("ij,ij->i", v0, np.cross(v1, v2))) / 6.0)


def directed_edge_counts(faces: np.ndarray) -> Counter:
    de: Counter = Counter()
    for tri in faces:
        for i in range(3):
            de[(int(tri[i]), int(tri[(i + 1) % 3]))] += 1
    return de


def undirected_edge_counts(faces: np.ndarray) -> Counter:
    ue: Counter = Counter()
    for tri in faces:
        for i in range(3):
            a, b = int(tri[i]), int(tri[(i + 1) % 3])
            ue[(a, b) if a < b else (b, a)] += 1
    return ue


# A representative spread of styles + option sets that exercise the tricky
# code paths: plain walls, twist (spin), inner-wall clamping near the drain,
# and decorative radial modulation.
CASES = [
    ("SuperformulaBlossom", {}),
    ("FourierBloom", {}),
    ("SpiralRidges", {"spiral_turns": 1.5, "spin_turns": 0.5}),
    ("SuperellipseMorph", {}),
    ("HarmonicRipple", {"hr_petals": 9}),
    ("SuperformulaBlossom", {"spin_turns": 1.0, "spin_phase_deg": 30.0}),
]


def _build(style_name: str, opts: dict):
    style_fn = STYLES[style_name][0]
    return build_pot_mesh(
        H=120, Rt=70, Rb=50,
        t_wall=3, t_bottom=3, r_drain=10,
        expn=1.1, n_theta=60, n_z=30,
        r_outer_fn=style_fn, style_opts=opts,
    )


@pytest.mark.parametrize("style_name,opts", CASES)
def test_mesh_is_manifold(style_name, opts):
    verts, faces, _ = _build(style_name, opts)
    ue = undirected_edge_counts(faces)
    non_manifold = [e for e, c in ue.items() if c != 2]
    assert not non_manifold, (
        f"{style_name} {opts}: {len(non_manifold)} non-manifold edges"
    )


@pytest.mark.parametrize("style_name,opts", CASES)
def test_mesh_is_consistently_oriented(style_name, opts):
    """Every directed edge must appear exactly once (orientable, consistent)."""
    verts, faces, _ = _build(style_name, opts)
    de = directed_edge_counts(faces)
    bad = [e for e, c in de.items() if c != 1]
    assert not bad, (
        f"{style_name} {opts}: {len(bad)} directed edges traversed the same "
        f"way by both adjacent faces (inconsistent winding)"
    )


@pytest.mark.parametrize("style_name,opts", CASES)
def test_mesh_normals_point_outward(style_name, opts):
    """Closed solid must enclose positive signed volume (outward normals)."""
    verts, faces, _ = _build(style_name, opts)
    vol = signed_volume(verts, faces)
    assert vol > 0.0, (
        f"{style_name} {opts}: signed volume {vol:.1f} <= 0 — mesh is "
        f"inverted (normals point inward), breaking Rhino/Grasshopper import"
    )


@pytest.mark.parametrize("style_name,opts", CASES)
def test_mesh_has_no_degenerate_faces(style_name, opts):
    verts, faces, _ = _build(style_name, opts)
    v0 = verts[faces[:, 0]]
    v1 = verts[faces[:, 1]]
    v2 = verts[faces[:, 2]]
    areas = 0.5 * np.linalg.norm(np.cross(v1 - v0, v2 - v0), axis=1)
    degenerate = int(np.sum(areas < 1e-9))
    assert degenerate == 0, f"{style_name} {opts}: {degenerate} degenerate faces"


def _ray_hits(origin: np.ndarray, direction: np.ndarray,
              verts: np.ndarray, faces: np.ndarray) -> int:
    """Count forward ray/triangle intersections (Möller–Trumbore, vectorized).

    For a closed watertight mesh, an odd count means ``origin`` is inside the
    solid, an even count means outside (Jordan-curve / parity rule).
    """
    eps = 1e-9
    v0 = verts[faces[:, 0]]
    e1 = verts[faces[:, 1]] - v0
    e2 = verts[faces[:, 2]] - v0
    h = np.cross(direction, e2)
    a = np.einsum("ij,ij->i", e1, h)
    parallel = np.abs(a) < eps
    inv = np.where(parallel, 0.0, 1.0 / np.where(parallel, 1.0, a))
    s = origin - v0
    u = inv * np.einsum("ij,ij->i", s, h)
    q = np.cross(s, e1)
    v = inv * np.einsum("ij,j->i", q, direction)
    t = inv * np.einsum("ij,ij->i", e2, q)
    hit = (~parallel) & (u >= 0) & (u <= 1) & (v >= 0) & (u + v <= 1) & (t > eps)
    return int(np.count_nonzero(hit))


def _is_inside(point: np.ndarray, verts: np.ndarray, faces: np.ndarray) -> bool:
    # Average parity over a few directions to be robust against grazing rays.
    dirs = np.array([
        [0.123, 0.456, 0.881],
        [-0.741, 0.330, 0.585],
        [0.512, -0.802, 0.306],
    ])
    dirs /= np.linalg.norm(dirs, axis=1, keepdims=True)
    votes = sum((_ray_hits(point, d, verts, faces) % 2) for d in dirs)
    return votes >= 2  # majority


@pytest.mark.parametrize("style_name,opts", CASES)
def test_face_normals_point_out_of_solid(style_name, opts):
    """Rigorous local check: stepping along +normal exits the solid.

    Unlike a radial heuristic (which fails on petalled/decorative surfaces
    where normals are strongly tangential), this samples faces across the mesh
    and verifies, via ray-cast parity, that a small step along the face normal
    lands *outside* the solid and a step against it lands *inside*.
    """
    verts, faces, _ = _build(style_name, opts)
    v0 = verts[faces[:, 0]]
    v1 = verts[faces[:, 1]]
    v2 = verts[faces[:, 2]]
    normals = np.cross(v1 - v0, v2 - v0)
    lens = np.linalg.norm(normals, axis=1)
    normals = normals / lens[:, None]
    centers = (v0 + v1 + v2) / 3.0

    rng = np.random.default_rng(0)
    sample = rng.choice(len(faces), size=min(40, len(faces)), replace=False)
    eps = 0.05  # mm; smaller than wall thickness (3 mm)
    correct = 0
    for i in sample:
        c = centers[i]
        n = normals[i]
        outside_ok = not _is_inside(c + eps * n, verts, faces)
        inside_ok = _is_inside(c - eps * n, verts, faces)
        if outside_ok and inside_ok:
            correct += 1
    frac = correct / len(sample)
    assert frac > 0.9, (
        f"{style_name} {opts}: only {frac:.0%} of sampled faces have normals "
        f"pointing out of the solid"
    )
