"""Mesh orientation invariants for Grasshopper/Rhino-grade STL export.

A mesh that is merely *watertight* (every undirected edge shared by two faces)
can still import badly into Rhino/Grasshopper: if face winding is inconsistent
or globally inverted, normals point the wrong way, breaking shading, boolean
operations, and "closed solid" detection.

These tests pin two stronger invariants on top of watertightness:

1. **Consistent orientation (orientable surface).** For a closed, consistently
   oriented manifold, every directed edge ``(a, b)`` appears exactly once, and
   its reverse ``(b, a)`` appears exactly once. Any duplicated directed edge
   means two adjacent faces disagree on winding.

2. **Outward orientation.** The signed volume computed from face winding must be
   positive, i.e. STL face normals point *out* of the solid. This is what
   slicers and Rhino expect; negative volume means inverted normals.

Run with: PYTHONPATH=. pytest tests/test_mesh_orientation.py -v
"""
from __future__ import annotations

from collections import Counter

import numpy as np
import pytest

from potfoundry import build_pot_mesh, write_stl_binary, STYLES


def _directed_edge_counts(faces: np.ndarray) -> Counter:
    counts: Counter = Counter()
    for a, b, c in faces:
        counts[(int(a), int(b))] += 1
        counts[(int(b), int(c))] += 1
        counts[(int(c), int(a))] += 1
    return counts


def _signed_volume(verts: np.ndarray, faces: np.ndarray) -> float:
    v0 = verts[faces[:, 0]]
    v1 = verts[faces[:, 1]]
    v2 = verts[faces[:, 2]]
    return float(np.sum(np.einsum("ij,ij->i", v0, np.cross(v1, v2))) / 6.0)


# A spread of styles, sizes and resolutions (including odd divisions) so the
# invariant cannot be satisfied by accident for one particular construction.
_CASES = [
    ("SuperformulaBlossom", 120, 70, 50, 168, 84),
    ("FourierBloom", 100, 60, 40, 120, 60),
    ("SpiralRidges", 90, 55, 45, 96, 48),
    ("SuperellipseMorph", 150, 80, 50, 121, 47),  # odd divisions
    ("HarmonicRipple", 110, 65, 48, 144, 72),
]


@pytest.mark.parametrize("style,H,Rt,Rb,nth,nz", _CASES)
def test_orientation_is_consistent(style, H, Rt, Rb, nth, nz):
    """Every directed edge appears exactly once (orientable, no winding clashes)."""
    fn = STYLES[style][0]
    verts, faces, _ = build_pot_mesh(
        H=H, Rt=Rt, Rb=Rb, t_wall=3, t_bottom=3, r_drain=10,
        expn=1.1, n_theta=nth, n_z=nz, r_outer_fn=fn, style_opts={},
    )
    dcounts = _directed_edge_counts(faces)
    duplicated = [e for e, n in dcounts.items() if n != 1]
    assert not duplicated, (
        f"{style}: {len(duplicated)} directed edges traversed >1x in the same "
        "direction -> adjacent faces disagree on winding (non-orientable export)"
    )


@pytest.mark.parametrize("style,H,Rt,Rb,nth,nz", _CASES)
def test_normals_point_outward(style, H, Rt, Rb, nth, nz):
    """Signed volume is positive -> STL normals point out of the solid."""
    fn = STYLES[style][0]
    verts, faces, _ = build_pot_mesh(
        H=H, Rt=Rt, Rb=Rb, t_wall=3, t_bottom=3, r_drain=10,
        expn=1.1, n_theta=nth, n_z=nz, r_outer_fn=fn, style_opts={},
    )
    vol = _signed_volume(verts, faces)
    assert vol > 0, (
        f"{style}: signed volume {vol:.1f} <= 0 -> inverted normals "
        "(Rhino/Grasshopper will see the solid inside-out)"
    )


def _read_binary_stl(path) -> tuple[np.ndarray, np.ndarray]:
    """Read a binary STL, returning (face_normals, triangle_vertices)."""
    import struct

    data = path.read_bytes()
    count = struct.unpack_from("<I", data, 80)[0]
    rec = np.dtype([
        ("n", "<f4", (3,)),
        ("v", "<f4", (3, 3)),
        ("attr", "<u2"),
    ])
    recs = np.frombuffer(data, dtype=rec, count=count, offset=84)
    return recs["n"].astype(float), recs["v"].astype(float)


def test_exported_stl_is_outward_oriented(tmp_path):
    """End-to-end: the serialized STL encodes an outward-oriented solid.

    Rhino/Grasshopper consume the file, not the in-memory arrays, and the writer
    recomputes face normals from winding. This guards that the orientation fix
    survives serialization on two counts:

    * the signed volume from the file's triangle winding is positive, and
    * each stored facet normal agrees with the winding it is written next to
      (so a reader that trusts the normal field sees the same outward solid).
    """
    fn = STYLES["SuperformulaBlossom"][0]
    verts, faces, _ = build_pot_mesh(
        H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
        expn=1.1, n_theta=120, n_z=60, r_outer_fn=fn, style_opts={},
    )
    out = tmp_path / "pot.stl"
    write_stl_binary(out, "Pot", verts, faces)

    normals, tris = _read_binary_stl(out)
    a, b, c = tris[:, 0], tris[:, 1], tris[:, 2]

    vol = float(np.sum(np.einsum("ij,ij->i", a, np.cross(b, c))) / 6.0)
    assert vol > 0, f"serialized STL has inverted winding (signed volume {vol:.1f})"

    # Stored normals must agree with the winding (cross product) direction.
    wind = np.cross(b - a, c - a)
    wlen = np.linalg.norm(wind, axis=1)
    ok = wlen > 0
    agree = np.einsum("ij,ij->i", normals[ok], wind[ok])
    assert np.all(agree >= 0), "stored facet normals disagree with winding direction"
