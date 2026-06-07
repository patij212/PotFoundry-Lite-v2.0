"""Tests for the UI-facing export helpers in :mod:`pfui.exporters`.

These guard the bridge between the geometry core and the Streamlit download
buttons. The OBJ helper is the path that gives users a Rhino/Grasshopper-ready
download, so it must preserve the welded indexed topology end-to-end.
"""
from __future__ import annotations

from collections import Counter

import numpy as np
import pytest

from potfoundry import build_pot_mesh, STYLES


def _make_mesh():
    fn = STYLES["SuperformulaBlossom"][0]
    return build_pot_mesh(
        H=100, Rt=60, Rb=40,
        t_wall=3, t_bottom=3, r_drain=8,
        expn=1.1, n_theta=48, n_z=24,
        r_outer_fn=fn, style_opts={},
    )


def _parse_obj_bytes(data: bytes):
    verts, faces = [], []
    for line in data.decode("ascii").splitlines():
        if line.startswith("v "):
            _, x, y, z = line.split()
            verts.append((float(x), float(y), float(z)))
        elif line.startswith("f "):
            idx = [int(tok.split("/")[0]) for tok in line.split()[1:]]
            faces.append(tuple(i - 1 for i in idx))
    return np.array(verts), np.array(faces, dtype=int)


def test_export_obj_bytes_roundtrips_welded(tmp_path):
    from pfui.exporters import export_obj_bytes

    verts, faces, _ = _make_mesh()
    data, safe = export_obj_bytes("My Pot #1", verts, faces)

    assert isinstance(data, (bytes, bytearray))
    assert safe.endswith(".obj") or "." not in safe  # filename stem or with ext
    v, f = _parse_obj_bytes(bytes(data))

    # Welded: vertex count preserved, not exploded to 3 * faces.
    assert len(v) == len(verts)
    assert len(f) == len(faces)

    # Watertight round-trip.
    edges = []
    for face in f:
        for i in range(3):
            a, b = int(face[i]), int(face[(i + 1) % 3])
            edges.append((a, b) if a < b else (b, a))
    bad = [e for e, c in Counter(edges).items() if c != 2]
    assert not bad, f"export_obj_bytes produced {len(bad)} non-manifold edges"


def test_export_obj_bytes_sanitizes_name(tmp_path):
    from pfui.exporters import export_obj_bytes

    verts, faces, _ = _make_mesh()
    _, safe = export_obj_bytes("danger/../name with spaces", verts, faces)
    assert "/" not in safe and " " not in safe
