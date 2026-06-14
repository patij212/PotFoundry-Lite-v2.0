"""The 3dm exporter must degrade gracefully when rhino3dm is absent.

This test runs whether or not rhino3dm is installed: it simulates the
package being missing and asserts a clear, actionable error rather than an
opaque ImportError or AttributeError.
"""
from __future__ import annotations

import numpy as np
import pytest

from potfoundry.core.io import rhino3dm_io


def test_write_3dm_raises_clear_error_when_unavailable(monkeypatch, tmp_path):
    monkeypatch.setattr(rhino3dm_io, "RHINO3DM_AVAILABLE", False)
    verts = np.zeros((3, 3))
    faces = np.array([[0, 1, 2]])
    with pytest.raises(RuntimeError, match="rhino3dm"):
        rhino3dm_io.write_3dm(tmp_path / "x.3dm", "X", verts, faces)
