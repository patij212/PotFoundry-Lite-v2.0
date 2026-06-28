"""CAD-grade mesh quality tests (Rhino/Grasshopper import quality).

These tests go beyond the existing topological watertight check. When a mesh is
imported into Rhino/Grasshopper (or any solid-modelling kernel), the importer
flags meshes that have any of:

  * naked (boundary) edges        -> not closed / not watertight
  * non-manifold edges            -> edge shared by != 2 faces
  * inconsistent face orientation -> some faces wound the wrong way (Rhino
                                     reports "N reversed faces" and the solid is
                                     not a valid closed volume)
  * degenerate (zero-area) faces  -> "bad objects" / sliver triangles
  * inward-facing normals         -> negative enclosed volume

A surface-of-revolution vase generator must produce a closed, consistently
oriented manifold with outward normals across *every* style and across the
inner-wall clamping regime (deep concave styles + large drain holes), not just
the default config.

These tests exercise :func:`potfoundry.validate_mesh`, the vectorized validator
that backs the export-quality guarantee.
"""
from __future__ import annotations

import numpy as np
import pytest

from potfoundry import STYLES, build_pot_mesh, validate_mesh, signed_volume

ALL_STYLES = list(STYLES.keys())

# A "normal" config and a "stress" config. The stress config maximizes the
# drain hole (just under the Rb - t_wall - 2 limit) with a thick wall and a
# pinched base so the inner wall clamps against the drain across many rings --
# the regime most likely to produce degenerate faces or orientation faults.
NORMAL_CFG = dict(
    H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
    expn=1.1, n_theta=96, n_z=48,
)
STRESS_CFG = dict(
    H=140, Rt=80, Rb=46, t_wall=6, t_bottom=4, r_drain=34,
    expn=1.3, n_theta=120, n_z=60,
)
CONFIGS = [("normal", NORMAL_CFG), ("stress", STRESS_CFG)]


def _build(style_name: str, cfg: dict, opts: dict | None = None):
    style_fn = STYLES[style_name][0]
    return build_pot_mesh(r_outer_fn=style_fn, style_opts=opts or {}, **cfg)


@pytest.mark.parametrize("style_name", ALL_STYLES)
@pytest.mark.parametrize("cfg_name,cfg", CONFIGS)
def test_mesh_is_closed_manifold(style_name, cfg_name, cfg):
    verts, faces, _ = _build(style_name, cfg)
    v = validate_mesh(verts, faces)
    assert v.closed, f"{style_name}/{cfg_name}: {v.naked_edges} naked edges"
    assert v.manifold, f"{style_name}/{cfg_name}: {v.nonmanifold_edges} non-manifold edges"


@pytest.mark.parametrize("style_name", ALL_STYLES)
@pytest.mark.parametrize("cfg_name,cfg", CONFIGS)
def test_mesh_is_consistently_oriented(style_name, cfg_name, cfg):
    verts, faces, _ = _build(style_name, cfg)
    v = validate_mesh(verts, faces)
    assert v.oriented, (
        f"{style_name}/{cfg_name}: {v.reversed_edges} directed edges with wrong "
        f"multiplicity -> inconsistent winding / reversed faces"
    )


@pytest.mark.parametrize("style_name", ALL_STYLES)
@pytest.mark.parametrize("cfg_name,cfg", CONFIGS)
def test_mesh_normals_face_outward(style_name, cfg_name, cfg):
    verts, faces, _ = _build(style_name, cfg)
    v = validate_mesh(verts, faces)
    assert v.outward, (
        f"{style_name}/{cfg_name}: signed volume {v.signed_volume:.3f} <= 0 "
        f"(normals point inward)"
    )


@pytest.mark.parametrize("style_name", ALL_STYLES)
@pytest.mark.parametrize("cfg_name,cfg", CONFIGS)
def test_mesh_has_no_degenerate_faces(style_name, cfg_name, cfg):
    verts, faces, _ = _build(style_name, cfg)
    v = validate_mesh(verts, faces)
    assert v.degenerate_faces == 0, (
        f"{style_name}/{cfg_name}: {v.degenerate_faces} degenerate faces"
    )


@pytest.mark.parametrize("style_name", ALL_STYLES)
@pytest.mark.parametrize("cfg_name,cfg", CONFIGS)
def test_mesh_fully_valid(style_name, cfg_name, cfg):
    """The aggregate guarantee a CAD/slicer import relies on."""
    verts, faces, _ = _build(style_name, cfg)
    v = validate_mesh(verts, faces)
    assert v.is_valid, f"{style_name}/{cfg_name}: invalid mesh {v.as_dict()}"


def test_outer_wall_normals_point_radially_outward():
    """Outer-wall faces must have normals pointing away from the Z-axis."""
    verts, faces, _ = _build("SuperformulaBlossom", NORMAL_CFG)
    n_theta = NORMAL_CFG["n_theta"]
    n_z = NORMAL_CFG["n_z"]
    n_outer_faces = n_z * n_theta * 2  # first block is the outer wall
    of = faces[:n_outer_faces]
    v0 = verts[of[:, 0]]; v1 = verts[of[:, 1]]; v2 = verts[of[:, 2]]
    nrm = np.cross(v1 - v0, v2 - v0)
    ctr = (v0 + v1 + v2) / 3.0
    rad = ctr.copy(); rad[:, 2] = 0.0
    rad /= np.clip(np.linalg.norm(rad, axis=1, keepdims=True), 1e-9, None)
    outward_frac = float(np.mean(np.einsum("ij,ij->i", nrm[:, :2], rad[:, :2]) > 0))
    assert outward_frac == 1.0, f"only {outward_frac:.2%} of outer faces point outward"


def test_validate_mesh_detects_reversed_face():
    """Sanity: the validator flags an intentionally reversed face."""
    verts, faces, _ = _build("SuperformulaBlossom", NORMAL_CFG)
    assert validate_mesh(verts, faces).is_valid
    broken = faces.copy()
    broken[0] = broken[0][::-1]  # reverse a single triangle
    v = validate_mesh(verts, broken)
    assert not v.oriented and v.reversed_edges > 0
