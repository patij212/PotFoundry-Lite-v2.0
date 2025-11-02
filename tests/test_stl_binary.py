from pathlib import Path

import numpy as np

from potfoundry.core.io.stl import write_stl_binary


def test_binary_stl_header_and_count(tmp_path: Path):
    # Triangle for a tiny right-angled tri
    verts = np.array(
        [[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0]], dtype=np.float64
    )
    faces = np.array([[0, 1, 2]], dtype=np.int32)
    out = tmp_path / "tri.stl"
    write_stl_binary(out, "test", verts, faces)
    data = out.read_bytes()
    assert len(data) == 84 + 50  # 80 header + 4 count + 50 record
    assert data[:4] != b"\x00\x00\x00\x00"  # header not all zeros
    # Triangle count (little-endian uint32) should be 1
    tri_count = int.from_bytes(data[80:84], "little")
    assert tri_count == 1
