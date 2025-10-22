"""
Test suite for STL export migration to binary format.

This test suite validates:
1. Binary STL export works correctly (recommended path)
2. ASCII STL export still works but shows deprecation warning
3. Binary STL produces smaller files than ASCII
4. Both formats produce valid STL files
"""

import warnings
import numpy as np
from pathlib import Path
from potfoundry import write_stl_binary, write_ascii_stl


def test_binary_stl_is_default_export():
    """Binary STL should be the recommended export method."""
    # Verify write_stl_binary is directly importable
    from potfoundry import write_stl_binary

    assert write_stl_binary is not None
    assert callable(write_stl_binary)


def test_ascii_stl_shows_deprecation_warning(tmp_path: Path):
    """ASCII STL export should show deprecation warning."""
    verts = np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0]], dtype=float)
    faces = np.array([[0, 1, 2]], dtype=int)
    out = tmp_path / "test_ascii.stl"

    # Catch deprecation warning
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always", DeprecationWarning)
        write_ascii_stl(str(out), "test", verts, faces)

        # Should have exactly one deprecation warning
        assert len(w) == 1
        assert issubclass(w[0].category, DeprecationWarning)
        assert "write_stl_binary" in str(w[0].message)
        assert "deprecated" in str(w[0].message).lower()

    # File should still be created
    assert out.exists()


def test_binary_stl_no_warnings(tmp_path: Path):
    """Binary STL export should not produce any warnings."""
    verts = np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0]], dtype=float)
    faces = np.array([[0, 1, 2]], dtype=int)
    out = tmp_path / "test_binary.stl"

    # Should not produce warnings
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        write_stl_binary(str(out), "test", verts, faces)

        # Should have no warnings
        assert len(w) == 0

    assert out.exists()


def test_binary_vs_ascii_file_size(tmp_path: Path):
    """Binary STL should produce smaller files than ASCII STL."""
    # Create a mesh with multiple triangles
    verts = np.array(
        [
            [0, 0, 0],
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1],
            [1, 1, 0],
            [1, 0, 1],
            [0, 1, 1],
            [1, 1, 1],
        ],
        dtype=float,
    )
    faces = np.array(
        [
            [0, 1, 2],
            [0, 2, 3],
            [1, 4, 5],
            [2, 4, 6],
            [3, 5, 6],
            [4, 5, 6],
            [0, 1, 4],
            [1, 2, 4],
        ],
        dtype=int,
    )

    ascii_out = tmp_path / "test_ascii.stl"
    binary_out = tmp_path / "test_binary.stl"

    # Suppress deprecation warning for this test
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", DeprecationWarning)
        write_ascii_stl(str(ascii_out), "test", verts, faces)

    write_stl_binary(str(binary_out), "test", verts, faces)

    ascii_size = ascii_out.stat().st_size
    binary_size = binary_out.stat().st_size

    # Binary should be significantly smaller
    # Each triangle in ASCII is ~200+ bytes, in binary it's exactly 50 bytes
    assert binary_size < ascii_size
    # Binary should be at least 50% smaller for this mesh
    assert binary_size < ascii_size * 0.5


def test_both_formats_produce_valid_stl_files(tmp_path: Path):
    """Both ASCII and binary STL should produce valid files."""
    verts = np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0]], dtype=float)
    faces = np.array([[0, 1, 2]], dtype=int)

    ascii_out = tmp_path / "test_ascii.stl"
    binary_out = tmp_path / "test_binary.stl"

    # Create both files
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", DeprecationWarning)
        write_ascii_stl(str(ascii_out), "TestModel", verts, faces)

    write_stl_binary(str(binary_out), "TestModel", verts, faces)

    # Validate ASCII STL structure
    ascii_content = ascii_out.read_text()
    assert ascii_content.startswith("solid TestModel")
    assert ascii_content.endswith("endsolid TestModel\n")
    assert "facet normal" in ascii_content
    assert "vertex" in ascii_content

    # Validate binary STL structure
    binary_data = binary_out.read_bytes()
    # Header (80 bytes) + triangle count (4 bytes) + 1 triangle (50 bytes)
    assert len(binary_data) == 84 + 50
    # Triangle count should be 1
    tri_count = int.from_bytes(binary_data[80:84], "little")
    assert tri_count == 1


def test_binary_stl_api_documentation():
    """Binary STL function should have comprehensive documentation."""
    assert write_stl_binary.__doc__ is not None
    doc = write_stl_binary.__doc__.lower()
    assert "recommended" in doc or "binary" in doc
    assert "args:" in doc or "parameters" in doc


def test_migration_path_documented():
    """Deprecation message should guide users to binary STL."""
    verts = np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0]], dtype=float)
    faces = np.array([[0, 1, 2]], dtype=int)

    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always", DeprecationWarning)
        write_ascii_stl("/tmp/test.stl", "test", verts, faces)

        msg = str(w[0].message)
        # Should mention the replacement function
        assert "write_stl_binary" in msg
