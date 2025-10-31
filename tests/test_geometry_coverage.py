"""
Comprehensive tests for potfoundry/geometry.py to improve coverage.

This test file focuses on:
1. Testing uncovered style functions with various parameters
2. Edge cases in base_radius and helper functions
3. Error handling paths
4. Diagnostic outputs
"""

import numpy as np

from potfoundry.geometry import (
    STYLES,
    _spin_twist_radians,
    _theta_grid_cached,
    base_radius,
    build_pot_mesh,
    r_base_out,
    r_outer_fourier_bloom,
    r_outer_harmonic_ripple,
    r_outer_spiral_ridges,
    r_outer_superellipse_morph,
    r_outer_superformula_blossom,
    superformula_r,
)


class TestBaseRadius:
    """Test base_radius function with edge cases."""

    def test_base_radius_zero_height(self):
        """Test with H=0 should return Rb."""
        result = base_radius(z=0, H=0, Rb=50, Rt=70, expn=1.0, opts={})
        assert result == 50

    def test_base_radius_with_flare_center(self):
        """Test flare center warping."""
        opts = {"flare_center": 0.3, "flare_sharp": 8.0}
        result = base_radius(z=50, H=100, Rb=40, Rt=60, expn=1.1, opts=opts)
        assert 40 <= result <= 60

    def test_base_radius_with_bell(self):
        """Test bell-shaped mid-height bulge."""
        opts = {"bell_amp": 0.1, "bell_center": 0.5, "bell_width": 0.3}
        # At middle height, should have bell effect
        r_mid = base_radius(z=50, H=100, Rb=40, Rt=60, expn=1.0, opts=opts)
        # Without bell
        r_mid_no_bell = base_radius(z=50, H=100, Rb=40, Rt=60, expn=1.0, opts={})
        # With bell should be larger
        assert r_mid > r_mid_no_bell

    def test_base_radius_with_negative_bell(self):
        """Test negative bell amplitude (pinch effect)."""
        opts = {"bell_amp": -0.1, "bell_center": 0.5, "bell_width": 0.3}
        r_mid = base_radius(z=50, H=100, Rb=40, Rt=60, expn=1.0, opts=opts)
        r_mid_no_bell = base_radius(z=50, H=100, Rb=40, Rt=60, expn=1.0, opts={})
        # Negative bell should make it smaller
        assert r_mid < r_mid_no_bell

    def test_base_radius_extreme_flare_sharp(self):
        """Test with very sharp flare transition."""
        opts = {"flare_sharp": 20.0}
        result = base_radius(z=50, H=100, Rb=40, Rt=60, expn=1.0, opts=opts)
        assert 40 <= result <= 60

    def test_base_radius_minimum_bell_width(self):
        """Test bell with minimum width clamping."""
        opts = {
            "bell_amp": 0.1,
            "bell_width": 0.01,  # Very small, should be clamped to 0.05
        }
        result = base_radius(z=50, H=100, Rb=40, Rt=60, expn=1.0, opts=opts)
        assert result > 0


class TestSpinTwist:
    """Test _spin_twist_radians function."""

    def test_spin_twist_no_spin(self):
        """Test with no spin parameters."""
        result = _spin_twist_radians(z=50, H=100, opts={})
        assert result == 0.0

    def test_spin_twist_linear(self):
        """Test linear spin."""
        opts = {"spin_turns": 2.0, "spin_curve_exp": 1.0}
        result = _spin_twist_radians(z=100, H=100, opts=opts)
        # At top, should complete 2 full turns
        assert abs(result - 2.0 * 2 * np.pi) < 0.01

    def test_spin_twist_with_phase(self):
        """Test spin with phase offset."""
        opts = {"spin_turns": 1.0, "spin_phase_deg": 45.0}
        result = _spin_twist_radians(z=0, H=100, opts=opts)
        # At bottom with phase, should not be zero
        assert result != 0.0
        # Should be approximately 45 degrees in radians
        assert abs(result - np.pi / 4) < 0.01

    def test_spin_twist_curved(self):
        """Test curved spin (non-linear)."""
        opts = {"spin_turns": 1.0, "spin_curve_exp": 2.0}
        result_mid = _spin_twist_radians(z=50, H=100, opts=opts)
        # With exp=2, mid-point twist should be less than linear
        linear_mid = np.pi  # For 1 turn, midpoint would be π
        assert result_mid < linear_mid


class TestSuperformulaR:
    """Test superformula_r function."""

    def test_superformula_basic(self):
        """Test basic superformula computation."""
        result = superformula_r(theta=0, m=5, n1=2, n2=3, n3=3, a=1, b=1)
        assert result > 0

    def test_superformula_various_angles(self):
        """Test superformula at different angles."""
        for theta in [0, np.pi / 4, np.pi / 2, np.pi, 3 * np.pi / 2]:
            result = superformula_r(theta, m=6, n1=2, n2=4, n3=4, a=1, b=1)
            assert result > 0


class TestStyleFunctions:
    """Test all style functions with various parameter combinations."""

    def test_superformula_blossom_default(self):
        """Test SuperformulaBlossom with default opts."""
        result = r_outer_superformula_blossom(theta=0, z=50, r0=50, H=100, opts={})
        assert result > 0

    def test_superformula_blossom_custom_params(self):
        """Test SuperformulaBlossom with custom parameters."""
        opts = {
            "sf_m": 7,
            "sf_n1": 3.0,
            "sf_n2": 4.0,
            "sf_n3": 2.5,
            "sf_a": 1.2,
            "sf_b": 0.9,
            "petal_amp": 0.15,
            "petal_taper_exp": 1.5,
        }
        result = r_outer_superformula_blossom(
            theta=np.pi / 4, z=75, r0=50, H=100, opts=opts
        )
        assert result > 0

    def test_fourier_bloom_default(self):
        """Test FourierBloom with default opts."""
        result = r_outer_fourier_bloom(theta=0, z=50, r0=50, H=100, opts={})
        assert result > 0

    def test_fourier_bloom_custom_harmonics(self):
        """Test FourierBloom with custom harmonic parameters."""
        opts = {
            "fb_amp1": 0.08,
            "fb_freq1": 6,
            "fb_phase1": 0.3,
            "fb_amp2": 0.05,
            "fb_freq2": 12,
            "fb_phase2": 0.1,
            "fb_amp3": 0.03,
            "fb_freq3": 18,
            "fb_phase3": 0.5,
            "fb_taper_exp": 2.0,
        }
        result = r_outer_fourier_bloom(theta=np.pi / 3, z=80, r0=60, H=120, opts=opts)
        assert result > 0

    def test_spiral_ridges_default(self):
        """Test SpiralRidges with default opts."""
        result = r_outer_spiral_ridges(theta=0, z=50, r0=50, H=100, opts={})
        assert result > 0

    def test_spiral_ridges_custom_params(self):
        """Test SpiralRidges with custom parameters."""
        opts = {
            "sr_freq": 15,
            "sr_amp": 0.12,
            "sr_helical_turns": 3.0,
            "sr_phase": 0.25,
            "sr_taper_exp": 1.8,
        }
        result = r_outer_spiral_ridges(theta=np.pi / 2, z=70, r0=55, H=100, opts=opts)
        assert result > 0

    def test_superellipse_morph_default(self):
        """Test SuperellipseMorph with default opts."""
        result = r_outer_superellipse_morph(theta=0, z=50, r0=50, H=100, opts={})
        assert result > 0

    def test_superellipse_morph_custom_params(self):
        """Test SuperellipseMorph with custom exponents."""
        opts = {"se_n_bot": 1.5, "se_n_top": 4.0, "se_amp": 0.1}
        result = r_outer_superellipse_morph(
            theta=np.pi / 6, z=90, r0=45, H=100, opts=opts
        )
        assert result > 0

    def test_harmonic_ripple_default(self):
        """Test HarmonicRipple with default opts."""
        result = r_outer_harmonic_ripple(theta=0, z=50, r0=50, H=100, opts={})
        assert result > 0

    def test_harmonic_ripple_custom_params(self):
        """Test HarmonicRipple with custom parameters."""
        opts = {
            "hr_wave_count": 8,
            "hr_amp_h": 0.1,
            "hr_freq_v": 4.0,
            "hr_amp_v": 0.08,
            "hr_phase": 0.4,
        }
        result = r_outer_harmonic_ripple(theta=np.pi / 4, z=60, r0=50, H=100, opts=opts)
        assert result > 0


class TestThetaGridCaching:
    """Test _theta_grid_cached function."""

    def test_theta_grid_cache(self):
        """Test that theta grid is cached properly."""
        # First call
        result1 = _theta_grid_cached(100)
        # Second call should return cached result
        result2 = _theta_grid_cached(100)
        # Should be identical (same object)
        assert result1[0] is result2[0]
        assert result1[1] is result2[1]
        assert result1[2] is result2[2]

    def test_theta_grid_different_sizes(self):
        """Test theta grid with different sizes."""
        result_small = _theta_grid_cached(50)
        result_large = _theta_grid_cached(200)
        assert len(result_small[0]) == 50
        assert len(result_large[0]) == 200


class TestBuildPotMeshEdgeCases:
    """Test build_pot_mesh with edge cases and various style options."""

    def test_build_pot_with_all_styles(self):
        """Test that all registered styles work."""
        for style_name, (style_fn, _) in STYLES.items():
            verts, faces, diag = build_pot_mesh(
                H=100,
                Rt=60,
                Rb=40,
                t_wall=3,
                t_bottom=3,
                r_drain=8,
                expn=1.1,
                n_theta=60,
                n_z=40,
                r_outer_fn=style_fn,
                style_opts={},
            )
            assert verts.shape[0] > 0, f"{style_name} produced no vertices"
            assert faces.shape[0] > 0, f"{style_name} produced no faces"
            assert "estimated_top_od_mm" in diag
            assert "estimated_bottom_od_mm" in diag

    def test_build_pot_with_spin(self):
        """Test mesh with spin/twist enabled."""
        opts = {"spin_turns": 2.0, "spin_curve_exp": 1.5}
        verts, faces, diag = build_pot_mesh(
            H=120,
            Rt=70,
            Rb=50,
            t_wall=3,
            t_bottom=3,
            r_drain=10,
            expn=1.1,
            n_theta=100,
            n_z=50,
            r_outer_fn=STYLES["SuperformulaBlossom"][0],
            style_opts=opts,
        )
        assert verts.shape[0] > 0
        assert faces.shape[0] > 0

    def test_build_pot_with_flare_and_bell(self):
        """Test mesh with flare center and bell options."""
        opts = {
            "flare_center": 0.3,
            "flare_sharp": 10.0,
            "bell_amp": 0.15,
            "bell_center": 0.6,
            "bell_width": 0.25,
        }
        verts, faces, diag = build_pot_mesh(
            H=100,
            Rt=60,
            Rb=40,
            t_wall=3,
            t_bottom=3,
            r_drain=8,
            expn=1.2,
            n_theta=80,
            n_z=60,
            r_outer_fn=STYLES["FourierBloom"][0],
            style_opts=opts,
        )
        assert verts.shape[0] > 0
        assert "clamp_ratio_at_bottom" in diag

    def test_build_pot_minimal_resolution(self):
        """Test with minimal mesh resolution."""
        verts, faces, diag = build_pot_mesh(
            H=100,
            Rt=60,
            Rb=40,
            t_wall=3,
            t_bottom=3,
            r_drain=8,
            expn=1.0,
            n_theta=32,
            n_z=16,
            r_outer_fn=STYLES["SuperformulaBlossom"][0],
            style_opts={},
        )
        assert verts.shape[0] > 0
        assert faces.shape[0] > 0

    def test_build_pot_high_resolution(self):
        """Test with high mesh resolution."""
        verts, faces, diag = build_pot_mesh(
            H=150,
            Rt=80,
            Rb=60,
            t_wall=3,
            t_bottom=3,
            r_drain=12,
            expn=1.1,
            n_theta=200,
            n_z=100,
            r_outer_fn=STYLES["HarmonicRipple"][0],
            style_opts={},
        )
        assert verts.shape[0] > 0
        assert faces.shape[0] > 0

    def test_build_pot_extreme_taper(self):
        """Test with extreme taper (large difference in top/bottom radius)."""
        verts, faces, diag = build_pot_mesh(
            H=120,
            Rt=90,
            Rb=30,
            t_wall=3,
            t_bottom=3,
            r_drain=8,
            expn=0.7,
            n_theta=100,
            n_z=60,
            r_outer_fn=STYLES["SpiralRidges"][0],
            style_opts={},
        )
        assert verts.shape[0] > 0
        # Check that estimated diameters make sense
        assert diag["estimated_top_od_mm"] > diag["estimated_bottom_od_mm"]


class TestRBaseOut:
    """Test r_base_out helper function."""

    def test_r_base_out_basic(self):
        """Test r_base_out basic functionality."""
        result = r_base_out(z=50, H=100, Rb=40, Rt=60, expn=1.0)
        assert 40 <= result <= 60

    def test_r_base_out_at_bottom(self):
        """Test at bottom should return Rb."""
        result = r_base_out(z=0, H=100, Rb=40, Rt=60, expn=1.0)
        assert abs(result - 40) < 0.1

    def test_r_base_out_at_top(self):
        """Test at top should return Rt."""
        result = r_base_out(z=100, H=100, Rb=40, Rt=60, expn=1.0)
        assert abs(result - 60) < 0.1


class TestDiagnostics:
    """Test diagnostic output from build_pot_mesh."""

    def test_diagnostics_keys_present(self):
        """Test that all expected diagnostic keys are present."""
        verts, faces, diag = build_pot_mesh(
            H=100,
            Rt=60,
            Rb=40,
            t_wall=3,
            t_bottom=3,
            r_drain=8,
            expn=1.0,
            n_theta=80,
            n_z=50,
            r_outer_fn=STYLES["SuperformulaBlossom"][0],
            style_opts={},
        )

        required_keys = [
            "estimated_top_od_mm",
            "estimated_bottom_od_mm",
            "clamp_ratio_at_bottom",
        ]
        for key in required_keys:
            assert key in diag, f"Missing diagnostic key: {key}"

    def test_diagnostics_values_reasonable(self):
        """Test that diagnostic values are reasonable."""
        verts, faces, diag = build_pot_mesh(
            H=120,
            Rt=70,
            Rb=50,
            t_wall=3,
            t_bottom=3,
            r_drain=10,
            expn=1.1,
            n_theta=100,
            n_z=60,
            r_outer_fn=STYLES["FourierBloom"][0],
            style_opts={},
        )

        # Top and bottom diameters should be positive
        assert diag["estimated_top_od_mm"] > 0
        assert diag["estimated_bottom_od_mm"] > 0

        # Top should generally be larger than bottom (for this flared pot)
        # Note: Style modulation can affect this, so we just check they're reasonable
        assert 50 <= diag["estimated_bottom_od_mm"] <= 250
        assert 50 <= diag["estimated_top_od_mm"] <= 250

        # Clamp ratio should be between 0 and 1
        assert 0 <= diag["clamp_ratio_at_bottom"] <= 1.0
