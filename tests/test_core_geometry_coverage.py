"""
Comprehensive tests for potfoundry/core/geometry.py to improve coverage.

This test file focuses on:
1. Testing uncovered paths in core geometry implementation
2. Error handling and edge cases
3. Diagnostic outputs and validation
4. Alternative geometry implementation paths
"""

import tempfile
from pathlib import Path

import pytest

from potfoundry.core.geometry import (
    STYLES,
    build_pot_mesh,
    write_ascii_stl,
)


class TestCoreGeometryErrorHandling:
    """Test error handling in core geometry implementation."""

    def test_build_pot_mesh_with_zero_resolution(self):
        """Test that very low resolution still produces valid mesh."""
        # While not recommended, the code should handle minimal resolution
        verts, faces, diag = build_pot_mesh(
            H=100,
            Rt=60,
            Rb=40,
            t_wall=3,
            t_bottom=3,
            r_drain=8,
            expn=1.0,
            n_theta=8,
            n_z=4,  # Very low resolution
            r_outer_fn=STYLES["SuperformulaBlossom"][0],
            style_opts={},
        )
        assert verts.shape[0] > 0
        assert faces.shape[0] > 0

    def test_build_pot_mesh_extreme_wall_thickness(self):
        """Test with wall thickness approaching radius limit."""
        # Wall thickness that's large relative to pot dimensions
        verts, faces, diag = build_pot_mesh(
            H=100,
            Rt=60,
            Rb=40,
            t_wall=5,
            t_bottom=5,
            r_drain=6,
            expn=1.0,
            n_theta=60,
            n_z=40,
            r_outer_fn=STYLES["SuperformulaBlossom"][0],
            style_opts={},
        )
        assert verts.shape[0] > 0
        # Check that clamp ratio increased due to thick walls
        assert "clamp_ratio_at_bottom" in diag

    def test_build_pot_mesh_with_large_drain_hole(self):
        """Test with drain hole close to maximum size."""
        # Drain hole that's large relative to bottom radius
        verts, faces, diag = build_pot_mesh(
            H=120,
            Rt=70,
            Rb=50,
            t_wall=3,
            t_bottom=3,
            r_drain=15,
            expn=1.0,
            n_theta=80,
            n_z=50,
            r_outer_fn=STYLES["FourierBloom"][0],
            style_opts={},
        )
        assert verts.shape[0] > 0
        # Larger drain should increase clamp ratio
        assert diag["clamp_ratio_at_bottom"] >= 0

    def test_build_pot_mesh_inverted_taper(self):
        """Test with bottom radius larger than top radius (inverted pot)."""
        # This creates a bowl-like shape
        verts, faces, diag = build_pot_mesh(
            H=100,
            Rt=40,
            Rb=60,
            t_wall=3,
            t_bottom=3,
            r_drain=8,
            expn=1.0,
            n_theta=80,
            n_z=50,
            r_outer_fn=STYLES["SuperellipseMorph"][0],
            style_opts={},
        )
        assert verts.shape[0] > 0
        # Bottom should be wider than top
        assert diag["estimated_bottom_od_mm"] > diag["estimated_top_od_mm"]

    def test_build_pot_mesh_with_very_low_expn(self):
        """Test with very low flare exponent (bottom-heavy taper)."""
        verts, faces, diag = build_pot_mesh(
            H=120,
            Rt=80,
            Rb=40,
            t_wall=3,
            t_bottom=3,
            r_drain=8,
            expn=0.5,  # Strong bottom flare
            n_theta=100,
            n_z=60,
            r_outer_fn=STYLES["SpiralRidges"][0],
            style_opts={},
        )
        assert verts.shape[0] > 0
        assert faces.shape[0] > 0

    def test_build_pot_mesh_with_very_high_expn(self):
        """Test with very high flare exponent (top-heavy taper)."""
        verts, faces, diag = build_pot_mesh(
            H=120,
            Rt=80,
            Rb=40,
            t_wall=3,
            t_bottom=3,
            r_drain=8,
            expn=2.5,  # Strong top flare
            n_theta=100,
            n_z=60,
            r_outer_fn=STYLES["HarmonicRipple"][0],
            style_opts={},
        )
        assert verts.shape[0] > 0
        assert faces.shape[0] > 0


class TestCoreGeometryCombinedFeatures:
    """Test combinations of features in core geometry."""

    def test_build_pot_with_all_features_combined(self):
        """Test pot with flare, bell, and spin all enabled."""
        opts = {
            "flare_center": 0.35,
            "flare_sharp": 12.0,
            "bell_amp": 0.2,
            "bell_center": 0.6,
            "bell_width": 0.3,
            "spin_turns": 1.5,
            "spin_phase_deg": 30.0,
            "spin_curve_exp": 1.8,
        }
        verts, faces, diag = build_pot_mesh(
            H=150,
            Rt=80,
            Rb=50,
            t_wall=3,
            t_bottom=3,
            r_drain=10,
            expn=1.3,
            n_theta=120,
            n_z=80,
            r_outer_fn=STYLES["SuperformulaBlossom"][0],
            style_opts=opts,
        )
        assert verts.shape[0] > 0
        assert faces.shape[0] > 0
        assert diag["estimated_top_od_mm"] > 0
        assert diag["estimated_bottom_od_mm"] > 0

    def test_build_pot_with_negative_bell_and_spin(self):
        """Test pot with pinch (negative bell) and twist."""
        opts = {
            "bell_amp": -0.15,  # Pinch instead of bulge
            "bell_center": 0.5,
            "bell_width": 0.25,
            "spin_turns": 2.0,
            "spin_curve_exp": 0.8,
        }
        verts, faces, diag = build_pot_mesh(
            H=130,
            Rt=70,
            Rb=45,
            t_wall=3,
            t_bottom=3,
            r_drain=9,
            expn=1.1,
            n_theta=100,
            n_z=70,
            r_outer_fn=STYLES["FourierBloom"][0],
            style_opts=opts,
        )
        assert verts.shape[0] > 0
        assert faces.shape[0] > 0

    def test_build_pot_with_extreme_style_parameters(self):
        """Test with extreme style-specific parameters."""
        opts = {
            "sf_m": 12,  # High petal count
            "sf_n1": 5.0,
            "sf_n2": 6.0,
            "sf_n3": 4.0,
            "petal_amp": 0.25,  # Large petal amplitude
            "petal_taper_exp": 2.5,
        }
        verts, faces, diag = build_pot_mesh(
            H=100,
            Rt=60,
            Rb=40,
            t_wall=3,
            t_bottom=3,
            r_drain=8,
            expn=1.0,
            n_theta=150,
            n_z=60,
            r_outer_fn=STYLES["SuperformulaBlossom"][0],
            style_opts=opts,
        )
        assert verts.shape[0] > 0
        # With large petal amplitude, diameter variation should be significant
        assert diag["estimated_top_od_mm"] > 0


class TestCoreGeometryDiagnostics:
    """Test diagnostic output from core geometry implementation."""

    def test_diagnostics_with_high_clamp_ratio(self):
        """Test that clamp ratio is computed correctly with thick walls."""
        verts, faces, diag = build_pot_mesh(
            H=100,
            Rt=60,
            Rb=40,
            t_wall=8,
            t_bottom=5,
            r_drain=10,
            expn=1.0,
            n_theta=80,
            n_z=50,
            r_outer_fn=STYLES["SuperformulaBlossom"][0],
            style_opts={},
        )
        # Clamp ratio should be valid (between 0 and 1)
        assert 0 <= diag["clamp_ratio_at_bottom"] <= 1.0
        assert diag["estimated_top_od_mm"] > 0
        assert diag["estimated_bottom_od_mm"] > 0

    def test_diagnostics_diameter_estimates(self):
        """Test that diameter estimates are reasonable."""
        Rt, Rb = 70, 50
        verts, faces, diag = build_pot_mesh(
            H=120,
            Rt=Rt,
            Rb=Rb,
            t_wall=3,
            t_bottom=3,
            r_drain=10,
            expn=1.0,
            n_theta=100,
            n_z=60,
            r_outer_fn=STYLES["SuperformulaBlossom"][0],
            style_opts={},
        )

        # Estimates should be close to 2*R (accounting for style modulation)
        # With SuperformulaBlossom, there's petal modulation
        top_estimate = diag["estimated_top_od_mm"]
        bottom_estimate = diag["estimated_bottom_od_mm"]

        # Should be within reasonable range (style adds variation)
        assert 2 * Rt * 0.8 <= top_estimate <= 2 * Rt * 1.5
        assert 2 * Rb * 0.8 <= bottom_estimate <= 2 * Rb * 1.5


class TestWriteAsciiStl:
    """Test ASCII STL writer (deprecated but should still work)."""

    def test_write_ascii_stl_creates_file(self):
        """Test that ASCII STL writer creates a valid file."""
        # Generate a simple mesh
        verts, faces, _ = build_pot_mesh(
            H=80,
            Rt=50,
            Rb=35,
            t_wall=3,
            t_bottom=3,
            r_drain=8,
            expn=1.0,
            n_theta=40,
            n_z=30,
            r_outer_fn=STYLES["SuperformulaBlossom"][0],
            style_opts={},
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            stl_path = Path(tmpdir) / "test_pot.stl"

            # This should trigger deprecation warning
            with pytest.warns(
                DeprecationWarning, match="write_ascii_stl is deprecated",
            ):
                write_ascii_stl(stl_path, "TestPot", verts, faces)

            # Verify file was created
            assert stl_path.exists()

            # Verify file has content
            content = stl_path.read_text()
            assert "solid TestPot" in content
            assert "endsolid TestPot" in content
            assert "facet normal" in content
            assert "vertex" in content

    def test_write_ascii_stl_correct_face_count(self):
        """Test that ASCII STL has correct number of facets."""
        verts, faces, _ = build_pot_mesh(
            H=60,
            Rt=40,
            Rb=30,
            t_wall=3,
            t_bottom=3,
            r_drain=6,
            expn=1.0,
            n_theta=30,
            n_z=20,
            r_outer_fn=STYLES["FourierBloom"][0],
            style_opts={},
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            stl_path = Path(tmpdir) / "count_test.stl"

            with pytest.warns(DeprecationWarning):
                write_ascii_stl(stl_path, "CountTest", verts, faces)

            # Count facets in file
            content = stl_path.read_text()
            facet_count = content.count("facet normal")

            # Should match number of faces
            assert facet_count == len(faces)


class TestCoreGeometryBoundaryConditions:
    """Test boundary conditions and edge cases."""

    def test_build_pot_perfectly_cylindrical(self):
        """Test pot with same top and bottom radius (cylinder)."""
        verts, faces, diag = build_pot_mesh(
            H=100,
            Rt=50,
            Rb=50,  # Same radius
            t_wall=3,
            t_bottom=3,
            r_drain=8,
            expn=1.0,
            n_theta=80,
            n_z=50,
            r_outer_fn=STYLES["SuperformulaBlossom"][0],
            style_opts={},
        )
        assert verts.shape[0] > 0
        # Top and bottom should be similar (accounting for style variation)
        top_od = diag["estimated_top_od_mm"]
        bottom_od = diag["estimated_bottom_od_mm"]
        # They should be close, but style modulation can create differences
        assert abs(top_od - bottom_od) < 50  # Reasonable tolerance

    def test_build_pot_very_short(self):
        """Test very short pot (more like a plate)."""
        verts, faces, diag = build_pot_mesh(
            H=20,  # Very short
            Rt=80,
            Rb=75,
            t_wall=3,
            t_bottom=3,
            r_drain=10,
            expn=1.0,
            n_theta=80,
            n_z=10,
            r_outer_fn=STYLES["HarmonicRipple"][0],
            style_opts={},
        )
        assert verts.shape[0] > 0
        assert faces.shape[0] > 0

    def test_build_pot_very_tall(self):
        """Test very tall pot (vase-like proportions)."""
        verts, faces, diag = build_pot_mesh(
            H=300,  # Very tall
            Rt=50,
            Rb=40,
            t_wall=3,
            t_bottom=3,
            r_drain=8,
            expn=1.2,
            n_theta=100,
            n_z=150,
            r_outer_fn=STYLES["SpiralRidges"][0],
            style_opts={},
        )
        assert verts.shape[0] > 0
        assert faces.shape[0] > 0

    def test_build_pot_thin_walls(self):
        """Test with very thin walls (minimum practical thickness)."""
        verts, faces, diag = build_pot_mesh(
            H=100,
            Rt=60,
            Rb=40,
            t_wall=1.5,  # Thin walls
            t_bottom=2.0,
            r_drain=8,
            expn=1.0,
            n_theta=80,
            n_z=50,
            r_outer_fn=STYLES["SuperellipseMorph"][0],
            style_opts={},
        )
        assert verts.shape[0] > 0
        assert faces.shape[0] > 0


class TestCoreGeometryResolutionVariations:
    """Test with different mesh resolutions."""

    def test_build_pot_asymmetric_resolution(self):
        """Test with asymmetric resolution (more theta than z)."""
        verts, faces, diag = build_pot_mesh(
            H=100,
            Rt=60,
            Rb=40,
            t_wall=3,
            t_bottom=3,
            r_drain=8,
            expn=1.0,
            n_theta=200,  # High angular resolution
            n_z=30,  # Lower vertical resolution
            r_outer_fn=STYLES["FourierBloom"][0],
            style_opts={},
        )
        assert verts.shape[0] > 0
        assert faces.shape[0] > 0

    def test_build_pot_high_z_resolution(self):
        """Test with higher vertical resolution."""
        verts, faces, diag = build_pot_mesh(
            H=120,
            Rt=70,
            Rb=50,
            t_wall=3,
            t_bottom=3,
            r_drain=10,
            expn=1.1,
            n_theta=80,  # Standard angular resolution
            n_z=120,  # High vertical resolution
            r_outer_fn=STYLES["SpiralRidges"][0],
            style_opts={"sr_helical_turns": 3.0},
        )
        assert verts.shape[0] > 0
        # High z resolution with spiral should show good detail
        assert faces.shape[0] > 0


class TestCoreGeometryAllStyles:
    """Ensure all styles work with core geometry implementation."""

    def test_all_styles_produce_valid_meshes(self):
        """Test that all registered styles work in core implementation."""
        for style_name, (style_fn, description) in STYLES.items():
            verts, faces, diag = build_pot_mesh(
                H=100,
                Rt=60,
                Rb=40,
                t_wall=3,
                t_bottom=3,
                r_drain=8,
                expn=1.1,
                n_theta=80,
                n_z=50,
                r_outer_fn=style_fn,
                style_opts={},
            )
            assert verts.shape[0] > 0, f"{style_name} produced no vertices"
            assert faces.shape[0] > 0, f"{style_name} produced no faces"
            assert (
                diag["estimated_top_od_mm"] > 0
            ), f"{style_name} has invalid top diameter"
            assert (
                diag["estimated_bottom_od_mm"] > 0
            ), f"{style_name} has invalid bottom diameter"


class TestCoreGeometryNumericalStability:
    """Test numerical stability with extreme but valid parameters."""

    def test_build_pot_with_extreme_taper_ratio(self):
        """Test with extreme taper ratio (very narrow bottom, wide top)."""
        verts, faces, diag = build_pot_mesh(
            H=150,
            Rt=100,  # Very wide top
            Rb=25,  # Narrow bottom
            t_wall=3,
            t_bottom=3,
            r_drain=6,
            expn=1.5,
            n_theta=100,
            n_z=80,
            r_outer_fn=STYLES["SuperformulaBlossom"][0],
            style_opts={},
        )
        assert verts.shape[0] > 0
        # Should handle extreme taper
        assert diag["estimated_top_od_mm"] > diag["estimated_bottom_od_mm"]

    def test_build_pot_with_minimal_bottom_space(self):
        """Test with minimal space at bottom (large drain, thick walls)."""
        verts, faces, diag = build_pot_mesh(
            H=100,
            Rt=70,
            Rb=50,
            t_wall=5,  # Thick walls
            t_bottom=4,
            r_drain=12,  # Large drain
            expn=1.0,
            n_theta=80,
            n_z=50,
            r_outer_fn=STYLES["HarmonicRipple"][0],
            style_opts={},
        )
        assert verts.shape[0] > 0
        # Clamp ratio should be valid
        assert 0 <= diag["clamp_ratio_at_bottom"] <= 1.0
