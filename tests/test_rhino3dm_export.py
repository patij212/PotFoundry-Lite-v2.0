"""Tests for the native Rhino ``.3dm`` exporter.

A ``.3dm`` is the gold standard for Rhino/Grasshopper: it carries the model unit
system (millimetres) and a real Rhino mesh object with vertex normals, so the
pot opens at the right scale and shades smoothly with no import dialog guessing.

``rhino3dm`` is an optional dependency. When it is not installed the exporter
must raise a clear, actionable error (tested without the package) and these
round-trip tests are skipped.
"""
from __future__ import annotations

import pytest

from potfoundry import build_pot_mesh, STYLES

rhino3dm = pytest.importorskip("rhino3dm")

from potfoundry.core.io.rhino3dm_io import write_3dm  # noqa: E402


def _mesh():
    fn = STYLES["SuperformulaBlossom"][0]
    return build_pot_mesh(
        H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
        expn=1.1, n_theta=48, n_z=24, r_outer_fn=fn, style_opts={},
    )


def test_writes_readable_3dm_with_mm_units(tmp_path):
    verts, faces, _ = _mesh()
    path = tmp_path / "pot.3dm"
    write_3dm(path, "Pot", verts, faces)

    model = rhino3dm.File3dm.Read(str(path))
    assert model is not None
    assert model.Settings.ModelUnitSystem == rhino3dm.UnitSystem.Millimeters

    objs = list(model.Objects)
    assert len(objs) == 1
    mesh = objs[0].Geometry
    assert isinstance(mesh, rhino3dm.Mesh)
    assert len(mesh.Vertices) == len(verts)
    assert len(mesh.Faces) == len(faces)
    # Vertex normals carried for smooth shading.
    assert len(mesh.Normals) == len(verts)
    # Rhino's own validity check (closed, manifold, oriented).
    assert mesh.IsValid


def test_mesh_is_closed_and_manifold(tmp_path):
    verts, faces, _ = _mesh()
    path = tmp_path / "pot.3dm"
    write_3dm(path, "Pot", verts, faces)
    model = rhino3dm.File3dm.Read(str(path))
    mesh = list(model.Objects)[0].Geometry
    assert mesh.IsClosed, "Exported pot mesh should be a closed solid in Rhino"


def test_object_named(tmp_path):
    verts, faces, _ = _mesh()
    path = tmp_path / "pot.3dm"
    write_3dm(path, "FancyPot", verts, faces)
    model = rhino3dm.File3dm.Read(str(path))
    attrs = list(model.Objects)[0].Attributes
    assert attrs.Name == "FancyPot"


def test_returns_path(tmp_path):
    verts, faces, _ = _mesh()
    path = tmp_path / "pot.3dm"
    result = write_3dm(path, "Pot", verts, faces)
    from pathlib import Path
    assert Path(result) == path


@pytest.mark.parametrize("style_name", list(STYLES.keys()))
@pytest.mark.parametrize("cfg_name,cfg", [
    ("default", dict(H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10, expn=1.1)),
    ("thin_wall", dict(H=140, Rt=80, Rb=40, t_wall=2, t_bottom=2, r_drain=6, expn=1.4)),
    ("big_drain", dict(H=100, Rt=60, Rb=55, t_wall=3, t_bottom=3, r_drain=44, expn=1.0)),
])
def test_exported_3dm_is_valid_closed_solid(tmp_path, style_name, cfg_name, cfg):
    """Rhino's own validator must accept the export as a valid closed solid
    across every style and edge-case dimension set."""
    fn = STYLES[style_name][0]
    verts, faces, _ = build_pot_mesh(
        r_outer_fn=fn, style_opts={}, n_theta=72, n_z=36, **cfg
    )
    path = tmp_path / f"{style_name}_{cfg_name}.3dm"
    write_3dm(path, style_name, verts, faces)

    model = rhino3dm.File3dm.Read(str(path))
    mesh = list(model.Objects)[0].Geometry
    assert mesh.IsValid, f"{style_name}/{cfg_name}: Rhino rejected mesh as invalid"
    assert mesh.IsClosed, f"{style_name}/{cfg_name}: mesh is not a closed solid"
