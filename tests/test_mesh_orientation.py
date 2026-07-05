"""Mesh orientation / CAD-export-quality tests for PotFoundry.

These tests encode the requirements that Rhino, Grasshopper and other CAD
tools impose on an imported STL/mesh solid, beyond mere watertightness:

1. **Coherent orientation** - every interior edge is shared by exactly two
   faces that traverse it in *opposite* directions. A watertight mesh can
   still be incoherently oriented (adjacent faces wound the same way), which
   Rhino reports as "inconsistent normals" and which breaks boolean ops.

2. **Outward-facing normals** - the closed solid must have positive signed
   volume (divergence theorem). A negative signed volume means the mesh is
   inside-out; slicers and CAD kernels then treat the solid as inverted.

Run with: PYTHONPATH=. pytest tests/test_mesh_orientation.py -v
"""
from __future__ import annotations

from collections import defaultdict

import numpy as np
import pytest

from potfoundry import STYLES, build_pot_mesh
from potfoundry.core.geometry import mesh_signed_volume, orient_mesh_coherently

# A representative parameter set exercised across every style.
BUILD_KW = dict(
    H=100, Rt=60, Rb=40,
    t_wall=3, t_bottom=3, r_drain=8,
    expn=1.1, n_theta=60, n_z=30,
)


def _build(style: str, **overrides):
    fn = STYLES[style][0]
    kw = {**BUILD_KW, **overrides}
    verts, faces, diag = build_pot_mesh(r_outer_fn=fn, style_opts={}, **kw)
    return verts, faces, diag


def signed_volume(verts: np.ndarray, faces: np.ndarray) -> float:
    """Signed volume of a closed triangle mesh (divergence theorem).

    Positive when faces are wound counter-clockwise as seen from outside
    (i.e. normals point outward).
    """
    v0 = verts[faces[:, 0]]
    v1 = verts[faces[:, 1]]
    v2 = verts[faces[:, 2]]
    return float(np.sum(np.einsum("ij,ij->i", v0, np.cross(v1, v2))) / 6.0)


def count_incoherent_edges(faces: np.ndarray) -> int:
    """Number of undirected edges that are *not* coherently oriented.

    An edge is coherent when its two adjacent faces traverse it in opposite
    directions - exactly one (u->v) and one (v->u) directed half-edge.
    """
    half = defaultdict(lambda: [0, 0])  # sorted-key -> [forward, reverse] counts
    for a, b, c in faces:
        for u, v in ((int(a), int(b)), (int(b), int(c)), (int(c), int(a))):
            key = (u, v) if u < v else (v, u)
            idx = 0 if u < v else 1
            half[key][idx] += 1
    incoherent = 0
    for fwd, rev in half.values():
        if not (fwd == 1 and rev == 1):
            incoherent += 1
    return incoherent


@pytest.mark.parametrize("style", list(STYLES.keys()))
def test_mesh_is_coherently_oriented(style):
    """Every interior edge must be shared by two oppositely-wound faces."""
    _verts, faces, _ = _build(style)
    incoherent = count_incoherent_edges(faces)
    assert incoherent == 0, (
        f"{style}: {incoherent} incoherently-oriented edges - adjacent faces "
        f"disagree on winding, Rhino/Grasshopper will report inconsistent normals"
    )


@pytest.mark.parametrize("style", list(STYLES.keys()))
def test_mesh_normals_point_outward(style):
    """Closed solid must have positive signed volume (outward normals)."""
    verts, faces, _ = _build(style)
    vol = signed_volume(verts, faces)
    assert vol > 0.0, (
        f"{style}: signed volume {vol:.1f} <= 0 - mesh is inside-out "
        f"(normals point inward), CAD tools will treat the solid as inverted"
    )


@pytest.mark.parametrize("style", list(STYLES.keys()))
def test_mesh_is_watertight_all_styles(style):
    """Sanity: mesh remains a closed 2-manifold (each edge in exactly 2 faces)."""
    _verts, faces, _ = _build(style)
    counts = defaultdict(int)
    for a, b, c in faces:
        for u, v in ((int(a), int(b)), (int(b), int(c)), (int(c), int(a))):
            counts[(u, v) if u < v else (v, u)] += 1
    open_edges = [e for e, n in counts.items() if n != 2]
    assert not open_edges, f"{style}: {len(open_edges)} non-manifold/open edges"


def test_signed_volume_matches_analytic_scale():
    """Signed volume should be a plausible positive magnitude for the solid.

    A pot ~100mm tall, ~100-120mm across, 3mm walls encloses a shell whose
    material volume is on the order of 1e4-1e5 mm^3. This guards against a
    fix that makes volume positive but geometrically nonsensical.
    """
    verts, faces, _ = _build("SuperformulaBlossom")
    vol = signed_volume(verts, faces)
    assert 1e4 < vol < 5e5, f"signed volume {vol:.1f} outside plausible range"


# --- orient_mesh_coherently repair utility -----------------------------------

def _unit_cube():
    """A correctly-wound (outward), coherently-oriented unit cube mesh."""
    verts = np.array([
        [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
        [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
    ], dtype=float)
    faces = np.array([
        [0, 3, 2], [0, 2, 1],   # bottom (z=0), normal -z
        [4, 5, 6], [4, 6, 7],   # top (z=1), normal +z
        [0, 1, 5], [0, 5, 4],   # front (y=0), normal -y
        [2, 3, 7], [2, 7, 6],   # back (y=1), normal +y
        [1, 2, 6], [1, 6, 5],   # right (x=1), normal +x
        [3, 0, 4], [3, 4, 7],   # left (x=0), normal -x
    ], dtype=int)
    return verts, faces


def test_orient_repairs_globally_inverted_mesh():
    """A fully inside-out mesh is flipped back to outward normals."""
    verts, faces = _unit_cube()
    inverted = faces[:, ::-1]  # reverse every winding -> normals point inward
    assert mesh_signed_volume(verts, inverted) < 0
    repaired = orient_mesh_coherently(verts, inverted)
    assert mesh_signed_volume(verts, repaired) > 0
    assert count_incoherent_edges(repaired) == 0
    # Volume magnitude (the actual solid) is preserved.
    assert mesh_signed_volume(verts, repaired) == pytest.approx(1.0)


def test_orient_repairs_incoherent_mesh():
    """A mesh with a single mis-wound face is made coherent and outward."""
    verts, faces = _unit_cube()
    broken = faces.copy()
    broken[5] = broken[5][::-1]  # flip one face -> incoherent seams
    assert count_incoherent_edges(broken) > 0
    repaired = orient_mesh_coherently(verts, broken)
    assert count_incoherent_edges(repaired) == 0
    assert mesh_signed_volume(verts, repaired) > 0


def test_orient_preserves_already_correct_mesh_topology():
    """Repair keeps a good mesh valid (winding may normalize, volume stable)."""
    verts, faces = _unit_cube()
    repaired = orient_mesh_coherently(verts, faces)
    assert count_incoherent_edges(repaired) == 0
    assert mesh_signed_volume(verts, repaired) == pytest.approx(1.0)
    assert repaired.shape == faces.shape


def test_orient_handles_empty_mesh():
    """Degenerate empty input returns an empty (0, 3) face array."""
    verts = np.zeros((0, 3), dtype=float)
    faces = np.zeros((0, 3), dtype=int)
    out = orient_mesh_coherently(verts, faces)
    assert out.shape == (0, 3)
