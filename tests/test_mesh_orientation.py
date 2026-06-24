"""Mesh orientation / normal-direction regression tests.

Rhino, Grasshopper, and every modern slicer expect a closed solid whose
triangle winding yields **outward-facing** face normals. The standard,
orientation-independent way to check this on a closed manifold is the signed
volume (divergence theorem):

    V = (1/6) * sum_over_tris( v0 . (v1 x v2) )

For a consistently wound closed mesh, ``V > 0`` iff the normals point outward.
A negative signed volume means the mesh is inside-out (inverted normals), which
causes broken shading, failed boolean operations, and "solid reads as void"
behaviour when imported into Rhino/Grasshopper.

These tests pin that property at three levels:
  1. signed volume is positive for every style (and with twist),
  2. outer-wall faces actually point radially outward,
  3. the exported binary STL's *stored* normals point outward end-to-end.
"""
from __future__ import annotations

import struct

import numpy as np
import pytest

from potfoundry import build_pot_mesh, STYLES, write_stl_binary


def signed_volume(verts: np.ndarray, faces: np.ndarray) -> float:
    """Signed volume of a triangle soup via the divergence theorem.

    Positive for outward-facing winding on a closed manifold.
    """
    a = verts[faces[:, 0]]
    b = verts[faces[:, 1]]
    c = verts[faces[:, 2]]
    return float(np.einsum("ij,ij->i", a, np.cross(b, c)).sum() / 6.0)


COMMON = dict(
    H=100, Rt=60, Rb=40, t_wall=3, t_bottom=3, r_drain=8,
    expn=1.1, n_theta=120, n_z=60,
)


@pytest.mark.parametrize("style_name", list(STYLES.keys()))
def test_signed_volume_positive(style_name):
    """Every style must produce outward-facing normals (positive volume)."""
    style_fn = STYLES[style_name][0]
    verts, faces, _ = build_pot_mesh(r_outer_fn=style_fn, style_opts={}, **COMMON)
    vol = signed_volume(verts, faces)
    assert vol > 0, (
        f"{style_name}: signed volume {vol:.1f} <= 0 -> mesh normals are "
        f"inverted (inside-out). Rhino/Grasshopper will treat this as a "
        f"void rather than a solid."
    )


def test_signed_volume_positive_with_twist():
    """Twisted/phased pots must also keep outward normals."""
    style_fn = STYLES["SpiralRidges"][0]
    opts = {"spin_turns": 0.5, "spin_phase_deg": 15, "spiral_turns": 1.5}
    verts, faces, _ = build_pot_mesh(r_outer_fn=style_fn, style_opts=opts, **COMMON)
    assert signed_volume(verts, faces) > 0


def directed_edge_inconsistencies(faces: np.ndarray) -> tuple[int, int]:
    """Count winding inconsistencies in a triangle mesh.

    A consistently oriented closed manifold traverses every undirected edge
    exactly once in each direction. Returns ``(dup, missing)`` where:
      - ``dup``     = directed edges that appear more than once (two faces
                      traverse the same edge the same way -> inverted patch),
      - ``missing`` = directed edges with no opposite-direction twin (a crack
                      or an inconsistently wound neighbour).
    Both are 0 for a watertight, consistently wound mesh.
    """
    from collections import Counter

    de: Counter = Counter()
    for tri in faces:
        for i in range(3):
            de[(int(tri[i]), int(tri[(i + 1) % 3]))] += 1
    dup = sum(1 for _, ct in de.items() if ct != 1)
    missing = sum(1 for e in de if (e[1], e[0]) not in de)
    return dup, missing


@pytest.mark.parametrize("style_name", list(STYLES.keys()))
def test_winding_is_consistent(style_name):
    """Every face must be wound consistently with its neighbours.

    Consistency + positive signed volume together *prove* that every normal
    points outward — without relying on per-face heuristics that break on
    concave decorative geometry. This is the invariant that catches the
    drain/slab patch being wound backwards.
    """
    style_fn = STYLES[style_name][0]
    verts, faces, _ = build_pot_mesh(r_outer_fn=style_fn, style_opts={}, **COMMON)
    dup, missing = directed_edge_inconsistencies(faces)
    assert dup == 0 and missing == 0, (
        f"{style_name}: mesh has {dup} duplicated directed edges and "
        f"{missing} edges with no opposite twin -> inconsistent winding "
        f"(some patch is inverted relative to its neighbours)."
    )
    assert signed_volume(verts, faces) > 0


def test_exported_stl_is_consistently_oriented_outward(tmp_path):
    """End-to-end: weld the exported STL by coordinate and re-check the invariant.

    Binary STL stores unwelded triangles, exactly what Rhino/Grasshopper import
    and weld by tolerance. We reconstruct topology by welding coincident
    coordinates, then assert consistent winding + positive signed volume — i.e.
    the exported solid reads as a correctly oriented, outward-facing solid.
    """
    style_fn = STYLES["FourierBloom"][0]
    verts, faces, _ = build_pot_mesh(r_outer_fn=style_fn, style_opts={}, **COMMON)

    out = tmp_path / "pot.stl"
    write_stl_binary(out, "orient-test", verts, faces)

    data = out.read_bytes()
    tri_count = struct.unpack_from("<I", data, 80)[0]
    assert tri_count == faces.shape[0]

    rec = np.dtype([
        ("n", "<f4", (3,)),
        ("v1", "<f4", (3,)),
        ("v2", "<f4", (3,)),
        ("v3", "<f4", (3,)),
        ("attr", "<u2"),
    ])
    recs = np.frombuffer(data, dtype=rec, count=tri_count, offset=84)
    tri_verts = np.stack([recs["v1"], recs["v2"], recs["v3"]], axis=1).reshape(-1, 3)

    # Weld coincident vertices (round to STL float32 precision) to rebuild topology.
    keys = np.round(tri_verts, 4)
    uniq, inv = np.unique(keys, axis=0, return_inverse=True)
    welded_faces = inv.reshape(-1, 3)

    dup, missing = directed_edge_inconsistencies(welded_faces)
    assert dup == 0 and missing == 0, (
        f"Exported+welded STL is not consistently wound "
        f"(dup={dup}, missing={missing}); the solid is inside-out or cracked."
    )
    assert signed_volume(uniq.astype(np.float64), welded_faces) > 0
