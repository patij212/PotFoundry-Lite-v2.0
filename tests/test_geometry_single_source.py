"""Guard against the two geometry modules diverging again.

``potfoundry.geometry`` and ``potfoundry.core.geometry`` used to carry
independent copies of the same mesh builder. They silently drifted apart: the
outward-orientation fix landed only in the core copy, so the YAML/batch export
path (which imports the top-level module) kept building inside-out, incoherently
wound meshes. This test pins the invariant that both import paths resolve to a
single implementation, so a fix in one is a fix in both.
"""
from __future__ import annotations

import potfoundry.core.geometry as core_geo
import potfoundry.geometry as top_geo
from potfoundry import mesh_quality_report


def test_build_pot_mesh_is_the_same_object():
    assert top_geo.build_pot_mesh is core_geo.build_pot_mesh


def test_shared_public_symbols_are_identical():
    for name in ("STYLES", "MeshQuality", "PotDefaults", "base_radius",
                 "_spin_twist_radians", "_theta_grid_cached", "save_preview_png"):
        assert getattr(top_geo, name) is getattr(core_geo, name), name


def test_top_level_build_is_export_ready():
    fn = top_geo.STYLES["SuperformulaBlossom"][0]
    verts, faces, _ = top_geo.build_pot_mesh(
        H=120, Rt=70, Rb=45, t_wall=3, t_bottom=3, r_drain=5,
        expn=1.1, n_theta=48, n_z=24, r_outer_fn=fn, style_opts={},
    )
    assert mesh_quality_report(verts, faces)["export_ready"] is True
