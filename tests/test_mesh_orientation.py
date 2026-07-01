"""Mesh orientation / export-quality regression tests.

For CAD and slicer interchange (Rhino, Grasshopper, PrusaSlicer, Cura) a solid
mesh must be a *consistently oriented, closed, orientable manifold* whose facet
normals point **outward**. Two defects break this:

  1. Inconsistent winding -- two triangles sharing an edge traverse that edge in
     the *same* direction. CAD tools flag these as "naked"/"non-manifold" edges
     even when each edge is topologically shared by two faces.
  2. Global inversion -- every facet is wound so its normal points *inward*
     (negative signed volume). The exported solid is "inside out"; slicers may
     treat void as material and vice-versa.

STL export (ASCII and binary) derives each facet normal directly from vertex
winding, so any winding defect is baked into every exported file. These tests
pin the invariants at the mesh-builder level so exports inherit correct normals.
"""
from __future__ import annotations

from collections import Counter

import numpy as np
import pytest

from potfoundry import build_pot_mesh, STYLES

# A representative spread of parameters, including an "extreme" pot (tall, narrow
# top, wide base, large drain) that stresses the bottom/drain assembly winding.
PARAM_SETS = [
    dict(H=100, Rt=60, Rb=40, t_wall=3, t_bottom=3, r_drain=8, expn=1.1),
    dict(H=200, Rt=30, Rb=80, t_wall=2, t_bottom=3, r_drain=20, expn=2.5),
]

RES = dict(n_theta=72, n_z=40)


def _build(style_name: str, params: dict):
    fn = STYLES[style_name][0]
    return build_pot_mesh(r_outer_fn=fn, style_opts={}, **params, **RES)


def _signed_volume(verts: np.ndarray, faces: np.ndarray) -> float:
    v0, v1, v2 = verts[faces[:, 0]], verts[faces[:, 1]], verts[faces[:, 2]]
    return float(np.sum(np.einsum("ij,ij->i", v0, np.cross(v1, v2))) / 6.0)


def _edge_directed_counts(faces: np.ndarray) -> Counter:
    directed: Counter = Counter()
    for f in faces:
        for i in range(3):
            a, b = int(f[i]), int(f[(i + 1) % 3])
            directed[(a, b)] += 1
    return directed


@pytest.mark.parametrize("style_name", list(STYLES.keys()))
@pytest.mark.parametrize("params", PARAM_SETS)
class TestMeshOrientation:
    def test_index_manifold(self, style_name, params):
        """Every undirected edge is shared by exactly two faces."""
        verts, faces, _ = _build(style_name, params)
        undirected = Counter()
        for f in faces:
            for i in range(3):
                a, b = int(f[i]), int(f[(i + 1) % 3])
                undirected[tuple(sorted((a, b)))] += 1
        bad = [e for e, c in undirected.items() if c != 2]
        assert not bad, f"{style_name}: {len(bad)} non-manifold edges"

    def test_consistent_winding(self, style_name, params):
        """Each shared edge is traversed once in each direction (orientable)."""
        verts, faces, _ = _build(style_name, params)
        directed = _edge_directed_counts(faces)
        bad = 0
        for (a, b), c in directed.items():
            if a < b:  # inspect each undirected edge once
                if not (directed[(a, b)] == 1 and directed[(b, a)] == 1):
                    bad += 1
        assert bad == 0, f"{style_name}: {bad} inconsistently-wound edges"

    def test_normals_point_outward(self, style_name, params):
        """Signed volume is positive => facet normals point outward."""
        verts, faces, _ = _build(style_name, params)
        vol = _signed_volume(verts, faces)
        assert vol > 0, f"{style_name}: signed volume {vol:.1f} <= 0 (inverted normals)"


def test_exported_binary_stl_normals_match_outward_winding(tmp_path):
    """Binary STL stored normals equal the (now outward) winding normals.

    The STL writer derives each facet normal from vertex winding, so once the
    mesh is outward-oriented the file's stored normals are correct. We verify
    (a) the stored normals equal the unit winding normals facet-for-facet, and
    (b) the solid's signed volume is positive (globally outward). A hollow
    vessel's inner-cavity facets correctly point *inward*, so a naive
    "all normals point away from centroid" check is invalid -- signed volume is
    the right global orientation invariant.
    """
    from potfoundry import write_stl_binary
    import struct

    verts, faces, _ = _build("SuperformulaBlossom", PARAM_SETS[0])
    path = tmp_path / "pot.stl"
    write_stl_binary(str(path), "pot", verts, faces)

    data = path.read_bytes()
    count = struct.unpack_from("<I", data, 80)[0]
    assert count == len(faces)

    # Parse stored per-facet normals from the 50-byte records after the header.
    rec = np.dtype([("n", "<f4", (3,)), ("v", "<f4", (9,)), ("attr", "<u2")])
    facets = np.frombuffer(data, dtype=rec, count=count, offset=84)
    stored = np.asarray(facets["n"], dtype=float)

    v0, v1, v2 = verts[faces[:, 0]], verts[faces[:, 1]], verts[faces[:, 2]]
    wind = np.cross(v1 - v0, v2 - v0)
    lens = np.linalg.norm(wind, axis=1)
    unit = np.zeros_like(wind)
    nz = lens > 0
    unit[nz] = wind[nz] / lens[nz][:, None]

    # Stored normals match winding normals (float32 export tolerance).
    np.testing.assert_allclose(stored, unit, atol=1e-4)

    # Global orientation is outward.
    assert _signed_volume(verts, faces) > 0
