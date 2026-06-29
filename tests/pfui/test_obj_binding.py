"""The app reaches mesh writers through the pfui.imports shim. This pins that
the OBJ writer is wired up there (alongside the STL writer) so the Streamlit
"Download OBJ (Rhino/Grasshopper)" path stays functional."""
from __future__ import annotations

from pathlib import Path

import numpy as np

from pfui.imports import WRITE_OBJ, build_pot_mesh, STYLES


def test_write_obj_is_bound():
    assert WRITE_OBJ is not None, "OBJ writer not exposed via pfui.imports"


def test_write_obj_binding_produces_file(tmp_path):
    fn = STYLES["SuperformulaBlossom"][0]
    verts, faces, _ = build_pot_mesh(
        H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
        expn=1.1, n_theta=40, n_z=20, r_outer_fn=fn, style_opts={},
    )
    out = Path(WRITE_OBJ(str(tmp_path / "pot.obj"), "pot", verts, faces))
    assert out.exists() and out.stat().st_size > 0
    text = out.read_text()
    assert text.count("\nv ") + text.startswith("v ") >= len(verts) - 1
    assert "f " in text
