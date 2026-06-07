"""Tests for the mesh-validation guarantee used before CAD export.

Rhino / Grasshopper reject or misbehave on meshes that are not watertight,
not manifold, inconsistently wound, or that contain degenerate / duplicate
faces (its `_Check` / `_UnifyMeshNormals` commands flag exactly these). Before
PotFoundry hands a mesh to OBJ/STL export we want a single authoritative check
that mirrors those criteria, so a future style or parameter change that breaks
topology fails loudly here instead of silently producing a broken file.

These tests pin:
* a clean pot mesh validates as Rhino-ready across every style,
* each defect class (naked edge, non-manifold edge, flipped winding,
  degenerate face, duplicate face) is detected.
"""
from __future__ import annotations

import numpy as np
import pytest

from potfoundry import build_pot_mesh, STYLES


def _make_mesh(style="SuperformulaBlossom", n_theta=48, n_z=24):
    fn = STYLES[style][0]
    return build_pot_mesh(
        H=100, Rt=60, Rb=40,
        t_wall=3, t_bottom=3, r_drain=8,
        expn=1.1, n_theta=n_theta, n_z=n_z,
        r_outer_fn=fn, style_opts={},
    )


def test_validate_mesh_is_importable():
    from potfoundry import validate_mesh  # noqa: F401


@pytest.mark.parametrize("style", list(STYLES.keys()))
def test_real_pot_meshes_are_cad_ready(style):
    from potfoundry import validate_mesh

    verts, faces, _ = _make_mesh(style=style)
    report = validate_mesh(verts, faces)

    assert report.is_watertight, f"{style}: not watertight"
    assert report.is_manifold, f"{style}: not manifold"
    assert report.is_consistently_wound, f"{style}: inconsistent winding"
    assert report.degenerate_faces == 0, f"{style}: degenerate faces"
    assert report.duplicate_faces == 0, f"{style}: duplicate faces"
    assert report.naked_edges == 0
    assert report.non_manifold_edges == 0
    assert report.ok, f"{style}: {report.issues}"


@pytest.mark.parametrize("style", list(STYLES.keys()))
def test_real_pot_meshes_are_outward_oriented(style):
    """Normals must point OUT of the solid (positive volume) — the STL/OBJ/Rhino
    convention. A coherently wound mesh could still be globally inverted; this
    pins the outward direction so a future change can't silently flip it."""
    from potfoundry import validate_mesh

    verts, faces, _ = _make_mesh(style=style)
    report = validate_mesh(verts, faces)

    assert report.signed_volume > 0, f"{style}: normals point inward (vol {report.signed_volume})"
    assert report.is_outward
    # A real pot shell encloses a sensible positive volume.
    assert report.signed_volume > 1000.0


def test_detects_naked_edge():
    """Dropping a face opens a hole -> naked (boundary) edges appear."""
    from potfoundry import validate_mesh

    verts, faces, _ = _make_mesh(n_theta=24, n_z=12)
    holed = faces[1:]  # remove one triangle
    report = validate_mesh(verts, holed)

    assert not report.is_watertight
    assert report.naked_edges > 0
    assert not report.ok


def test_detects_non_manifold_edge():
    """An edge shared by 3+ faces is non-manifold."""
    from potfoundry import validate_mesh

    verts, faces, _ = _make_mesh(n_theta=24, n_z=12)
    # Duplicate the first face's edge into an extra fan triangle so one edge is
    # shared by three faces. Reuse two existing verts + one far vertex.
    a, b, _c = faces[0]
    far = int(np.argmax(verts[:, 2]))
    extra = np.array([[a, b, far]], dtype=faces.dtype)
    bad = np.vstack([faces, extra])
    report = validate_mesh(verts, bad)

    assert report.non_manifold_edges > 0
    assert not report.is_manifold
    assert not report.ok


def test_detects_flipped_winding():
    """Reversing one face breaks orientation consistency."""
    from potfoundry import validate_mesh

    verts, faces, _ = _make_mesh(n_theta=24, n_z=12)
    flipped = faces.copy()
    flipped[0] = flipped[0][::-1]  # reverse winding of one triangle
    report = validate_mesh(verts, flipped)

    assert not report.is_consistently_wound
    assert not report.ok


def test_detects_degenerate_face():
    """A face with a repeated vertex has zero area."""
    from potfoundry import validate_mesh

    verts, faces, _ = _make_mesh(n_theta=24, n_z=12)
    bad = faces.copy()
    bad[0] = [faces[0][0], faces[0][0], faces[0][1]]  # repeated vertex
    report = validate_mesh(verts, bad)

    assert report.degenerate_faces > 0
    assert not report.ok


def test_detects_duplicate_face():
    from potfoundry import validate_mesh

    verts, faces, _ = _make_mesh(n_theta=24, n_z=12)
    dup = np.vstack([faces, faces[0:1]])
    report = validate_mesh(verts, dup)

    assert report.duplicate_faces > 0
    assert not report.ok
