"""Tests for smooth (area-weighted) vertex normals.

Rhino and Grasshopper render meshes with *vertex* normals. Binary STL only
carries per-face normals, so a pot imported from STL looks faceted. To reach
"Rhino/Grasshopper export quality" we need smooth vertex normals computed from
the watertight triangle mesh.

These tests pin the contract for ``compute_vertex_normals``:
  - shape (N, 3), unit length
  - outward-facing on the outer wall
  - smooth across the angular seam (the mesh shares seam vertices via modular
    indexing, so a correct implementation is automatically continuous there)
  - noticeably smoother than per-face normals on a curved wall
"""
from __future__ import annotations

import numpy as np

from potfoundry import build_pot_mesh, STYLES
from potfoundry.core.io.normals import compute_vertex_normals


def _build(style="SuperformulaBlossom", **over):
    cfg = dict(
        H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
        expn=1.1, n_theta=96, n_z=48,
    )
    cfg.update(over)
    fn = STYLES[style][0]
    return build_pot_mesh(r_outer_fn=fn, style_opts={}, **cfg)


def _outer_wall_ring(n_theta, n_z, row):
    """Vertex indices for one outer-wall ring.

    build_pot_mesh appends the (n_z+1) outer-wall rings first, each as n_theta
    vertices in ascending-angle order (golden tests pin this layout). Ring
    ``row`` therefore occupies a contiguous index block.
    """
    start = row * n_theta
    return np.arange(start, start + n_theta)


def test_shape_and_unit_length():
    verts, faces, _ = _build()
    vn = compute_vertex_normals(verts, faces)
    assert vn.shape == verts.shape
    lengths = np.linalg.norm(vn, axis=1)
    # Every referenced vertex must get a unit normal.
    assert np.all(lengths > 0.999)
    assert np.all(lengths < 1.001)


def test_outer_wall_normals_point_outward():
    n_theta, n_z = 96, 48
    verts, faces, _ = _build(n_theta=n_theta, n_z=n_z)
    vn = compute_vertex_normals(verts, faces)

    # Mid-height outer-wall ring.
    ring = _outer_wall_ring(n_theta, n_z, row=n_z // 2)
    radial = verts[ring].copy()
    radial[:, 2] = 0.0
    radial /= np.linalg.norm(radial, axis=1, keepdims=True)
    dots = np.einsum("ij,ij->i", vn[ring, :2], radial[:, :2])
    # Every outer-wall vertex should clearly face outward.
    assert np.mean(dots > 0.3) > 0.95


def test_smoother_than_face_normals():
    """Vertex normals should vary far less between angular neighbours than the
    per-face normals do — that is the whole point of smooth shading."""
    n_theta, n_z = 96, 48
    verts, faces, _ = _build(n_theta=n_theta, n_z=n_z)
    vn = compute_vertex_normals(verts, faces)

    # Adjacent face normals on the wall.
    v0 = verts[faces[:, 0]]; v1 = verts[faces[:, 1]]; v2 = verts[faces[:, 2]]
    fn = np.cross(v1 - v0, v2 - v0)
    fn /= np.linalg.norm(fn, axis=1, keepdims=True) + 1e-12
    centers = (v0 + v1 + v2) / 3.0
    wall = (centers[:, 2] > 20) & (centers[:, 2] < 100)
    face_dot = np.einsum("ij,ij->i", fn[wall][:-1], fn[wall][1:])
    face_dispersion = 1.0 - np.mean(face_dot)

    # Vertex normals around one outer-wall ring, already in angular order.
    ring = _outer_wall_ring(n_theta, n_z, row=n_z // 2)
    vdot = np.einsum("ij,ij->i", vn[ring][:-1], vn[ring][1:])
    vert_dispersion = 1.0 - np.mean(vdot)

    assert vert_dispersion < face_dispersion


def test_seam_is_continuous():
    """The angular seam (theta=0) shares vertices, so normals must be identical
    when re-evaluated — i.e. there are no duplicate seam vertices with split
    normals. We assert no two distinct vertices share a position but differ in
    normal."""
    verts, faces, _ = _build()
    vn = compute_vertex_normals(verts, faces)
    # Group by rounded position; any coincident vertices must share a normal.
    from collections import defaultdict
    groups: dict = defaultdict(list)
    for i, p in enumerate(np.round(verts, 5)):
        groups[tuple(p)].append(i)
    for idxs in groups.values():
        if len(idxs) > 1:
            base = vn[idxs[0]]
            for j in idxs[1:]:
                assert np.allclose(vn[j], base, atol=1e-6)
