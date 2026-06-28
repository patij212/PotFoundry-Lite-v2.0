"""STL round-trip export-quality tests.

The in-memory mesh from ``build_pot_mesh`` is validated by
``tests/test_mesh_quality.py``. But the artifact a user actually loads into
Rhino/Grasshopper is the written *binary STL file*, which:

  * stores coordinates as float32 (lossy vs the float64 mesh), and
  * duplicates every vertex per-face (STL has no shared index table).

So a slicer/CAD importer must re-weld coincident vertices by position before it
can judge watertightness. This test reproduces that import path: write the STL,
parse it back, weld vertices by rounded position, rebuild the face index table,
and assert the recovered solid is still closed, manifold, consistently oriented,
outward, and free of degenerate faces.

If float32 quantization ever collapsed a sliver triangle or split a shared
vertex, this is where it would show up.
"""
from __future__ import annotations

import struct
import tempfile
from pathlib import Path

import numpy as np
import pytest

from potfoundry import STYLES, build_pot_mesh, write_stl_binary, validate_mesh


def _read_binary_stl(path: Path) -> np.ndarray:
    """Parse a binary STL into a (M, 3, 3) array of per-face vertices (float32)."""
    data = path.read_bytes()
    tri_count = struct.unpack_from("<I", data, 80)[0]
    # Each facet: 12 floats used (normal[3] + v1[3] + v2[3] + v3[3]) + 2-byte attr.
    facet = np.dtype([
        ("normal", "<f4", (3,)),
        ("v", "<f4", (3, 3)),
        ("attr", "<u2"),
    ])
    recs = np.frombuffer(data, dtype=facet, count=tri_count, offset=84)
    return np.array(recs["v"])  # (M, 3, 3)


def _weld(tri_verts: np.ndarray, decimals: int = 4):
    """Re-weld per-face vertices into (verts, faces) by rounded position.

    decimals=4 -> 1e-4 mm tolerance, safely above float32 noise (~1.7e-5 mm at
    ~140 mm) and far below any real geometric feature.
    """
    flat = tri_verts.reshape(-1, 3)
    keys = np.round(flat, decimals)
    uniq, inv = np.unique(keys, axis=0, return_inverse=True)
    faces = inv.reshape(-1, 3)
    return uniq.astype(float), faces.astype(np.int64)


CASES = [
    ("SuperformulaBlossom", dict(H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3,
                                 r_drain=10, expn=1.1, n_theta=96, n_z=48), {}),
    ("SpiralRidges", dict(H=140, Rt=80, Rb=46, t_wall=6, t_bottom=4, r_drain=34,
                          expn=1.3, n_theta=120, n_z=60), {}),
    # Extreme concave config that exercises the wall-thickness guard.
    ("FourierBloom", dict(H=120, Rt=70, Rb=44, t_wall=4, t_bottom=4, r_drain=36,
                          expn=1.1, n_theta=120, n_z=60),
     dict(fb_base_cos8_amp=0.5, fb_wobble_amp=0.3, fb_strength=1.5)),
]


@pytest.mark.parametrize("style_name,cfg,opts", CASES)
def test_exported_stl_is_watertight_solid(style_name, cfg, opts):
    verts, faces, _ = build_pot_mesh(
        r_outer_fn=STYLES[style_name][0], style_opts=opts, **cfg
    )
    with tempfile.TemporaryDirectory() as d:
        path = Path(d) / "pot.stl"
        write_stl_binary(path, style_name, verts, faces)
        tri_verts = _read_binary_stl(path)

    assert tri_verts.shape == (faces.shape[0], 3, 3)

    welded_verts, welded_faces = _weld(tri_verts)
    v = validate_mesh(welded_verts, welded_faces)
    assert v.is_valid, f"{style_name}: exported STL not a valid solid: {v.as_dict()}"


@pytest.mark.parametrize("style_name,cfg,opts", CASES)
def test_exported_stl_vertex_count_welds_back(style_name, cfg, opts):
    """Welding the STL must recover exactly the original shared-vertex count.

    If float32 split a vertex (over-count) or merged two (under-count), the
    welded vertex count would differ from the source mesh.
    """
    verts, faces, _ = build_pot_mesh(
        r_outer_fn=STYLES[style_name][0], style_opts=opts, **cfg
    )
    # Source mesh may carry unreferenced/duplicate vertices; compare against the
    # number of *distinct referenced* positions, which is what STL preserves.
    ref = np.unique(faces.reshape(-1))
    src_unique = np.unique(np.round(verts[ref], 4), axis=0).shape[0]

    with tempfile.TemporaryDirectory() as d:
        path = Path(d) / "pot.stl"
        write_stl_binary(path, style_name, verts, faces)
        tri_verts = _read_binary_stl(path)
    welded_verts, _ = _weld(tri_verts)

    assert welded_verts.shape[0] == src_unique, (
        f"{style_name}: welded {welded_verts.shape[0]} verts vs source {src_unique}"
    )
