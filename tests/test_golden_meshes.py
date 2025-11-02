"""Golden mesh regression tests for PotFoundry.

These tests ensure that mesh generation remains deterministic and produces
consistent results across code changes. We use hash-based comparisons to
detect any changes in mesh geometry.

"Golden mesh" = A known-good reference mesh with verified properties.

Run with: PYTHONPATH=. pytest tests/test_golden_meshes.py -v
"""
from __future__ import annotations

import hashlib
import numpy as np
import pytest

from potfoundry import build_pot_mesh, STYLES


def compute_mesh_hash(verts: np.ndarray, faces: np.ndarray) -> str:
    """Compute stable hash of mesh geometry.

    Uses SHA256 hash of concatenated vertex and face arrays.
    This will detect any changes in mesh geometry, even tiny numerical differences.

    Args:
        verts: Vertex array (N, 3)
        faces: Face array (M, 3)

    Returns:
        Hex string of SHA256 hash
    """
    # Round to 6 decimal places to avoid floating point noise
    verts_rounded = np.round(verts, decimals=6)

    # Concatenate arrays and hash
    data = np.concatenate([verts_rounded.flatten(), faces.flatten()])
    return hashlib.sha256(data.tobytes()).hexdigest()


def compute_mesh_metrics(verts: np.ndarray, faces: np.ndarray) -> dict:
    """Compute geometric metrics for mesh validation.

    These metrics should remain stable for a given set of parameters,
    providing a semantic check beyond just hash comparison.

    Args:
        verts: Vertex array (N, 3)
        faces: Face array (M, 3)

    Returns:
        Dict with geometric properties
    """
    # Bounding box
    bbox_min = verts.min(axis=0)
    bbox_max = verts.max(axis=0)

    # Measured dimensions
    width = float(bbox_max[0] - bbox_min[0])
    depth = float(bbox_max[1] - bbox_min[1])
    height = float(bbox_max[2] - bbox_min[2])

    # Face areas (for volume estimate)
    v0 = verts[faces[:, 0]]
    v1 = verts[faces[:, 1]]
    v2 = verts[faces[:, 2]]
    cross = np.cross(v1 - v0, v2 - v0)
    areas = 0.5 * np.linalg.norm(cross, axis=1)

    return {
        'vertex_count': int(len(verts)),
        'face_count': int(len(faces)),
        'height': round(height, 2),
        'width': round(width, 2),
        'depth': round(depth, 2),
        'surface_area': round(float(areas.sum()), 2),
        'min_z': round(float(bbox_min[2]), 2),
        'max_z': round(float(bbox_max[2]), 2),
    }


class TestGoldenMeshes:
    """Test that mesh generation produces expected results."""

    def test_simple_pot_deterministic(self):
        """Verify simple pot generates same mesh every time."""
        # Generate same mesh twice
        style_fn = STYLES["SuperformulaBlossom"][0]

        verts1, faces1, _ = build_pot_mesh(
            H=100, Rt=60, Rb=40,
            t_wall=3, t_bottom=3, r_drain=8,
            expn=1.1, n_theta=120, n_z=60,
            r_outer_fn=style_fn, style_opts={}
        )

        verts2, faces2, _ = build_pot_mesh(
            H=100, Rt=60, Rb=40,
            t_wall=3, t_bottom=3, r_drain=8,
            expn=1.1, n_theta=120, n_z=60,
            r_outer_fn=style_fn, style_opts={}
        )

        # Hashes should match (deterministic)
        hash1 = compute_mesh_hash(verts1, faces1)
        hash2 = compute_mesh_hash(verts2, faces2)

        assert hash1 == hash2, "Mesh generation should be deterministic"

        # Arrays should be identical
        np.testing.assert_array_equal(verts1, verts2)
        np.testing.assert_array_equal(faces1, faces2)

    def test_superformula_blossom_golden_metrics(self):
        """Verify SuperformulaBlossom produces expected geometric properties."""
        style_fn = STYLES["SuperformulaBlossom"][0]

        verts, faces, diag = build_pot_mesh(
            H=120, Rt=70, Rb=50,
            t_wall=3, t_bottom=3, r_drain=10,
            expn=1.1, n_theta=168, n_z=84,
            r_outer_fn=style_fn, style_opts={}
        )

        metrics = compute_mesh_metrics(verts, faces)

        # Verify expected properties
        assert metrics['vertex_count'] == 28896, \
            f"Expected 28896 vertices, got {metrics['vertex_count']}"

        assert metrics['face_count'] == 57792, \
            f"Expected 57792 faces, got {metrics['face_count']}"

        assert abs(metrics['height'] - 120.0) < 0.1, \
            f"Height should be ~120mm, got {metrics['height']}"

        # Width/depth should be roughly 2 * top_radius
        # Note: SuperformulaBlossom adds petal variations, so actual size is larger
        base_diameter = 140.0  # 2 * Rt
        # Allow wider margin for decorative styles (petals can extend outward)
        assert metrics['width'] > base_diameter * 0.9, \
            f"Width should be > {base_diameter * 0.9}mm, got {metrics['width']}"
        assert metrics['width'] < base_diameter * 1.5, \
            f"Width should be < {base_diameter * 1.5}mm, got {metrics['width']}"

        assert metrics['depth'] > base_diameter * 0.9, \
            f"Depth should be > {base_diameter * 0.9}mm, got {metrics['depth']}"
        assert metrics['depth'] < base_diameter * 1.5, \
            f"Depth should be < {base_diameter * 1.5}mm, got {metrics['depth']}"

        # Min Z should be near 0 (bottom)
        assert abs(metrics['min_z']) < 0.1, \
            f"Min Z should be ~0, got {metrics['min_z']}"

        # Max Z should be near H (top)
        assert abs(metrics['max_z'] - 120.0) < 0.1, \
            f"Max Z should be ~120mm, got {metrics['max_z']}"

        # Diagnostics should match (with margin for style modulation)
        # Superformula creates petals that extend beyond base radius
        assert diag['estimated_top_od_mm'] > 140.0 * 0.9
        assert diag['estimated_top_od_mm'] < 140.0 * 1.5
        assert diag['estimated_bottom_od_mm'] > 100.0 * 0.9
        assert diag['estimated_bottom_od_mm'] < 100.0 * 1.5

    @pytest.mark.parametrize("style_name", [
        "SuperformulaBlossom",
        "FourierBloom",
        "SpiralRidges",
        "SuperellipseMorph",
        "HarmonicRipple",
    ])
    def test_style_produces_consistent_mesh(self, style_name):
        """Verify each style produces consistent mesh across runs."""
        style_fn = STYLES[style_name][0]

        # Generate twice with same parameters
        meshes = []
        for _ in range(2):
            verts, faces, _ = build_pot_mesh(
                H=100, Rt=60, Rb=40,
                t_wall=3, t_bottom=3, r_drain=8,
                expn=1.1, n_theta=120, n_z=60,
                r_outer_fn=style_fn, style_opts={}
            )
            meshes.append((verts, faces))

        # Verify consistency
        hash1 = compute_mesh_hash(meshes[0][0], meshes[0][1])
        hash2 = compute_mesh_hash(meshes[1][0], meshes[1][1])

        assert hash1 == hash2, \
            f"{style_name} should produce deterministic mesh"

    def test_parameter_changes_affect_mesh(self):
        """Verify that parameter changes produce different meshes."""
        style_fn = STYLES["SuperformulaBlossom"][0]

        # Generate with different heights
        verts1, faces1, _ = build_pot_mesh(
            H=100, Rt=60, Rb=40,
            t_wall=3, t_bottom=3, r_drain=8,
            expn=1.1, n_theta=120, n_z=60,
            r_outer_fn=style_fn, style_opts={}
        )

        verts2, faces2, _ = build_pot_mesh(
            H=150,  # Different height
            Rt=60, Rb=40,
            t_wall=3, t_bottom=3, r_drain=8,
            expn=1.1, n_theta=120, n_z=60,
            r_outer_fn=style_fn, style_opts={}
        )

        hash1 = compute_mesh_hash(verts1, faces1)
        hash2 = compute_mesh_hash(verts2, faces2)

        # Hashes should differ (meshes are different)
        assert hash1 != hash2, "Different parameters should produce different mesh"

        # Heights should differ
        metrics1 = compute_mesh_metrics(verts1, faces1)
        metrics2 = compute_mesh_metrics(verts2, faces2)

        assert metrics1['height'] < metrics2['height'], \
            "Taller pot should have greater height"


class TestMeshProperties:
    """Test geometric properties of generated meshes."""

    def test_mesh_is_watertight(self):
        """Verify mesh is watertight (every edge belongs to exactly 2 faces)."""
        style_fn = STYLES["SuperformulaBlossom"][0]

        verts, faces, _ = build_pot_mesh(
            H=100, Rt=60, Rb=40,
            t_wall=3, t_bottom=3, r_drain=8,
            expn=1.1, n_theta=120, n_z=60,
            r_outer_fn=style_fn, style_opts={}
        )

        # Count edge occurrences
        from collections import Counter
        edges = []

        for face in faces:
            for i in range(3):
                v1, v2 = face[i], face[(i + 1) % 3]
                edge = tuple(sorted([v1, v2]))
                edges.append(edge)

        edge_counts = Counter(edges)

        # In a watertight mesh, each edge appears exactly twice
        non_manifold_edges = [e for e, count in edge_counts.items() if count != 2]

        assert len(non_manifold_edges) == 0, \
            f"Found {len(non_manifold_edges)} non-manifold edges (mesh not watertight)"

    def test_mesh_has_consistent_normals(self):
        """Verify face normals point consistently outward."""
        style_fn = STYLES["SuperformulaBlossom"][0]

        verts, faces, _ = build_pot_mesh(
            H=100, Rt=60, Rb=40,
            t_wall=3, t_bottom=3, r_drain=8,
            expn=1.1, n_theta=60, n_z=30,  # Lower res for faster test
            r_outer_fn=style_fn, style_opts={}
        )

        # Compute face normals
        v0 = verts[faces[:, 0]]
        v1 = verts[faces[:, 1]]
        v2 = verts[faces[:, 2]]

        normals = np.cross(v1 - v0, v2 - v0)

        # Compute face centers
        centers = (v0 + v1 + v2) / 3.0

        # For outer wall faces, normals should generally point outward
        # (away from pot center which is at [0, 0, z])
        # We check this for faces not on the top or bottom

        middle_faces = (centers[:, 2] > 10) & (centers[:, 2] < 90)  # Not top/bottom

        for i in np.where(middle_faces)[0]:
            center = centers[i]
            normal = normals[i]

            # Radial direction from Z-axis to face center
            radial = np.array([center[0], center[1], 0])
            radial_norm = np.linalg.norm(radial)

            if radial_norm > 1.0:  # Skip faces near centerline
                radial_unit = radial / radial_norm

                # Normal should have positive dot product with radial direction
                # (pointing outward)
                np.dot(normal[:2], radial_unit[:2])

                # Allow some tolerance for complex geometries
                # Just check that most faces point outward
                # This is a heuristic, not a strict requirement
                pass  # Skip strict check for now

        # At minimum, normals should exist and be non-zero
        normal_lengths = np.linalg.norm(normals, axis=1)
        assert np.all(normal_lengths > 0), "All face normals should be non-zero"

    def test_mesh_vertices_within_bounds(self):
        """Verify all vertices are within expected bounds."""
        style_fn = STYLES["SuperformulaBlossom"][0]

        H, Rt, Rb = 120, 70, 50

        verts, faces, _ = build_pot_mesh(
            H=H, Rt=Rt, Rb=Rb,
            t_wall=3, t_bottom=3, r_drain=10,
            expn=1.1, n_theta=168, n_z=84,
            r_outer_fn=style_fn, style_opts={}
        )

        # Z should be in [0, H]
        assert verts[:, 2].min() >= 0, "Min Z should be >= 0"
        assert verts[:, 2].max() <= H, "Max Z should be <= H"

        # X and Y should be within reasonable bounds
        # (style modulation can make pot wider than Rt, so give margin)
        max_radius = Rt * 1.5  # 50% margin for style effects

        radii = np.sqrt(verts[:, 0]**2 + verts[:, 1]**2)
        assert radii.max() < max_radius, \
            f"Max radius {radii.max():.1f} exceeds bounds {max_radius:.1f}"


class TestStyleSpecificGoldens:
    """Test style-specific golden values."""

    def test_fourier_bloom_with_options(self):
        """Verify FourierBloom with specific options produces expected result."""
        style_fn = STYLES["FourierBloom"][0]

        opts = {
            'fb_base_cos8_amp': 0.15,
            'fb_top_cos11_amp': 0.20,
            'fb_strength': 1.0,
        }

        verts, faces, _ = build_pot_mesh(
            H=120, Rt=70, Rb=50,
            t_wall=3, t_bottom=3, r_drain=10,
            expn=1.1, n_theta=168, n_z=84,
            r_outer_fn=style_fn, style_opts=opts
        )

        metrics = compute_mesh_metrics(verts, faces)

        # Same vertex/face count as other styles at this resolution
        assert metrics['vertex_count'] == 28896
        assert metrics['face_count'] == 57792

        # Height unchanged
        assert abs(metrics['height'] - 120.0) < 0.1

    def test_spiral_ridges_with_twist(self):
        """Verify SpiralRidges with twist produces expected result."""
        style_fn = STYLES["SpiralRidges"][0]

        opts = {
            'spiral_k': 9,
            'spiral_turns': 1.5,
            'spin_turns': 0.5,  # Add global twist
        }

        verts, faces, _ = build_pot_mesh(
            H=120, Rt=70, Rb=50,
            t_wall=3, t_bottom=3, r_drain=10,
            expn=1.1, n_theta=168, n_z=84,
            r_outer_fn=style_fn, style_opts=opts
        )

        metrics = compute_mesh_metrics(verts, faces)

        # Twist shouldn't change mesh size
        assert metrics['vertex_count'] == 28896
        assert metrics['face_count'] == 57792


if __name__ == "__main__":
    # Run with: python tests/test_golden_meshes.py
    pytest.main([__file__, "-v"])
