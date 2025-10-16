"""
Integration test: Verify complete binary STL migration
"""
import pytest
import tempfile
import warnings
from pathlib import Path
from potfoundry import build_pot_mesh, write_stl_binary, STYLES


@pytest.mark.fast
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


@pytest.mark.fast
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


@pytest.mark.fast
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
