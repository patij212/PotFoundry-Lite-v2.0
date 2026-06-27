"""Mesh orientation / manifold-quality tests (export quality for Rhino/Grasshopper).

These tests pin a real export-quality requirement that the prior watertight test
missed: a mesh can be *undirected*-watertight (every edge shared by two faces)
while still being **inconsistently oriented** (neighbouring faces wind the shared
edge in the same direction) or **globally inverted** (normals point inward).

Rhino, Grasshopper, and most CAD/boolean pipelines respect triangle winding.
An inside-out or mixed-winding solid breaks shading, boolean ops, and some
slicers. The requirements proven here:

1. Consistent orientation: every *directed* edge (a -> b) appears exactly once
   across the mesh. (Equivalently: each shared edge is traversed in opposite
   directions by its two faces.)
2. Outward orientation: the signed volume (divergence theorem) is positive, i.e.
   face normals point out of the solid.

Run with: PYTHONPATH=. pytest tests/test_mesh_orientation.py -v
"""
from __future__ import annotations

import struct
import tempfile
from collections import Counter
from pathlib import Path

import numpy as np
import pytest

from potfoundry import build_pot_mesh, write_stl_binary, STYLES


ALL_STYLES = list(STYLES.keys())


def directed_edge_counts(faces: np.ndarray) -> Counter:
    """Count occurrences of each directed edge (a -> b) over all triangles."""
    counts: Counter = Counter()
    for f in faces:
        a, b, c = int(f[0]), int(f[1]), int(f[2])
        counts[(a, b)] += 1
        counts[(b, c)] += 1
        counts[(c, a)] += 1
    return counts


def signed_volume(verts: np.ndarray, faces: np.ndarray) -> float:
    """Signed volume via the divergence theorem (sum of tetrahedra).

    Positive when faces are consistently wound with outward normals.
    """
    v0 = verts[faces[:, 0]]
    v1 = verts[faces[:, 1]]
    v2 = verts[faces[:, 2]]
    return float(np.einsum("ij,ij->i", v0, np.cross(v1, v2)).sum() / 6.0)


def _build(style_name: str, **overrides):
    fn = STYLES[style_name][0]
    params = dict(
        H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
        expn=1.1, n_theta=120, n_z=60, r_outer_fn=fn, style_opts={},
    )
    params.update(overrides)
    return build_pot_mesh(**params)


class TestConsistentOrientation:
    @pytest.mark.parametrize("style_name", ALL_STYLES)
    def test_every_directed_edge_appears_once(self, style_name):
        """A consistently oriented closed manifold has each directed edge once."""
        verts, faces, _ = _build(style_name)
        counts = directed_edge_counts(faces)
        bad = {e: c for e, c in counts.items() if c != 1}
        assert not bad, (
            f"{style_name}: {len(bad)} directed edges are traversed the same way "
            f"by both adjacent faces (inconsistent winding)."
        )

    @pytest.mark.parametrize("style_name", ALL_STYLES)
    def test_signed_volume_is_positive(self, style_name):
        """Outward-facing normals => positive signed volume."""
        verts, faces, _ = _build(style_name)
        vol = signed_volume(verts, faces)
        assert vol > 0, (
            f"{style_name}: signed volume {vol:.1f} <= 0 means the mesh is "
            f"inside-out (normals point inward)."
        )

    def test_orientation_holds_under_twist_and_clamp(self):
        """Stress: global twist + clamped drain must stay consistently outward."""
        verts, faces, _ = _build(
            "SpiralRidges", t_wall=6, r_drain=20,
            style_opts={"spiral_turns": 1.5, "spin_turns": 0.75},
        )
        counts = directed_edge_counts(faces)
        bad = {e: c for e, c in counts.items() if c != 1}
        assert not bad, f"{len(bad)} inconsistent directed edges under twist+clamp"
        assert signed_volume(verts, faces) > 0


def _read_binary_stl_facets(path: Path):
    """Yield (stored_normal, v0, v1, v2) for each facet in a binary STL."""
    data = Path(path).read_bytes()
    n_tri = struct.unpack("<I", data[80:84])[0]
    off = 84
    for _ in range(n_tri):
        vals = struct.unpack("<12f", data[off:off + 48])
        off += 50  # 48 bytes of floats + 2 byte attribute
        n = np.array(vals[0:3])
        v0 = np.array(vals[3:6])
        v1 = np.array(vals[6:9])
        v2 = np.array(vals[9:12])
        yield n, v0, v1, v2


class TestStlExportOrientation:
    """End-to-end: the exported STL itself must be outward-oriented."""

    def test_exported_stl_normals_match_winding_and_point_outward(self, tmp_path):
        verts, faces, _ = _build("HarmonicRipple")
        out = tmp_path / "pot.stl"
        write_stl_binary(out, "Pot", verts, faces)

        vol = 0.0
        disagree = 0
        count = 0
        for n, v0, v1, v2 in _read_binary_stl_facets(out):
            count += 1
            geo = np.cross(v1 - v0, v2 - v0)
            if np.dot(n, geo) < 0:
                disagree += 1
            vol += float(np.dot(v0, np.cross(v1, v2)))
        vol /= 6.0

        assert count == len(faces)
        assert disagree == 0, f"{disagree} STL facets have normals opposing winding"
        assert vol > 0, f"Exported STL is inside-out (signed volume {vol:.1f})"
