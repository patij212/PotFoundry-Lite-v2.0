"""UI export-byte helpers for OBJ and 3dm."""
from __future__ import annotations

import pytest

from potfoundry import build_pot_mesh, STYLES
from pfui.exporters import export_obj_bytes, export_3dm_bytes


def _mesh():
    fn = STYLES["SuperformulaBlossom"][0]
    return build_pot_mesh(
        H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
        expn=1.1, n_theta=48, n_z=24, r_outer_fn=fn, style_opts={},
    )


def test_export_obj_bytes():
    verts, faces, _ = _mesh()
    data, safe = export_obj_bytes("My Pot!", verts, faces)
    assert safe == "My_Pot_"
    text = data.decode("ascii")
    assert text.startswith("# PotFoundry OBJ export")
    assert text.count("\nv ") + text.startswith("v ") >= len(verts) - 1
    # One face line per triangle.
    assert text.count("\nf ") == len(faces)


def test_export_3dm_bytes():
    pytest.importorskip("rhino3dm")
    verts, faces, _ = _mesh()
    data, safe = export_3dm_bytes("My Pot!", verts, faces)
    assert safe == "My_Pot_"
    # 3dm files start with the ASCII signature "3D Geometry File Format".
    assert b"3D Geometry File Format" in data[:64]
