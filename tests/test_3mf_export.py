"""Tests for 3MF export (units-aware, manifold interchange for Rhino/Grasshopper).

3MF improves on STL for CAD interchange in two ways that matter for
Rhino/Grasshopper:

* it declares physical **units** (``unit="millimeter"``) in the model, so the
  importer does not have to guess scale; and
* it carries an **indexed mesh** (shared vertices) whose triangles the 3MF spec
  requires to be wound counter-clockwise when viewed from outside -- i.e. the
  outward orientation guaranteed by ``build_pot_mesh``.

These tests verify the written package is a structurally valid 3MF and that the
mesh round-trips with its topology and outward orientation intact.

Run with: PYTHONPATH=. pytest tests/test_3mf_export.py -v
"""
from __future__ import annotations

import xml.etree.ElementTree as ET
import zipfile
from collections import Counter
from pathlib import Path

import numpy as np
import pytest

from potfoundry import build_pot_mesh, STYLES, signed_volume
from potfoundry.core.io.threemf import write_3mf

_NS = {
    "m": "http://schemas.microsoft.com/3dmanufacturing/core/2015/02",
}


def _mesh():
    style_fn = STYLES["SuperformulaBlossom"][0]
    return build_pot_mesh(
        H=100, Rt=60, Rb=40,
        t_wall=3, t_bottom=3, r_drain=8,
        expn=1.1, n_theta=48, n_z=24,
        r_outer_fn=style_fn, style_opts={},
    )


def _read_model_xml(path: Path) -> ET.Element:
    with zipfile.ZipFile(path) as zf:
        data = zf.read("3D/3dmodel.model")
    return ET.fromstring(data)


def test_write_3mf_returns_path_and_is_zip(tmp_path):
    verts, faces, _ = _mesh()
    out = tmp_path / "pot.3mf"
    result = write_3mf(out, "TestPot", verts, faces)
    assert result == out
    assert out.exists()
    assert zipfile.is_zipfile(out)


def test_3mf_has_required_opc_parts(tmp_path):
    verts, faces, _ = _mesh()
    out = tmp_path / "pot.3mf"
    write_3mf(out, "TestPot", verts, faces)
    with zipfile.ZipFile(out) as zf:
        names = set(zf.namelist())
    assert "[Content_Types].xml" in names
    assert "_rels/.rels" in names
    assert "3D/3dmodel.model" in names


def test_3mf_declares_millimeter_units(tmp_path):
    verts, faces, _ = _mesh()
    out = tmp_path / "pot.3mf"
    write_3mf(out, "TestPot", verts, faces)
    root = _read_model_xml(out)
    assert root.get("unit") == "millimeter"


def test_3mf_mesh_counts_match(tmp_path):
    verts, faces, _ = _mesh()
    out = tmp_path / "pot.3mf"
    write_3mf(out, "TestPot", verts, faces)
    root = _read_model_xml(out)
    vlist = root.findall(".//m:vertices/m:vertex", _NS)
    tlist = root.findall(".//m:triangles/m:triangle", _NS)
    assert len(vlist) == len(verts)
    assert len(tlist) == len(faces)


def test_3mf_roundtrips_topology_and_orientation(tmp_path):
    verts, faces, _ = _mesh()
    out = tmp_path / "pot.3mf"
    write_3mf(out, "TestPot", verts, faces)
    root = _read_model_xml(out)

    v = np.array(
        [[float(e.get("x")), float(e.get("y")), float(e.get("z"))]
         for e in root.findall(".//m:vertices/m:vertex", _NS)]
    )
    f = np.array(
        [[int(e.get("v1")), int(e.get("v2")), int(e.get("v3"))]
         for e in root.findall(".//m:triangles/m:triangle", _NS)]
    )

    # Vertex positions preserved (float precision of the writer).
    np.testing.assert_allclose(v, verts, rtol=0, atol=1e-4)

    # Watertight after round-trip.
    und: Counter = Counter()
    for tri in f:
        for i in range(3):
            und[tuple(sorted((int(tri[i]), int(tri[(i + 1) % 3]))))] += 1
    assert all(c == 2 for c in und.values())

    # Orientation preserved => still outward (positive signed volume).
    assert signed_volume(v, f) > 0


def test_3mf_rejects_out_of_range_indices(tmp_path):
    verts, _, _ = _mesh()
    bad_faces = np.array([[0, 1, len(verts) + 5]])  # index past the vertex list
    with pytest.raises(ValueError):
        write_3mf(tmp_path / "bad.3mf", "Bad", verts, bad_faces)
