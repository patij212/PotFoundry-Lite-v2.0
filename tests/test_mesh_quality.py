"""Mesh-quality tests targeting Rhino / Grasshopper export grade.

Index-level watertightness (every edge shared by exactly two faces) is
necessary but *not sufficient* for a clean import into Rhino / Grasshopper.
Those tools also require:

1. **Consistent winding** — across every shared edge the two adjacent faces
   traverse the edge in opposite directions. Inconsistent winding shows up in
   Rhino as "flipped" faces and breaks ``Mesh`` boolean / ``MeshRepair`` ops.
2. **Outward-facing normals** — a closed solid must enclose a *positive*
   signed volume (divergence theorem). A negative signed volume means the
   whole mesh is inside-out; slicers and Rhino then report inverted normals.
3. **No degenerate faces** — zero-area triangles are dropped or flagged.

These tests exercise the mesh-quality guarantees of ``build_pot_mesh`` and the
reusable helpers in :mod:`potfoundry.core.mesh_quality`.
"""
from __future__ import annotations

import numpy as np
import pytest

from potfoundry import build_pot_mesh, STYLES
from potfoundry.core.mesh_quality import (
    signed_volume,
    winding_defects,
    manifold_report,
)

STYLE_NAMES = list(STYLES.keys())

# A representative spread of option sets, including global twist which
# historically exposed winding/orientation issues at the bottom junctions.
OPT_VARIANTS = [
    ("plain", {}),
    ("twist", {"spin_turns": 0.5, "spin_phase_deg": 15.0}),
]


def _build(style_name: str, opts: dict):
    fn = STYLES[style_name][0]
    verts, faces, _ = build_pot_mesh(
        H=100, Rt=60, Rb=40,
        t_wall=3, t_bottom=3, r_drain=8,
        expn=1.1, n_theta=120, n_z=60,
        r_outer_fn=fn, style_opts=opts,
    )
    return verts, faces


def _degenerate_count(verts: np.ndarray, faces: np.ndarray) -> int:
    v0 = verts[faces[:, 0]]
    v1 = verts[faces[:, 1]]
    v2 = verts[faces[:, 2]]
    areas = 0.5 * np.linalg.norm(np.cross(v1 - v0, v2 - v0), axis=1)
    return int(np.count_nonzero(areas < 1e-9))


@pytest.mark.parametrize("style_name", STYLE_NAMES)
@pytest.mark.parametrize("label,opts", OPT_VARIANTS)
class TestExportGradeMesh:
    def test_signed_volume_is_positive(self, style_name, label, opts):
        """Closed solid must enclose positive volume (outward normals)."""
        verts, faces = _build(style_name, opts)
        vol = signed_volume(verts, faces)
        assert vol > 0.0, (
            f"{style_name}/{label}: signed volume {vol:.1f} <= 0 -> normals "
            f"point inward (mesh is inside-out for Rhino/Grasshopper)."
        )

    def test_winding_is_globally_consistent(self, style_name, label, opts):
        """Every shared edge is traversed in opposite directions by its two faces."""
        verts, faces = _build(style_name, opts)
        defects = winding_defects(verts, faces)
        assert defects == 0, (
            f"{style_name}/{label}: {defects} inconsistently-wound edges "
            f"(Rhino would flag flipped faces)."
        )

    def test_is_closed_manifold(self, style_name, label, opts):
        """No naked edges, no non-manifold edges (edge shared by >2 faces)."""
        verts, faces = _build(style_name, opts)
        rep = manifold_report(verts, faces)
        assert rep["naked_edges"] == 0, f"{style_name}/{label}: naked edges {rep['naked_edges']}"
        assert rep["nonmanifold_edges"] == 0, (
            f"{style_name}/{label}: non-manifold edges {rep['nonmanifold_edges']}"
        )

    def test_no_degenerate_faces(self, style_name, label, opts):
        verts, faces = _build(style_name, opts)
        assert _degenerate_count(verts, faces) == 0, (
            f"{style_name}/{label}: has zero-area faces"
        )


class TestOrientOutwardRepair:
    """The reusable repair utility must fix arbitrary orientation damage."""

    def _cube(self):
        # Unit cube, 12 triangles, arbitrary (mixed) winding.
        v = np.array([
            [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
            [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
        ], dtype=float)
        f = np.array([
            [0, 1, 2], [0, 2, 3],       # bottom
            [4, 5, 6], [4, 6, 7],       # top
            [0, 1, 5], [0, 5, 4],       # front
            [1, 2, 6], [1, 6, 5],       # right
            [2, 3, 7], [2, 7, 6],       # back
            [3, 0, 4], [3, 4, 7],       # left
        ], dtype=int)
        return v, f

    def test_repairs_inconsistent_winding_and_orients_outward(self):
        from potfoundry.core.mesh_quality import orient_outward, winding_defects, signed_volume
        v, f = self._cube()
        # Damage: flip half the faces so winding is inconsistent.
        damaged = f.copy()
        damaged[::2] = damaged[::2][:, [0, 2, 1]]
        assert winding_defects(v, damaged) > 0

        fixed = orient_outward(v, damaged)
        assert winding_defects(v, fixed) == 0
        assert signed_volume(v, fixed) > 0  # outward
        # Repair must preserve the vertex set of each face (only winding order).
        assert {tuple(sorted(map(int, t))) for t in fixed} == {
            tuple(sorted(map(int, t))) for t in f
        }

    def test_flips_globally_inverted_but_consistent_mesh(self):
        from potfoundry.core.mesh_quality import orient_outward, signed_volume
        v, f = self._cube()
        inverted = f[:, [0, 2, 1]]  # consistently wound but inside-out
        assert signed_volume(v, inverted) < 0
        fixed = orient_outward(v, inverted)
        assert signed_volume(v, fixed) > 0
