"""Mesh orientation contract: faces must wind outward.

A solid mesh is correctly oriented when every face normal points *out* of the
material (away from the enclosed volume). By the divergence theorem this means
the signed volume of the closed mesh is positive.

This was historically wrong: build_pot_mesh produced consistently *inward*
winding (negative signed volume). Slicers silently auto-repair STL orientation,
so the bug was invisible to 3D printing — but Rhino and Grasshopper respect
face orientation, so an inverted mesh imports "inside-out" and breaks shading,
booleans, and shelling. These tests pin the correct orientation for export.
"""
from __future__ import annotations

import numpy as np
import pytest

from potfoundry import build_pot_mesh, STYLES


def signed_volume(verts: np.ndarray, faces: np.ndarray) -> float:
    v0 = verts[faces[:, 0]]
    v1 = verts[faces[:, 1]]
    v2 = verts[faces[:, 2]]
    return float(np.einsum("ij,ij->i", v0, np.cross(v1, v2)).sum() / 6.0)


@pytest.mark.parametrize("style_name", list(STYLES.keys()))
def test_signed_volume_positive(style_name):
    fn = STYLES[style_name][0]
    verts, faces, _ = build_pot_mesh(
        H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
        expn=1.1, n_theta=64, n_z=32, r_outer_fn=fn, style_opts={},
    )
    assert signed_volume(verts, faces) > 0.0, (
        f"{style_name} mesh is wound inward (negative signed volume)"
    )


def test_outer_wall_faces_point_outward():
    fn = STYLES["SuperformulaBlossom"][0]
    n_theta, n_z = 64, 32
    verts, faces, _ = build_pot_mesh(
        H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
        expn=1.1, n_theta=n_theta, n_z=n_z, r_outer_fn=fn, style_opts={},
    )
    v0 = verts[faces[:, 0]]; v1 = verts[faces[:, 1]]; v2 = verts[faces[:, 2]]
    fnorm = np.cross(v1 - v0, v2 - v0)
    fnorm /= np.linalg.norm(fnorm, axis=1, keepdims=True) + 1e-12
    centers = (v0 + v1 + v2) / 3.0

    nouter = (n_z + 1) * n_theta
    all_outer = np.all(faces < nouter, axis=1)
    mid = (centers[:, 2] > 30) & (centers[:, 2] < 90)
    sel = all_outer & mid
    radial = centers[sel].copy(); radial[:, 2] = 0.0
    radial /= np.linalg.norm(radial, axis=1, keepdims=True)
    dots = np.einsum("ij,ij->i", fnorm[sel, :2], radial[:, :2])
    assert np.mean(dots > 0) > 0.95
