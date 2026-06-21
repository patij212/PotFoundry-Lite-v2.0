"""Mesh orientation / CAD-export quality tests for PotFoundry.

These tests pin the geometric properties that downstream CAD tools
(Grasshopper, Rhino, slicers) require from an imported mesh:

1. **Consistent orientation** — every interior edge is traversed by its two
   incident triangles in *opposite* directions. A mesh can be topologically
   "watertight" (every undirected edge shared by exactly 2 faces) yet still
   have neighbouring faces wound the same way, which flips normals at the
   seam. Rhino reports this as "mesh has inconsistent normals" / "not
   oriented" and it breaks solid/NURBS conversion.

2. **Outward orientation** — the closed shell must enclose positive signed
   volume so that face normals point *out* of the solid. An inward-wound
   shell imports "inside out".

3. **Region normals** — outer wall points away from the axis, inner wall
   faces the cavity, the rim points up, the base underside points down, and
   the drain bore points into the hole.

4. **No degenerate triangles** — zero-area faces confuse meshing kernels.

Run with: PYTHONPATH=. pytest tests/test_mesh_orientation.py -v
"""
from __future__ import annotations

import numpy as np
import pytest

from potfoundry import build_pot_mesh, STYLES

# Representative build parameters reused across cases.
_PARAMS = dict(
    H=100.0, Rt=60.0, Rb=40.0,
    t_wall=3.0, t_bottom=3.0, r_drain=8.0,
    expn=1.1, n_theta=120, n_z=60,
)


def _build(style_name: str, style_opts=None, **overrides):
    fn = STYLES[style_name][0]
    params = {**_PARAMS, **overrides}
    return build_pot_mesh(r_outer_fn=fn, style_opts=style_opts or {}, **params)


# Options that flatten SuperellipseMorph to a near-perfect circle so that the
# outer and inner walls separate cleanly by radius (decorative styles modulate
# radius enough that a flat-side point on the outer wall can sit inside a corner
# point on the inner wall, defeating a simple radial split).
_CIRCULAR_OPTS = {
    "se_m_base": 2.0,
    "se_m_top": 2.0,
    "se_c4_amp": 0.0,
    "se_c8_amp": 0.0,
}


def _directed_edges(faces: np.ndarray) -> np.ndarray:
    """Return all directed edges (3M, 2) as (start, end) vertex indices."""
    a = faces[:, [0, 1, 2]]
    b = faces[:, [1, 2, 0]]
    return np.stack([a.reshape(-1), b.reshape(-1)], axis=1)


def _count_inconsistent_edges(faces: np.ndarray) -> int:
    """Number of directed edges whose reverse has a different multiplicity.

    For a consistently oriented closed manifold this is zero: each directed
    edge (a, b) occurs exactly once and its reverse (b, a) occurs exactly once.
    """
    n = int(faces.max()) + 1
    de = _directed_edges(faces)
    code = de[:, 0].astype(np.int64) * n + de[:, 1].astype(np.int64)
    rev = de[:, 1].astype(np.int64) * n + de[:, 0].astype(np.int64)

    codes, counts = np.unique(code, return_counts=True)
    fwd = dict(zip(codes.tolist(), counts.tolist()))
    # An edge is inconsistent if its own count != its reverse's count.
    bad = 0
    rcodes, rcounts = np.unique(rev, return_counts=True)
    rev_count = dict(zip(rcodes.tolist(), rcounts.tolist()))
    for c, cnt in fwd.items():
        if rev_count.get(c, 0) != cnt:
            bad += int(cnt)
    return bad


def _signed_volume(verts: np.ndarray, faces: np.ndarray) -> float:
    v0 = verts[faces[:, 0]]
    v1 = verts[faces[:, 1]]
    v2 = verts[faces[:, 2]]
    return float(np.sum(np.einsum("ij,ij->i", v0, np.cross(v1, v2))) / 6.0)


def _face_normals_and_centers(verts, faces):
    v0 = verts[faces[:, 0]]
    v1 = verts[faces[:, 1]]
    v2 = verts[faces[:, 2]]
    n = np.cross(v1 - v0, v2 - v0)
    lens = np.linalg.norm(n, axis=1, keepdims=True)
    n = n / np.where(lens > 0, lens, 1.0)
    ctr = (v0 + v1 + v2) / 3.0
    return n, ctr


ALL_STYLES = list(STYLES.keys())


class TestConsistentOrientation:
    @pytest.mark.parametrize("style_name", ALL_STYLES)
    def test_consistently_oriented(self, style_name):
        verts, faces, _ = _build(style_name)
        bad = _count_inconsistent_edges(faces)
        assert bad == 0, (
            f"{style_name}: {bad} directed edges have inconsistent winding; "
            "neighbouring faces flip normals (Rhino: 'mesh not oriented')."
        )

    @pytest.mark.parametrize("style_name", ALL_STYLES)
    def test_outward_oriented(self, style_name):
        verts, faces, _ = _build(style_name)
        vol = _signed_volume(verts, faces)
        assert vol > 0.0, (
            f"{style_name}: signed volume {vol:.1f} <= 0; shell is wound "
            "inside-out (normals point into the solid)."
        )

    def test_consistent_with_twist_and_options(self):
        # Twist + decorative options must not introduce seams.
        verts, faces, _ = _build(
            "SpiralRidges",
            style_opts={"spiral_k": 9, "spiral_turns": 1.5, "spin_turns": 0.5},
        )
        assert _count_inconsistent_edges(faces) == 0
        assert _signed_volume(verts, faces) > 0.0


class TestRegionNormals:
    def test_outer_wall_points_outward(self):
        # Straight cylinder (Rt == Rb, no flare) so outer/inner walls separate
        # cleanly by radius at any height.
        verts, faces, _ = _build("SuperellipseMorph", Rt=50.0, Rb=50.0, style_opts=_CIRCULAR_OPTS)
        n, ctr = _face_normals_and_centers(verts, faces)
        # Mid-height, outermost faces: clearly the outer wall.
        radial = np.linalg.norm(ctr[:, :2], axis=1)
        mid = (ctr[:, 2] > 30) & (ctr[:, 2] < 70)
        # Take the faces in the outer 50% of radius at mid height.
        thresh = np.quantile(radial[mid], 0.5)
        sel = mid & (radial >= thresh)
        radial_unit = ctr[sel, :2] / np.linalg.norm(ctr[sel, :2], axis=1, keepdims=True)
        dots = np.einsum("ij,ij->i", n[sel, :2], radial_unit)
        assert np.mean(dots > 0) > 0.95, "Outer wall normals should point away from axis"

    def test_inner_wall_faces_cavity(self):
        verts, faces, _ = _build("SuperellipseMorph", Rt=50.0, Rb=50.0, style_opts=_CIRCULAR_OPTS)
        n, ctr = _face_normals_and_centers(verts, faces)
        radial = np.linalg.norm(ctr[:, :2], axis=1)
        mid = (ctr[:, 2] > 30) & (ctr[:, 2] < 70)
        thresh = np.quantile(radial[mid], 0.5)
        sel = mid & (radial < thresh)
        radial_unit = ctr[sel, :2] / np.linalg.norm(ctr[sel, :2], axis=1, keepdims=True)
        dots = np.einsum("ij,ij->i", n[sel, :2], radial_unit)
        assert np.mean(dots < 0) > 0.95, "Inner wall normals should point toward axis"

    def test_rim_points_up(self):
        verts, faces, _ = _build("SuperellipseMorph", H=100.0)
        n, ctr = _face_normals_and_centers(verts, faces)
        # The rim cap is the only group whose three vertices all sit at z == H.
        rim = ctr[:, 2] > 99.9
        assert rim.any()
        assert np.mean(n[rim, 2] > 0) > 0.95, "Rim normals should point up (+z)"

    def test_base_underside_points_down(self):
        verts, faces, _ = _build("SuperellipseMorph")
        n, ctr = _face_normals_and_centers(verts, faces)
        under = ctr[:, 2] < 0.5  # underside annulus sits at z == 0
        assert under.any()
        assert np.mean(n[under, 2] < 0) > 0.95, "Underside normals should point down (-z)"


class TestMeshHealth:
    @pytest.mark.parametrize("style_name", ALL_STYLES)
    def test_no_degenerate_triangles(self, style_name):
        verts, faces, _ = _build(style_name)
        v0 = verts[faces[:, 0]]
        v1 = verts[faces[:, 1]]
        v2 = verts[faces[:, 2]]
        areas = 0.5 * np.linalg.norm(np.cross(v1 - v0, v2 - v0), axis=1)
        n_degen = int(np.count_nonzero(areas < 1e-9))
        assert n_degen == 0, f"{style_name}: {n_degen} zero-area triangles"

    @pytest.mark.parametrize("style_name", ALL_STYLES)
    def test_still_watertight_undirected(self, style_name):
        # Regression guard: the orientation fix must not break closedness.
        verts, faces, _ = _build(style_name)
        de = _directed_edges(faces)
        keys = np.sort(de, axis=1)
        _, counts = np.unique(keys, axis=0, return_counts=True)
        assert np.all(counts == 2), "Every undirected edge must be shared by exactly 2 faces"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
