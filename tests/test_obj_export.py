"""Tests for welded indexed mesh export (Wavefront OBJ).

Rationale
---------
PotFoundry's geometry core (:func:`build_pot_mesh`) produces a *welded*,
*indexed* mesh: a single shared vertex array plus faces that reference vertices
by index. That topology is watertight and manifold — every edge is shared by
exactly two faces.

Binary STL, our only previous export format, throws this topology away: it
stores three independent vertex copies per triangle with **no** shared-vertex
information. When such a file is imported into Rhino / Grasshopper, the mesh is
"unwelded": Rhino sees thousands of coincident-but-separate vertices, reports a
sea of *naked edges*, and refuses to treat the pot as a closed solid. That makes
downstream operations (Boolean, offset, MeshToNURB, _Cap) unreliable.

A Wavefront OBJ export preserves the indexed topology directly. Rhino imports it
as a welded, closed mesh, which is the baseline for "Rhino export quality". These
tests pin that behaviour:

* the exporter preserves the welded vertex count (no vertex explosion),
* the written file is valid OBJ (1-based indices, parseable),
* re-parsing the OBJ reproduces a watertight, manifold mesh.
"""
from __future__ import annotations

from collections import Counter

import numpy as np
import pytest

from potfoundry import build_pot_mesh, STYLES


def _parse_obj(text: str):
    """Minimal Wavefront OBJ parser -> (vertices[N,3], faces[M,3] 0-based)."""
    verts: list[tuple[float, float, float]] = []
    faces: list[tuple[int, int, int]] = []
    name = None
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        tag = parts[0]
        if tag == "v":
            verts.append((float(parts[1]), float(parts[2]), float(parts[3])))
        elif tag in ("o", "g"):
            name = parts[1] if len(parts) > 1 else name
        elif tag == "f":
            # Each token may be v, v/vt, v//vn or v/vt/vn — take the vertex index.
            idx = [int(tok.split("/")[0]) for tok in parts[1:]]
            assert len(idx) == 3, "exporter must emit triangles only"
            faces.append((idx[0], idx[1], idx[2]))
    v = np.array(verts, dtype=float)
    # OBJ indices are 1-based; convert to 0-based for comparison.
    f = np.array(faces, dtype=int) - 1
    return v, f, name


def _count_nonmanifold_edges(faces: np.ndarray) -> list:
    edges = []
    for face in faces:
        for i in range(3):
            a, b = int(face[i]), int(face[(i + 1) % 3])
            edges.append((a, b) if a < b else (b, a))
    counts = Counter(edges)
    return [e for e, c in counts.items() if c != 2]


def _make_mesh(style="SuperformulaBlossom", n_theta=60, n_z=30):
    fn = STYLES[style][0]
    return build_pot_mesh(
        H=100, Rt=60, Rb=40,
        t_wall=3, t_bottom=3, r_drain=8,
        expn=1.1, n_theta=n_theta, n_z=n_z,
        r_outer_fn=fn, style_opts={},
    )


def test_write_obj_is_importable():
    """The OBJ writer must exist and be exported from the package."""
    from potfoundry import write_obj  # noqa: F401


def test_obj_preserves_welded_vertex_count(tmp_path):
    """OBJ must keep the indexed topology — one vertex per source vertex.

    This is the property STL cannot provide. If the export silently de-welds
    (3 verts per face) Rhino would import a non-watertight shell.
    """
    from potfoundry import write_obj

    verts, faces, _ = _make_mesh()
    out = write_obj(tmp_path / "pot.obj", "pot", verts, faces)

    text = out.read_text()
    v, f, name = _parse_obj(text)

    assert len(v) == len(verts), (
        f"OBJ should preserve welded vertices: source {len(verts)}, file {len(v)}"
    )
    assert len(f) == len(faces)
    # Way below the de-welded count STL would produce (3 * faces).
    assert len(v) < 3 * len(faces)


def test_obj_indices_are_one_based_and_in_range(tmp_path):
    """OBJ face indices are 1-based per spec; none may be out of range."""
    from potfoundry import write_obj

    verts, faces, _ = _make_mesh(n_theta=40, n_z=20)
    out = write_obj(tmp_path / "pot.obj", "pot", verts, faces)

    raw_faces = []
    for line in out.read_text().splitlines():
        if line.startswith("f "):
            raw_faces.extend(int(tok.split("/")[0]) for tok in line.split()[1:])
    assert min(raw_faces) >= 1, "OBJ indices must be 1-based (>= 1)"
    assert max(raw_faces) <= len(verts), "OBJ indices must not exceed vertex count"


@pytest.mark.parametrize("style", list(STYLES.keys()))
def test_obj_roundtrip_is_watertight(tmp_path, style):
    """Re-parsing the OBJ must yield the same watertight, manifold topology."""
    from potfoundry import write_obj

    verts, faces, _ = _make_mesh(style=style)
    out = write_obj(tmp_path / "pot.obj", style, verts, faces)
    v, f, _ = _parse_obj(out.read_text())

    bad = _count_nonmanifold_edges(f)
    assert not bad, f"{style}: OBJ round-trip produced {len(bad)} non-manifold edges"

    # Geometry must survive the round-trip (coordinates match to file precision).
    assert v.shape == verts.shape
    np.testing.assert_allclose(v, verts, atol=1e-4)


def test_obj_carries_object_name(tmp_path):
    """Rhino uses the OBJ object name as the imported layer/object name."""
    from potfoundry import write_obj

    verts, faces, _ = _make_mesh(n_theta=24, n_z=12)
    out = write_obj(tmp_path / "named.obj", "MyHarmonicPot", verts, faces)
    _, _, name = _parse_obj(out.read_text())
    assert name == "MyHarmonicPot"
