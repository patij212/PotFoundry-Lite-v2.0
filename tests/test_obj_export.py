"""Tests for OBJ export and quad-topology mesh generation.

Rhino / Grasshopper import meshes by welding shared vertices and prefer
quad-dominant topology with smooth (per-vertex) normals. STL gives them
none of that: it is unwelded triangle soup carrying only per-face normals,
so a round-trip through STL loses the clean grid the builder actually
produces.

These tests pin the contract for a higher-fidelity export path:

1. ``build_pot_quads`` exposes the structured quad topology that
   ``build_pot_mesh`` triangulates away (same vertices, half the faces,
   each quad splitting into the two triangles the STL path emits).
2. ``write_obj`` writes a valid Wavefront OBJ with shared (welded)
   vertices, optional smooth vertex normals, and mixed tri/quad faces.
3. The exported OBJ is a closed 2-manifold *by vertex position* — the
   property Rhino actually checks on import — for every style.
"""
from __future__ import annotations

from collections import Counter

import numpy as np
import pytest

from potfoundry import build_pot_mesh, STYLES


# --------------------------------------------------------------------------
# Quad-topology builder
# --------------------------------------------------------------------------

class TestBuildPotQuads:
    def test_quads_exist(self):
        """build_pot_quads should be importable and return 4-index faces."""
        from potfoundry import build_pot_quads

        fn = STYLES["SuperformulaBlossom"][0]
        verts, quads, diag = build_pot_quads(
            H=100, Rt=60, Rb=40,
            t_wall=3, t_bottom=3, r_drain=8,
            expn=1.1, n_theta=120, n_z=60,
            r_outer_fn=fn, style_opts={},
        )
        quads = np.asarray(quads)
        assert quads.ndim == 2 and quads.shape[1] == 4, \
            "build_pot_quads must return quad (M, 4) faces"

    def test_quads_share_vertices_with_triangulation(self):
        """Quad mesh must use exactly the same vertices as the STL path."""
        from potfoundry import build_pot_quads

        fn = STYLES["FourierBloom"][0]
        kw = dict(H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
                  expn=1.1, n_theta=96, n_z=48, r_outer_fn=fn, style_opts={})

        tv, tf, _ = build_pot_mesh(**kw)
        qv, qf, _ = build_pot_quads(**kw)

        np.testing.assert_array_equal(tv, qv)
        # Each quad splits into two triangles -> exactly half the faces.
        assert len(qf) * 2 == len(tf)

    def test_each_quad_splits_into_two_builder_triangles(self):
        """A quad [a,b,c,d] must decompose into triangles the STL path emits.

        We don't assume ordering, only that the triangle *set* produced by
        fan-splitting every quad ([a,b,c] + [a,c,d]) equals the triangle set
        the triangle builder emits. This proves the quad winding is
        consistent with the triangulation (no flipped faces).
        """
        from potfoundry import build_pot_quads

        fn = STYLES["SpiralRidges"][0]
        kw = dict(H=110, Rt=65, Rb=45, t_wall=3, t_bottom=3, r_drain=9,
                  expn=1.1, n_theta=48, n_z=24, r_outer_fn=fn, style_opts={})

        _, tf, _ = build_pot_mesh(**kw)
        _, qf, _ = build_pot_quads(**kw)

        def tri_key(tri):
            # Orientation-preserving canonical form: rotate so smallest index
            # is first (preserves winding, ignores starting vertex).
            tri = list(tri)
            i = tri.index(min(tri))
            return tuple(tri[i:] + tri[:i])

        from_quads = Counter()
        for a, b, c, d in qf:
            from_quads[tri_key((a, b, c))] += 1
            from_quads[tri_key((a, c, d))] += 1

        from_tris = Counter(tri_key(t) for t in tf)
        assert from_quads == from_tris


# --------------------------------------------------------------------------
# OBJ writer
# --------------------------------------------------------------------------

def _parse_obj(text: str):
    verts, normals, faces = [], [], []
    for line in text.splitlines():
        parts = line.split()
        if not parts:
            continue
        tag = parts[0]
        if tag == "v":
            verts.append(tuple(float(x) for x in parts[1:4]))
        elif tag == "vn":
            normals.append(tuple(float(x) for x in parts[1:4]))
        elif tag == "f":
            idx = []
            for tok in parts[1:]:
                # v, v/vt, v//vn, v/vt/vn
                idx.append(int(tok.split("/")[0]))
            faces.append(idx)
    return verts, normals, faces


class TestWriteObj:
    def test_basic_roundtrip(self, tmp_path):
        from potfoundry import write_obj

        verts = np.array([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], float)
        faces = np.array([[0, 1, 2], [0, 2, 3]])
        out = write_obj(tmp_path / "quad.obj", "square", verts, faces)
        text = out.read_text()

        pv, pn, pf = _parse_obj(text)
        assert len(pv) == 4
        assert len(pf) == 2
        # OBJ is 1-indexed and must reference valid vertices.
        for face in pf:
            assert all(1 <= i <= len(pv) for i in face)
        # Geometry round-trips.
        np.testing.assert_allclose(np.array(pv), verts, atol=1e-5)

    def test_quad_faces_preserved(self, tmp_path):
        from potfoundry import write_obj

        verts = np.array([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], float)
        quads = np.array([[0, 1, 2, 3]])
        out = write_obj(tmp_path / "q.obj", "square", verts, quads)
        _, _, pf = _parse_obj(out.read_text())
        assert len(pf) == 1
        assert len(pf[0]) == 4, "Quad faces must stay quads, not be split"

    def test_vertex_normals_written(self, tmp_path):
        from potfoundry import write_obj

        verts = np.array([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], float)
        faces = np.array([[0, 1, 2], [0, 2, 3]])
        vnormals = np.tile([0.0, 0.0, 1.0], (4, 1))
        out = write_obj(tmp_path / "n.obj", "sq", verts, faces,
                        vertex_normals=vnormals)
        text = out.read_text()
        pv, pn, pf = _parse_obj(text)
        assert len(pn) == 4
        # Face tokens must carry the //vn reference.
        assert "//" in text

    def test_rejects_out_of_range_face(self, tmp_path):
        from potfoundry import write_obj

        verts = np.array([[0, 0, 0], [1, 0, 0], [1, 1, 0]], float)
        faces = np.array([[0, 1, 9]])  # 9 is out of range
        with pytest.raises((ValueError, IndexError)):
            write_obj(tmp_path / "bad.obj", "bad", verts, faces)


# --------------------------------------------------------------------------
# The Rhino-quality guarantee: closed manifold by position
# --------------------------------------------------------------------------

@pytest.mark.parametrize("style_name", list(STYLES.keys()))
def test_exported_obj_is_closed_manifold_by_position(tmp_path, style_name):
    """An OBJ Rhino imports must weld into a closed 2-manifold.

    We export quads, re-read them, weld vertices by rounded position
    (mirroring Rhino's import weld), and assert every edge is shared by
    exactly two faces. This is the property STL triangle-soup cannot
    guarantee after a naive weld.
    """
    from potfoundry import build_pot_quads, write_obj

    fn = STYLES[style_name][0]
    verts, quads, _ = build_pot_quads(
        H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
        expn=1.1, n_theta=96, n_z=48, r_outer_fn=fn, style_opts={},
    )
    out = write_obj(tmp_path / f"{style_name}.obj", style_name, verts, quads)
    pv, _, pf = _parse_obj(out.read_text())

    pv = np.array(pv)
    key = np.round(pv, 4)
    _, inv = np.unique(key, axis=0, return_inverse=True)

    edges = Counter()
    for face in pf:
        n = len(face)
        for i in range(n):
            a = inv[face[i] - 1]        # OBJ is 1-indexed
            b = inv[face[(i + 1) % n] - 1]
            edges[tuple(sorted((int(a), int(b))))] += 1

    bad = [e for e, c in edges.items() if c != 2]
    assert not bad, f"{style_name}: {len(bad)} non-manifold edges after weld"


@pytest.mark.parametrize("Rb,r_drain,n_z", [
    (50, 10, 84),    # nominal
    (45, 39, 40),    # large drain -> heavy inner-wall clamp at the base
    (60, 52, 30),    # near-maximal drain
    (40, 34, 120),   # fine vertical resolution + big drain
])
def test_export_has_no_degenerate_faces(Rb, r_drain, n_z):
    """Rhino flags zero-area faces; the clamp near a big drain hole is the
    prime suspect. Assert every quad has positive area under both fan
    triangulations across a stress grid of every style."""
    from potfoundry import build_pot_quads

    for style_name, (fn, _) in STYLES.items():
        v, q, _ = build_pot_quads(
            H=120, Rt=70, Rb=Rb, t_wall=3, t_bottom=3, r_drain=r_drain,
            expn=1.1, n_theta=96, n_z=n_z,
            r_outer_fn=fn, style_opts={"spin_turns": 0.37},
        )
        a = v[q[:, 0]]; b = v[q[:, 1]]; c = v[q[:, 2]]; d = v[q[:, 3]]
        t1 = 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1)
        t2 = 0.5 * np.linalg.norm(np.cross(c - a, d - a), axis=1)
        worst = float(min(t1.min(), t2.min()))
        assert worst > 1e-6, (
            f"{style_name} (Rb={Rb}, drain={r_drain}): degenerate face "
            f"area {worst:.2e}"
        )


class TestAppShimWiring:
    """The Streamlit app reaches geometry only through pfui.imports; the OBJ
    export path must be exposed there or the download button silently hides."""

    def test_shim_exposes_obj_export(self):
        from pfui.imports import WRITE_OBJ, build_pot_quads, vertex_normals

        assert WRITE_OBJ is not None
        assert build_pot_quads is not None
        assert vertex_normals is not None

    def test_shim_obj_roundtrip(self, tmp_path):
        from pfui.imports import (
            STYLES as SHIM_STYLES,
            WRITE_OBJ,
            build_pot_quads,
            vertex_normals,
        )

        fn = SHIM_STYLES["HarmonicRipple"][0]
        v, q, _ = build_pot_quads(
            H=100, Rt=60, Rb=40, t_wall=3, t_bottom=3, r_drain=8,
            expn=1.1, n_theta=48, n_z=24, r_outer_fn=fn, style_opts={},
        )
        vn = vertex_normals(v, q)
        out = WRITE_OBJ(tmp_path / "shim.obj", "shim", v, q, vertex_normals=vn)
        assert out.exists() and out.stat().st_size > 0
