"""Tests for potfoundry.validators package."""

from __future__ import annotations

import pytest

from potfoundry.validators import (
    coerce_positive_float,
    coerce_positive_int,
    validate_bottom_radius,
    validate_bottom_thickness,
    validate_dimensions_compatibility,
    validate_drain_radius,
    validate_exponent,
    validate_height,
    validate_mesh_resolution,
    validate_top_radius,
    validate_wall_thickness,
)


class TestDimensionValidators:
    """Test dimension validation functions."""

    def test_validate_height_valid(self):
        """Test valid height values."""
        assert validate_height(100.0) == 100.0
        assert validate_height(10.0) == 10.0
        assert validate_height(500.0) == 500.0

    def test_validate_height_invalid(self):
        """Test invalid height values."""
        with pytest.raises(ValueError, match="must be positive"):
            validate_height(0)
        with pytest.raises(ValueError, match="must be positive"):
            validate_height(-10)
        with pytest.raises(ValueError, match="too small"):
            validate_height(5.0)
        with pytest.raises(ValueError, match="too large"):
            validate_height(1000.0)

    def test_validate_radius_valid(self):
        """Test valid radius values."""
        assert validate_top_radius(50.0) == 50.0
        assert validate_bottom_radius(40.0) == 40.0

    def test_validate_radius_invalid(self):
        """Test invalid radius values."""
        with pytest.raises(ValueError, match="must be positive"):
            validate_top_radius(0)
        with pytest.raises(ValueError, match="too small"):
            validate_bottom_radius(5.0)

    def test_validate_thickness_valid(self):
        """Test valid thickness values."""
        assert validate_wall_thickness(2.0) == 2.0
        assert validate_bottom_thickness(1.5) == 1.5

    def test_validate_thickness_invalid(self):
        """Test invalid thickness values."""
        with pytest.raises(ValueError, match="too thin"):
            validate_wall_thickness(0.5)
        with pytest.raises(ValueError, match="too thick"):
            validate_wall_thickness(15.0)

    def test_validate_drain_radius_valid(self):
        """Test valid drain radius."""
        # Drain of 5mm in pot with Rb=50mm and t_wall=2mm should be fine
        assert validate_drain_radius(5.0, Rb=50.0, t_wall=2.0) == 5.0

    def test_validate_drain_radius_too_large(self):
        """Test drain radius too large for pot."""
        # Drain of 50mm in pot with Rb=50mm and t_wall=2mm should fail
        with pytest.raises(ValueError, match="too large for bottom radius"):
            validate_drain_radius(50.0, Rb=50.0, t_wall=2.0)

    def test_validate_dimensions_compatibility_valid(self):
        """Test compatible dimensions."""
        # Should not raise
        validate_dimensions_compatibility(
            H=100.0,
            Rt=50.0,
            Rb=40.0,
            t_wall=2.0,
            t_bottom=1.5,
            r_drain=5.0,
        )

    def test_validate_dimensions_compatibility_wall_too_thick(self):
        """Test wall thickness exceeds radius."""
        with pytest.raises(ValueError, match="must be less than top radius"):
            validate_dimensions_compatibility(
                H=100.0,
                Rt=50.0,
                Rb=40.0,
                t_wall=60.0,  # Too thick!
                t_bottom=1.5,
            )

    def test_validate_dimensions_compatibility_extreme_aspect(self):
        """Test extreme aspect ratio."""
        with pytest.raises(ValueError, match="too extreme"):
            validate_dimensions_compatibility(
                H=1000.0,  # Very tall
                Rt=50.0,
                Rb=40.0,
                t_wall=2.0,
                t_bottom=1.5,
            )


class TestGeometryValidators:
    """Test geometry validation functions."""

    def test_validate_mesh_resolution_valid(self):
        """Test valid mesh resolution."""
        assert validate_mesh_resolution(64, 64) == (64, 64)
        assert validate_mesh_resolution(32, 32) == (32, 32)

    def test_validate_mesh_resolution_too_low(self):
        """Test resolution too low."""
        with pytest.raises(ValueError, match="too low"):
            validate_mesh_resolution(8, 32)

    def test_validate_mesh_resolution_too_high(self):
        """Test resolution too high."""
        with pytest.raises(ValueError, match="too high"):
            validate_mesh_resolution(1000, 1000)

    def test_validate_exponent_valid(self):
        """Test valid exponent values."""
        assert validate_exponent(1.0) == 1.0
        assert validate_exponent(2.0) == 2.0

    def test_validate_exponent_invalid(self):
        """Test invalid exponent values."""
        with pytest.raises(ValueError, match="must be positive"):
            validate_exponent(0)
        with pytest.raises(ValueError, match="too small"):
            validate_exponent(0.1)
        with pytest.raises(ValueError, match="too large"):
            validate_exponent(10.0)


class TestUtilityFunctions:
    """Test utility validation functions."""

    def test_coerce_positive_float_valid(self):
        """Test valid float coercion."""
        assert coerce_positive_float(10) == 10.0
        assert coerce_positive_float("5.5") == 5.5
        assert coerce_positive_float(3.14) == 3.14

    def test_coerce_positive_float_invalid(self):
        """Test invalid float coercion."""
        with pytest.raises(ValueError):
            coerce_positive_float("not a number")
        with pytest.raises(ValueError, match="must be >="):
            coerce_positive_float(-5.0)

    def test_coerce_positive_int_valid(self):
        """Test valid int coercion."""
        assert coerce_positive_int(10) == 10
        assert coerce_positive_int("5") == 5
        assert coerce_positive_int(3.9) == 3  # Truncates

    def test_coerce_positive_int_invalid(self):
        """Test invalid int coercion."""
        with pytest.raises(ValueError):
            coerce_positive_int("not a number")
        with pytest.raises(ValueError, match="must be >="):
            coerce_positive_int(-5)
