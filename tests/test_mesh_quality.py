"""Mesh-quality tests targeting Grasshopper/Rhino export fidelity.

A mesh that imports cleanly as a *valid closed solid* into Rhino/Grasshopper
(or slicers) must satisfy three independent invariants:

1. **Watertight (manifold):** every undirected edge is shared by exactly two
   faces. A hole or a T-junction breaks solid operations downstream.

2. **Consistent winding (orientable):** every *directed* edge appears exactly
   once. If two adjacent faces traverse a shared edge in the same direction,
   their normals disagree and the importer reports flipped/garbage normals.

3. **Outward normals:** the closed surface bounds a positive volume. STL stores
   per-facet normals derived from winding, and Rhino/slicers treat inward
   normals as an inside-out solid.

The pre-existing ``test_golden_meshes.py`` only checks invariant (1). These
tests pin (2) and (3), which were both violated by the hand-wound construction
(the whole mesh was inverted, and two interior seams were mis-wound).

Run with: PYTHONPATH=. pytest tests/test_mesh_quality.py -v
"""
from __future__ import annotations

from collections import Counter

import numpy as np
import pytest

from potfoundry import build_pot_mesh, STYLES
from potfoundry.core.mesh_ops import signed_volume, winding_report


# Parameter sets that exercise the base profile plus optional twist/bell warps.
PARAM_CASES = {
    "plain": {},
    "twisted": {"spin_turns": 0.75, "spin_phase_deg": 20.0},
    "belled": {"bell_amp": 0.18, "bell_center": 0.45, "bell_width": 0.3},
}


def _build(style_name: str, opts: dict, n_theta: int = 72, n_z: int = 36):
    style_fn = STYLES[style_name][0]
    return build_pot_mesh(
        H=100, Rt=60, Rb=40,
        t_wall=3, t_bottom=3, r_drain=8,
        expn=1.1, n_theta=n_theta, n_z=n_z,
        r_outer_fn=style_fn, style_opts=opts,
    )


def _directed_edge_counts(faces: np.ndarray) -> Counter:
    de: Counter = Counter()
    for f in faces:
        a, b, c = int(f[0]), int(f[1]), int(f[2])
        de[(a, b)] += 1
        de[(b, c)] += 1
        de[(c, a)] += 1
    return de


@pytest.mark.parametrize("style_name", list(STYLES.keys()))
@pytest.mark.parametrize("case_name", list(PARAM_CASES.keys()))
class TestExportGradeOrientation:
    """Every style/parameter combination must export as a valid closed solid."""

    def test_watertight(self, style_name, case_name):
        verts, faces, _ = _build(style_name, PARAM_CASES[case_name])
        und: Counter = Counter()
        for f in faces:
            for i in range(3):
                und[tuple(sorted((int(f[i]), int(f[(i + 1) % 3]))))] += 1
        bad = [e for e, c in und.items() if c != 2]
        assert not bad, f"{style_name}/{case_name}: {len(bad)} non-manifold edges"

    def test_consistent_winding(self, style_name, case_name):
        """Each directed edge appears exactly once (globally orientable)."""
        verts, faces, _ = _build(style_name, PARAM_CASES[case_name])
        de = _directed_edge_counts(faces)
        bad = [e for e, c in de.items() if c != 1]
        assert not bad, (
            f"{style_name}/{case_name}: {len(bad)} directed edges traversed "
            f"inconsistently (flipped normals between adjacent faces)"
        )

    def test_normals_point_outward(self, style_name, case_name):
        """Signed volume is positive => normals point out of the material."""
        verts, faces, _ = _build(style_name, PARAM_CASES[case_name])
        vol = signed_volume(verts, faces)
        assert vol > 0, (
            f"{style_name}/{case_name}: signed volume {vol:.1f} <= 0 "
            f"(mesh is inside-out)"
        )


def test_signed_volume_matches_material_volume():
    """Signed volume should equal the physical wall+base material volume.

    A correctly oriented hollow pot encloses only its solid material, so the
    signed volume must be a small positive number on the order of the wall and
    base volume -- not the full bounding solid, and never negative.
    """
    verts, faces, _ = _build("SuperformulaBlossom", {})
    vol = signed_volume(verts, faces)
    # Outer bounding solid is ~ pi * 60^2 * 100 ~ 1.13e6 mm^3; the hollow pot's
    # material is far smaller. Bracket it loosely but on the correct side of 0.
    assert 50_000 < vol < 400_000, f"Unexpected material volume {vol:.0f}"


def test_winding_report_clean_on_built_mesh():
    verts, faces, _ = _build("FourierBloom", {})
    report = winding_report(verts, faces)
    assert report["non_manifold_edges"] == 0
    assert report["inconsistent_edges"] == 0
    assert report["signed_volume"] > 0
    assert report["is_export_ready"] is True
