
import pytest
from pathlib import Path
from potfoundry import write_stl_binary
import numpy as np

@pytest.mark.fast
def test_writer_path_ok(tmp_path: Path):
    # Tiny triangle fan STL to test writer without keeping dest open
    verts = np.array([[0,0,0],[1,0,0],[0,1,0]], dtype=float)
    faces = np.array([[0,1,2]], dtype=int)
    path = tmp_path / "x.stl"
    write_stl_binary(str(path), "x", verts, faces)
    assert path.exists() and path.stat().st_size > 84  # header+one tri
