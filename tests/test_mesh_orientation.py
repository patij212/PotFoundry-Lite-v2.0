"""Mesh orientation invariants for CAD export quality (Rhino / Grasshopper).

A triangle mesh imports cleanly into Rhino/Grasshopper (and slicers, and any
tool that relies on face normals for shading, boolean ops, or thickness
analysis) only when it is a *consistently oriented*, closed manifold with
outward-facing normals. Two invariants capture this precisely:

1. **Global orientation consistency** — every *directed* edge ``(a, b)`` appears
   exactly once across all faces. If it appears twice (or an edge and its
   reverse both appear more than once), two adjacent triangles disagree on which
   way is "out", producing the black/inside-out patches Rhino shows on import.

2. **Outward orientation** — the mesh's signed volume (sum of tetrahedron
   volumes formed with the origin) is positive, meaning normals point away from
   the enclosed solid rather than into it.

These are stronger than the existing ``test_mesh_is_watertight`` (which only
checks *undirected* edges appear twice — that passes even when caps are wound
backwards) and than ``test_mesh_has_consistent_normals`` (which currently only
checks normals are non-zero).
"""
from __future__ import annotations

from collections import Counter

import numpy as np
import pytest

from potfoundry import STYLES, build_pot_mesh

STYLE_NAMES = list(STYLES.keys())

# A representative export configuration shared across the orientation checks.
_PARAMS = dict(
    H=100, Rt=60, Rb=40,
    t_wall=3, t_bottom=3, r_drain=8,
    expn=1.1, n_theta=60, n_z=30,
)


def _signed_volume(verts: np.ndarray, faces: np.ndarray) -> float:
    """Signed volume via the divergence theorem (positive => outward normals)."""
    v0 = verts[faces[:, 0]]
    v1 = verts[faces[:, 1]]
    v2 = verts[faces[:, 2]]
    return float(np.einsum("ij,ij->i", v0, np.cross(v1, v2)).sum() / 6.0)


def _bad_directed_edges(faces: np.ndarray) -> int:
    """Count directed edges that do not appear exactly once (0 => consistent)."""
    counts: Counter[tuple[int, int]] = Counter()
    for f in faces:
        for i in range(3):
            counts[(int(f[i]), int(f[(i + 1) % 3]))] += 1
    return sum(1 for c in counts.values() if c != 1)


@pytest.mark.parametrize("style_name", STYLE_NAMES)
def test_orientation_is_globally_consistent(style_name: str) -> None:
    """Every directed edge appears exactly once (no back-to-front adjacent faces)."""
    fn = STYLES[style_name][0]
    verts, faces, _ = build_pot_mesh(r_outer_fn=fn, style_opts={}, **_PARAMS)
    bad = _bad_directed_edges(faces)
    assert bad == 0, (
        f"{style_name}: {bad} directed edges are not unique — mesh orientation "
        "is inconsistent (adjacent faces disagree on the outward direction)."
    )


# Non-default configurations that exercise twist and heavy style modulation —
# orientation is topological so these must hold too, but they guard against a
# future change coupling winding to geometry (e.g. a per-face reorder).
_EXTRA_OPTS = {
    "twist": {"spin_turns": 2.0, "spin_phase_deg": 30.0},
    "extreme_superformula": {"sf_m_top": 16.0, "sf_n1": 0.2},
    "bell": {"bell_amp": 0.4, "bell_center": 0.5},
}


@pytest.mark.parametrize("label", list(_EXTRA_OPTS))
def test_orientation_holds_under_twist_and_modulation(label: str) -> None:
    """Consistency + outward orientation survive twist and strong modulation."""
    fn = STYLES["SuperformulaBlossom"][0]
    verts, faces, _ = build_pot_mesh(
        r_outer_fn=fn, style_opts=_EXTRA_OPTS[label], **_PARAMS
    )
    assert _bad_directed_edges(faces) == 0, f"{label}: inconsistent orientation"
    assert _signed_volume(verts, faces) > 0, f"{label}: mesh is inside-out"


@pytest.mark.parametrize("style_name", STYLE_NAMES)
def test_normals_point_outward(style_name: str) -> None:
    """Signed volume is positive => face normals point outward from the solid."""
    fn = STYLES[style_name][0]
    verts, faces, _ = build_pot_mesh(r_outer_fn=fn, style_opts={}, **_PARAMS)
    vol = _signed_volume(verts, faces)
    assert vol > 0, (
        f"{style_name}: signed volume {vol:.1f} <= 0 — mesh is inside-out; "
        "normals point into the solid instead of outward."
    )


def test_outer_wall_normals_face_away_from_axis() -> None:
    """Outer-wall face normals have a positive radial component (point outward).

    Outer-wall triangles are isolated exactly via the builder's vertex layout:
    the outer rings are emitted first, so their vertices occupy the leading
    ``(n_z + 1) * n_theta`` indices. A face whose three vertices all fall in that
    range is an outer-wall quad half (the rim mixes outer + inner vertices and is
    excluded). This avoids confusing outer-wall faces with the nearby inner wall,
    whose normals correctly point *toward* the axis.
    """
    fn = STYLES["SuperformulaBlossom"][0]
    verts, faces, _ = build_pot_mesh(r_outer_fn=fn, style_opts={}, **_PARAMS)

    n_outer = (_PARAMS["n_z"] + 1) * _PARAMS["n_theta"]
    outer_wall = np.all(faces < n_outer, axis=1)
    assert outer_wall.any(), "expected some outer-wall faces to test"

    of = faces[outer_wall]
    v0 = verts[of[:, 0]]
    v1 = verts[of[:, 1]]
    v2 = verts[of[:, 2]]
    normals = np.cross(v1 - v0, v2 - v0)
    centers = (v0 + v1 + v2) / 3.0

    radial = centers.copy()
    radial[:, 2] = 0.0
    radial_len = np.linalg.norm(radial, axis=1)
    keep = radial_len > 1.0
    radial_unit = radial[keep] / radial_len[keep, None]
    dots = np.einsum("ij,ij->i", normals[keep], radial_unit)
    outward_fraction = float((dots > 0).mean())
    assert outward_fraction > 0.99, (
        "Outer-wall normals should point away from the Z axis; only "
        f"{outward_fraction:.1%} do."
    )
