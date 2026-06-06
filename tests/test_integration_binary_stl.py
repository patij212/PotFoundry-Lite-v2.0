"""
Integration test: Verify complete binary STL migration
"""
import struct
import tempfile
import warnings
from pathlib import Path

import numpy as np

from potfoundry import build_pot_mesh, write_stl_binary, STYLES


def _read_binary_stl(path):
    """Parse a binary STL into (normals, triangles) arrays.

    Returns:
        normals: (M, 3) stored facet normals
        tris:    (M, 3, 3) triangle vertex coordinates
    """
    data = Path(path).read_bytes()
    tri_count = struct.unpack_from("<I", data, 80)[0]
    normals = np.empty((tri_count, 3), dtype=np.float64)
    tris = np.empty((tri_count, 3, 3), dtype=np.float64)
    off = 84
    for i in range(tri_count):
        vals = struct.unpack_from("<12f", data, off)
        normals[i] = vals[0:3]
        tris[i, 0] = vals[3:6]
        tris[i, 1] = vals[6:9]
        tris[i, 2] = vals[9:12]
        off += 50
    return normals, tris


def test_exported_stl_is_outward_oriented_closed_solid():
    """The written STL must enclose positive volume (outward normals) and have
    stored facet normals consistent with the triangle winding.

    This is what makes the export import cleanly as a valid closed solid in
    Rhino / Grasshopper and slicers, rather than an inside-out shell.
    """
    for style_name, (style_fn, _desc) in STYLES.items():
        verts, faces, _ = build_pot_mesh(
            H=110, Rt=65, Rb=48,
            t_wall=3, t_bottom=3, r_drain=9,
            expn=1.1, n_theta=96, n_z=48,
            r_outer_fn=style_fn, style_opts={},
        )
        with tempfile.TemporaryDirectory() as tmpdir:
            out = Path(tmpdir) / f"{style_name}.stl"
            write_stl_binary(out, style_name, verts, faces)
            normals, tris = _read_binary_stl(out)

        v0, v1, v2 = tris[:, 0], tris[:, 1], tris[:, 2]

        # Signed volume via divergence theorem: positive => outward normals.
        signed_vol = float(np.einsum("ij,ij->i", v0, np.cross(v1, v2)).sum() / 6.0)
        assert signed_vol > 0, (
            f"{style_name}: exported STL encloses non-positive volume "
            f"({signed_vol:.1f}) -> inside-out solid"
        )

        # Stored normals must agree with the right-hand-rule winding normal.
        winding = np.cross(v1 - v0, v2 - v0)
        dots = np.einsum("ij,ij->i", normals, winding)
        assert np.all(dots >= 0), (
            f"{style_name}: stored facet normals disagree with winding"
        )


def test_end_to_end_export_workflow():
    """Test complete pot generation and binary STL export workflow."""
    # Pick a style
    style_fn, style_desc = STYLES['SuperellipseMorph']

    # Build pot mesh
    verts, faces, diagnostics = build_pot_mesh(
        H=100, Rt=60, Rb=45,
        t_wall=3, t_bottom=3, r_drain=8,
        expn=1.1, n_theta=64, n_z=32,
        r_outer_fn=style_fn,
        style_opts={}
    )

    # Should produce valid mesh
    assert len(verts) > 0
    assert len(faces) > 0
    assert verts.shape[1] == 3  # 3D vertices
    assert faces.shape[1] == 3  # triangular faces

    # Export to binary STL
    with tempfile.TemporaryDirectory() as tmpdir:
        output_path = Path(tmpdir) / "test_pot.stl"
        result_path = write_stl_binary(output_path, "TestPot", verts, faces)

        # Verify file exists
        assert result_path.exists()
        assert result_path == output_path

        # Verify it's a valid binary STL
        data = output_path.read_bytes()

        # Check minimum size (header + count + at least one triangle)
        assert len(data) >= 84 + 50

        # Verify triangle count matches
        tri_count = int.from_bytes(data[80:84], "little")
        assert tri_count == len(faces)

        # Verify total file size
        expected_size = 80 + 4 + (tri_count * 50)
        assert len(data) == expected_size


def test_no_warnings_for_binary_stl():
    """Binary STL export should not produce any warnings."""
    style_fn, _ = STYLES['HarmonicRipple']
    verts, faces, _ = build_pot_mesh(
        H=80, Rt=50, Rb=40,
        t_wall=2.5, t_bottom=2.5, r_drain=6,
        expn=1.0, n_theta=48, n_z=24,
        r_outer_fn=style_fn,
        style_opts={'ripple_amp': 0.03, 'ripple_freq': 6}
    )

    with tempfile.TemporaryDirectory() as tmpdir:
        output_path = Path(tmpdir) / "pot.stl"

        # Should not produce any warnings
        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")
            write_stl_binary(output_path, "Pot", verts, faces)
            assert len(w) == 0, "Binary STL export should not produce warnings"


def test_multiple_styles_all_use_binary():
    """Verify binary STL works with all available pot styles."""
    test_styles = ['SuperellipseMorph', 'HarmonicRipple', 'FourierBloom']

    with tempfile.TemporaryDirectory() as tmpdir:
        for style_name in test_styles:
            if style_name not in STYLES:
                continue

            style_fn, _ = STYLES[style_name]
            verts, faces, _ = build_pot_mesh(
                H=60, Rt=40, Rb=30,
                t_wall=2, t_bottom=2, r_drain=5,
                expn=1.1, n_theta=32, n_z=16,
                r_outer_fn=style_fn,
                style_opts={}
            )

            output_path = Path(tmpdir) / f"{style_name}.stl"
            write_stl_binary(output_path, style_name, verts, faces)

            # Verify file was created and is valid
            assert output_path.exists()
            data = output_path.read_bytes()
            tri_count = int.from_bytes(data[80:84], "little")
            assert tri_count == len(faces)


def test_binary_stl_performance_benchmark():
    """Benchmark binary STL export performance."""
    import time

    # Build a medium-complexity mesh
    style_fn, _ = STYLES['SuperellipseMorph']
    verts, faces, _ = build_pot_mesh(
        H=120, Rt=70, Rb=50,
        t_wall=3, t_bottom=3, r_drain=10,
        expn=1.1, n_theta=128, n_z=64,
        r_outer_fn=style_fn,
        style_opts={}
    )

    with tempfile.TemporaryDirectory() as tmpdir:
        output_path = Path(tmpdir) / "benchmark.stl"

        # Time the export
        start = time.time()
        write_stl_binary(output_path, "BenchmarkPot", verts, faces)
        elapsed = time.time() - start

        # Should be reasonably fast (under 1 second for ~30k triangles)
        assert elapsed < 1.0, f"Binary STL export took {elapsed:.3f}s (expected < 1s)"

        # Verify output
        file_size = output_path.stat().st_size
        triangles = len(faces)

        # Sanity check: 50 bytes per triangle
        expected_size = 84 + (triangles * 50)
        assert file_size == expected_size
