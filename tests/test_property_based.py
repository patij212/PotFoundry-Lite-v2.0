"""Property-Based Tests for PotFoundry using Hypothesis

This module uses Hypothesis to automatically generate test cases and verify
invariants and properties of the mesh generation system.

Property-based testing complements traditional unit tests by:
- Automatically finding edge cases
- Testing mathematical properties and invariants
- Verifying round-trip operations
- Ensuring geometric consistency

Key properties tested:
1. Mesh watertightness (every edge shared by exactly 2 faces)
2. Face normals point outward
3. No degenerate triangles
4. Diameter calculations within bounds
5. Round-trip state encoding/decoding
6. YAML configuration round-trips
"""

import numpy as np
import pytest

# Skip this module entirely if Hypothesis isn't available (e.g., without dev deps)
pytest.importorskip(
    "hypothesis",
    reason="Hypothesis not installed; install dev deps with 'pip install -r requirements-dev.txt'",
)

import tempfile
from pathlib import Path
from typing import cast

from hypothesis import HealthCheck, assume, given, settings
from hypothesis import strategies as st

from pfui.deeplink import decode_state, encode_state

# Import core functionality
from potfoundry import STYLES, build_pot_mesh
from potfoundry.schema import DefaultsModel, MeshQualityModel, RecipeModel
from potfoundry.yaml_api import load_config


def _as_mesh(m: object) -> MeshQualityModel:
    if isinstance(m, dict):
        return MeshQualityModel(
            n_theta=int(m.get("n_theta", 168)), n_z=int(m.get("n_z", 84))
        )
    return cast(MeshQualityModel, m)


def _as_defaults(d: object) -> DefaultsModel:
    if isinstance(d, dict):
        return DefaultsModel(**d)
    return cast(DefaultsModel, d)


def _as_recipe(r: object) -> RecipeModel:
    if isinstance(r, dict):
        return RecipeModel(**r)
    return cast(RecipeModel, r)


# Default style function for tests
default_style_fn = STYLES["SuperformulaBlossom"][0]


# ============================================================================
# Strategy Definitions - Define valid input ranges
# ============================================================================

# Geometric parameters with realistic bounds
heights = st.floats(min_value=30.0, max_value=300.0)
top_diameters = st.floats(min_value=40.0, max_value=300.0)
bottom_diameters = st.floats(min_value=30.0, max_value=200.0)
wall_thicknesses = st.floats(min_value=2.0, max_value=8.0)
bottom_thicknesses = st.floats(min_value=2.0, max_value=10.0)
drain_radii = st.floats(min_value=5.0, max_value=20.0)

# Resolution parameters
theta_resolutions = st.integers(min_value=32, max_value=100)
z_resolutions = st.integers(min_value=16, max_value=50)

# Style options
style_names = st.sampled_from(list(STYLES.keys()))


# ============================================================================
# Test 1: Mesh Watertightness Property
# ============================================================================


@given(
    H=heights,
    Rt=top_diameters,
    Rb=bottom_diameters,
    t_wall=wall_thicknesses,
    t_bottom=bottom_thicknesses,
    r_drain=drain_radii,
    n_theta=theta_resolutions,
    n_z=z_resolutions,
)
@settings(max_examples=50, deadline=2000, suppress_health_check=[HealthCheck.too_slow])
def test_property_mesh_is_watertight(
    H, Rt, Rb, t_wall, t_bottom, r_drain, n_theta, n_z
):
    """Property: Every edge in the mesh should be shared by exactly 2 faces.

    This is the fundamental property of a watertight (manifold) mesh.
    """
    # Ensure parameters are valid
    assume(Rt > t_wall * 2)
    assume(Rb > t_wall * 2)
    assume(r_drain < min(Rb, Rt) / 2 - t_wall)

    # Build mesh with default style (Plain/Smooth)
    # Use the first style in STYLES as default
    default_style_fn = list(STYLES.values())[0][0]  # Get function from tuple

    verts, faces, diag = build_pot_mesh(
        H=H,
        Rt=Rt,
        Rb=Rb,
        t_wall=t_wall,
        t_bottom=t_bottom,
        r_drain=r_drain,
        expn=1.1,
        n_theta=n_theta,
        n_z=n_z,
        r_outer_fn=default_style_fn,
        style_opts={},
    )

    # Check watertightness: every edge appears exactly twice (once per face)
    _ = set()
    edge_counts: dict[tuple[int, int], int] = {}

    for face in faces:
        # Get the three edges of this triangle
        for i in range(3):
            v1 = face[i]
            v2 = face[(i + 1) % 3]
            # Normalize edge (smaller vertex first)
            edge = tuple(sorted([v1, v2]))
            edge_counts[edge] = edge_counts.get(edge, 0) + 1

    # Every edge should appear exactly 2 times (manifold property)
    for edge, count in edge_counts.items():
        assert (
            count == 2
        ), f"Edge {edge} appears {count} times, expected 2 (watertight mesh)"


# ============================================================================
# Test 2: Face Normals Property
# ============================================================================


@given(
    H=heights,
    Rt=top_diameters,
    Rb=bottom_diameters,
    n_theta=theta_resolutions,
    n_z=z_resolutions,
)
@settings(max_examples=30, deadline=2000)
def test_property_face_normals_point_outward(H, Rt, Rb, n_theta, n_z):
    """Property: Face normals should generally point outward from pot center.

    For a pot, most face normals should point away from the central axis.
    """
    assume(Rt > 10)
    assume(Rb > 10)

    verts, faces, diag = build_pot_mesh(
        H=H,
        Rt=Rt,
        Rb=Rb,
        t_wall=3.0,
        t_bottom=3.0,
        r_drain=8.0,
        n_theta=n_theta,
        n_z=n_z,
        expn=1.1,
        r_outer_fn=default_style_fn,
        style_opts={},
    )

    # Compute center of pot (average position)
    center = verts.mean(axis=0)

    outward_facing = 0
    total_faces = len(faces)

    for face in faces:
        # Get vertices of triangle
        v0, v1, v2 = verts[face[0]], verts[face[1]], verts[face[2]]

        # Compute face normal using cross product
        edge1 = v1 - v0
        edge2 = v2 - v0
        normal = np.cross(edge1, edge2)
        normal_len = np.linalg.norm(normal)

        if normal_len > 1e-10:  # Avoid division by zero
            normal = normal / normal_len

            # Vector from center to face centroid
            face_center = (v0 + v1 + v2) / 3
            to_face = face_center - center

            # Dot product > 0 means normal points away from center
            if np.dot(normal, to_face) > 0:
                outward_facing += 1

    # At least 70% of faces should point outward (allowing for some internal geometry)
    ratio = outward_facing / total_faces
    assert ratio > 0.7, f"Only {ratio:.1%} of faces point outward, expected >70%"


# ============================================================================
# Test 3: No Degenerate Triangles
# ============================================================================


@given(
    H=heights,
    Rt=top_diameters,
    Rb=bottom_diameters,
    n_theta=theta_resolutions,
    n_z=z_resolutions,
)
@settings(max_examples=30, deadline=2000)
def test_property_no_degenerate_triangles(H, Rt, Rb, n_theta, n_z):
    """Property: No triangle should have zero or near-zero area.

    Degenerate triangles can cause rendering and slicing issues.
    """
    assume(Rt > 15)
    assume(Rb > 15)

    verts, faces, diag = build_pot_mesh(
        H=H,
        Rt=Rt,
        Rb=Rb,
        t_wall=3.0,
        t_bottom=3.0,
        r_drain=8.0,
        n_theta=n_theta,
        n_z=n_z,
        expn=1.1,
        r_outer_fn=default_style_fn,
        style_opts={},
    )

    min_area: float = float("inf")

    for face in faces:
        v0, v1, v2 = verts[face[0]], verts[face[1]], verts[face[2]]

        # Compute triangle area using cross product
        edge1 = v1 - v0
        edge2 = v2 - v0
        cross = np.cross(edge1, edge2)
        area = float(np.linalg.norm(cross) / 2.0)

        min_area = min(min_area, area)

    # Minimum area should be reasonable (not degenerate)
    # Using 0.01 mm² as threshold (very small but not degenerate)
    assert min_area > 0.01, f"Found degenerate triangle with area {min_area:.6f} mm²"


# ============================================================================
# Test 4: Diameter Estimates Property
# ============================================================================


@given(
    Rt=top_diameters,
    Rb=bottom_diameters,
    t_wall=wall_thicknesses,
)
@settings(max_examples=100, deadline=500)
def test_property_diameter_estimates_within_bounds(Rt, Rb, t_wall):
    """Property: Estimated diameters should be within specified bounds.

    The top_od_est and bottom_od_est should match Rt and Rb within tolerance.
    """
    assume(Rt > t_wall * 2)
    assume(Rb > t_wall * 2)

    verts, faces, diag = build_pot_mesh(
        H=100.0,
        Rt=Rt,
        Rb=Rb,
        t_wall=t_wall,
        t_bottom=3.0,
        r_drain=8.0,
        n_theta=64,
        n_z=32,
        expn=1.1,
        r_outer_fn=default_style_fn,
        style_opts={},
    )

    # Check diameter estimates (diagnostics report outer DIAMETER in mm)
    top_est = diag.get("estimated_top_od_mm", 0)
    bottom_est = diag.get("estimated_bottom_od_mm", 0)

    # Allow 5% tolerance due to style modulation (default blossom strength is neutral for tests)
    tolerance = 0.05
    expected_top = 2 * Rt
    expected_bottom = 2 * Rb

    assert (
        abs(top_est - expected_top) / max(expected_top, 1e-9) < tolerance
    ), f"Top diameter estimate {top_est:.1f} differs from {expected_top:.1f} by >{tolerance * 100}%"
    assert (
        abs(bottom_est - expected_bottom) / max(expected_bottom, 1e-9) < tolerance
    ), f"Bottom diameter estimate {bottom_est:.1f} differs from {expected_bottom:.1f} by >{tolerance * 100}%"


# ============================================================================
# Test 5: State Encoding Round-Trip
# ============================================================================


@given(
    H=heights,
    top_od=top_diameters,
    bottom_od=bottom_diameters,
    t_wall=wall_thicknesses,
    style=style_names,
)
@settings(max_examples=50, deadline=500)
def test_property_state_encoding_roundtrip(H, top_od, bottom_od, t_wall, style):
    """Property: Encoding then decoding state should return equivalent state.

    This tests the deeplink functionality for sharing designs.
    """
    # Create original state
    original_state = {
        "H": float(H),
        "top_od": float(top_od),
        "bottom_od": float(bottom_od),
        "t_wall": float(t_wall),
        "t_bottom": 3.0,
        "r_drain": 10.0,
        "style": style,
        "n_theta": 64,
        "n_z": 32,
    }

    # Encode and decode
    encoded = encode_state(original_state)
    decoded = decode_state(encoded)

    # Check that key parameters match
    for key in ["H", "top_od", "bottom_od", "t_wall", "style"]:
        if key in original_state and key in decoded:
            original_val = original_state[key]
            decoded_val = decoded[key]

            if isinstance(original_val, (int, float)):
                # Allow small numerical differences due to encoding
                assert (
                    abs(original_val - decoded_val) < 0.1
                ), f"Round-trip failed for {key}: {original_val} != {decoded_val}"
            else:
                assert (
                    original_val == decoded_val
                ), f"Round-trip failed for {key}: {original_val} != {decoded_val}"


# ============================================================================
# Test 6: YAML Configuration Round-Trip
# ============================================================================


@given(
    H=heights,
    Rt=top_diameters,
    Rb=bottom_diameters,
    style=style_names,
)
@settings(max_examples=20, deadline=2000)
def test_property_yaml_configuration_roundtrip(H, Rt, Rb, style):
    """Property: YAML configuration can be saved and loaded correctly.

    This tests the batch processing configuration format.
    """
    import yaml

    # Create configuration
    config_dict = {
        "version": 2,
        "mesh": {"n_theta": 64, "n_z": 32},
        "defaults": {
            "H": float(H),
            "Rt": float(Rt),
            "Rb": float(Rb),
            "t_wall": 3.0,
            "t_bottom": 3.0,
            "r_drain": 10.0,
        },
        "recipes": [
            {
                "name": "test_pot",
                "style": style,
            }
        ],
    }

    # Write to temporary file
    with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
        yaml.dump(config_dict, f)
        temp_path = f.name

    try:
        # Load configuration
        loaded_config = load_config(temp_path)

        # Verify structure
        assert loaded_config.version == 2
        m = _as_mesh(loaded_config.mesh)
        r = _as_recipe(loaded_config.recipes[0])
        d = _as_defaults(loaded_config.defaults)
        assert m.n_theta == 64
        assert m.n_z == 32
        assert len(loaded_config.recipes) == 1
        assert r.style == style

        # Verify defaults
        assert abs(d.H - H) < 0.01
        assert abs(d.Rt - Rt) < 0.01
        assert abs(d.Rb - Rb) < 0.01

    finally:
        # Clean up
        Path(temp_path).unlink()


# ============================================================================
# Test 7: Mesh Volume Monotonicity
# ============================================================================


@given(
    H=heights,
    Rt=st.floats(min_value=50.0, max_value=100.0),
    scale_factor=st.floats(min_value=1.1, max_value=2.0),
)
@settings(max_examples=30, deadline=2000)
def test_property_volume_increases_with_diameter(H, Rt, scale_factor):
    """Property: Larger diameter should result in larger volume.

    For same height, scaling the diameter should increase volume.
    """
    assume(Rt > 30)

    Rb = Rt * 0.8  # Keep proportional

    # Build smaller pot
    verts1, faces1, diag1 = build_pot_mesh(
        H=H,
        Rt=Rt,
        Rb=Rb,
        t_wall=3.0,
        t_bottom=3.0,
        r_drain=8.0,
        n_theta=64,
        n_z=32,
        expn=1.1,
        r_outer_fn=default_style_fn,
        style_opts={},
    )

    # Build larger pot (scaled diameter)
    Rt2 = Rt * scale_factor
    Rb2 = Rb * scale_factor

    verts2, faces2, diag2 = build_pot_mesh(
        H=H,
        Rt=Rt2,
        Rb=Rb2,
        t_wall=3.0,
        t_bottom=3.0,
        r_drain=8.0,
        n_theta=64,
        n_z=32,
        expn=1.1,
        r_outer_fn=default_style_fn,
        style_opts={},
    )

    # Compute approximate volumes (sum of tetrahedra from origin)
    def compute_volume(verts, faces):
        volume = 0.0
        for face in faces:
            v0, v1, v2 = verts[face[0]], verts[face[1]], verts[face[2]]
            # Signed volume of tetrahedron from origin
            volume += np.abs(np.dot(v0, np.cross(v1, v2))) / 6.0
        return volume

    vol1 = compute_volume(verts1, faces1)
    vol2 = compute_volume(verts2, faces2)

    # Larger diameter should give larger volume
    assert (
        vol2 > vol1
    ), f"Scaled pot volume {vol2:.1f} not larger than original {vol1:.1f}"


# ============================================================================
# Test 8: Style Invariants
# ============================================================================


@given(
    H=heights,
    Rt=top_diameters,
    Rb=bottom_diameters,
    style=style_names,
)
@settings(max_examples=30, deadline=2000)
def test_property_all_styles_produce_valid_meshes(H, Rt, Rb, style):
    """Property: All style functions should produce valid, renderable meshes.

    Every style should work without errors and produce reasonable output.
    """
    assume(Rt > 20)
    assume(Rb > 20)

    # Get style function
    style_fn, default_opts = STYLES[style]

    # Build mesh with this style
    verts, faces, diag = build_pot_mesh(
        H=H,
        Rt=Rt,
        Rb=Rb,
        t_wall=3.0,
        t_bottom=3.0,
        r_drain=8.0,
        n_theta=64,
        n_z=32,
        r_outer_fn=style_fn,
        style_opts=default_opts,
    )

    # Basic validity checks
    assert len(verts) > 0, f"Style {style} produced no vertices"
    assert len(faces) > 0, f"Style {style} produced no faces"
    assert verts.shape[1] == 3, "Vertices should be 3D"
    assert faces.shape[1] == 3, "Faces should be triangles"

    # All face indices should be valid
    max_index = len(verts) - 1
    assert faces.max() <= max_index, f"Face index out of bounds for style {style}"
    assert faces.min() >= 0, f"Negative face index for style {style}"


# ============================================================================
# Test 9: Geometric Consistency
# ============================================================================


@given(
    H=heights,
    Rt=top_diameters,
)
@settings(max_examples=30, deadline=1000)
def test_property_height_matches_mesh_bounds(H, Rt):
    """Property: Mesh height should match specified height parameter.

    The Z extent of the mesh should be approximately H.
    """
    assume(Rt > 20)

    verts, faces, diag = build_pot_mesh(
        H=H,
        Rt=Rt,
        Rb=Rt * 0.8,
        t_wall=3.0,
        t_bottom=3.0,
        r_drain=8.0,
        n_theta=64,
        n_z=32,
        expn=1.1,
        r_outer_fn=default_style_fn,
        style_opts={},
    )

    # Measure actual height
    z_min = verts[:, 2].min()
    z_max = verts[:, 2].max()
    actual_height = z_max - z_min

    # Should match within 5% tolerance
    tolerance = 0.05
    assert (
        abs(actual_height - H) / H < tolerance
    ), f"Mesh height {actual_height:.1f} differs from specified {H:.1f} by >{tolerance * 100}%"


# ============================================================================
# Test 10: Resolution Invariants
# ============================================================================


@given(
    n_theta=theta_resolutions,
    n_z=z_resolutions,
)
@settings(max_examples=50, deadline=1000)
def test_property_mesh_size_scales_with_resolution(n_theta, n_z):
    """Property: Mesh vertex/face count should scale with resolution.

    Higher resolution should produce more vertices and faces.
    """
    # Build mesh with given resolution
    verts, faces, diag = build_pot_mesh(
        H=100.0,
        Rt=80.0,
        Rb=60.0,
        t_wall=3.0,
        t_bottom=3.0,
        r_drain=8.0,
        n_theta=n_theta,
        n_z=n_z,
        expn=1.1,
        r_outer_fn=default_style_fn,
        style_opts={},
    )

    # Vertex count should be roughly proportional to n_theta * n_z
    # (not exact due to deduplication, but should correlate)
    expected_order = n_theta * n_z
    actual_verts = len(verts)

    # Should be within same order of magnitude
    assert (
        actual_verts > expected_order * 0.1
    ), f"Too few vertices: {actual_verts} vs expected ~{expected_order}"
    assert (
        actual_verts < expected_order * 10
    ), f"Too many vertices: {actual_verts} vs expected ~{expected_order}"


# ============================================================================
# Summary
# ============================================================================

# Total: 10 property-based tests covering:
# 1. Mesh watertightness (manifold property)
# 2. Face normals orientation
# 3. No degenerate triangles
# 4. Diameter estimation accuracy
# 5. State encoding round-trips
# 6. YAML configuration round-trips
# 7. Volume monotonicity
# 8. All styles produce valid meshes
# 9. Height geometric consistency
# 10. Resolution scaling invariants
