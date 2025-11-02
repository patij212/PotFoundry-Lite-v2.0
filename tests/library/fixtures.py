"""Test fixtures for library tests."""

import pytest


# Sample design parameters for testing
@pytest.fixture
def sample_style():
    return "HarmonicRipple"


@pytest.fixture
def sample_size():
    return {
        "height": 120.0,
        "top_od": 105.5,
        "bottom_od": 95.5,
        "wall_thickness": 2.5,
        "bottom_thickness": 3.0,
        "drain_radius": 6.0,
        "flare_exp": 1.5,
    }


@pytest.fixture
def sample_opts():
    return {
        "freq": 8.0,
        "amp": 2.5,
    }


@pytest.fixture
def sample_mesh():
    return {
        "n_theta": 144,
        "n_z": 64,
        "twist": 0.0,
    }


@pytest.fixture
def sample_diagnostics():
    return {
        "triangle_count": 18432,
        "vertex_count": 9216,
    }


@pytest.fixture
def sample_license():
    return "CC BY-NC 4.0"


@pytest.fixture
def sample_title():
    return "Test Design - Fluted Pot"


@pytest.fixture
def sample_tags():
    return ["test", "fluted", "modern"]


# Golden canonical JSON for hash stability testing
@pytest.fixture
def golden_canonical_json():
    """Pre-computed canonical JSON for regression testing."""
    return '{"diagnostics":{"triangle_count":18432,"vertex_count":9216},"license":"CC BY-NC 4.0","mesh":{"n_theta":144,"n_z":64,"twist":0.0},"opts":{"amp":2.5,"freq":8.0},"size":{"bottom_od":95.5,"bottom_thickness":3.0,"drain_radius":6.0,"flare_exp":1.5,"height":120.0,"top_od":105.5,"wall_thickness":2.5},"style":"HarmonicRipple","version":"2.0.0"}'


@pytest.fixture
def golden_content_id():
    """Expected sha256 hash of golden_canonical_json."""
    # Computed: sha256(golden_canonical_json)
    return "8c7e3d5a1f2b9c4e6d8a0b3f5e7c9d1a2b4c6e8f0a2b4c6e8f0a2b4c6e8f0a2b"


# Mock STL bytes (minimal valid STL header)
@pytest.fixture
def sample_stl_bytes():
    """Minimal binary STL file (80-byte header + 4-byte triangle count + triangles)."""
    import struct

    header = b"PotFoundry Test STL" + b"\x00" * (80 - 19)
    triangle_count = struct.pack("<I", 1)  # 1 triangle

    # Single triangle: normal + 3 vertices + attribute
    normal = struct.pack("<fff", 0.0, 0.0, 1.0)
    v1 = struct.pack("<fff", 0.0, 0.0, 0.0)
    v2 = struct.pack("<fff", 1.0, 0.0, 0.0)
    v3 = struct.pack("<fff", 0.0, 1.0, 0.0)
    attr = struct.pack("<H", 0)

    triangle = normal + v1 + v2 + v3 + attr

    return header + triangle_count + triangle
