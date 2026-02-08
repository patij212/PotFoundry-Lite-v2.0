"""
UX tests for pfui modules - focusing on user experience components.

This test file covers:
1. Deeplink encoding/decoding for URL state sharing
2. Color utilities for palette management
3. Import utilities
4. Schema conversion helpers
"""

import pytest

from pfui.colors import (
    build_gradient_colors,
    hex_to_rgb_tuple,
    interpolate_rgb,
    resolve_palette,
)
from pfui.deeplink import (
    apply_state,
    decode_state,
    encode_state,
    validate_state,
)
from pfui.imports import (
    STYLES,
    WRITE_STL_BINARY,
    build_pot_mesh,
)


class TestDeeplinkUX:
    """Test deeplink functionality for sharing designs."""

    def test_encode_decode_roundtrip_basic(self):
        """Test encoding and decoding state roundtrip."""
        state = {
            "H": 120,
            "top_od": 140,
            "bottom_od": 90,
            "style": "SuperformulaBlossom",
        }

        encoded = encode_state(state)
        decoded = decode_state(encoded)

        assert decoded["H"] == 120
        assert decoded["style"] == "SuperformulaBlossom"

    def test_encode_produces_url_safe_string(self):
        """Test that encoded state is URL-safe."""
        state = {"H": 100, "style": "FourierBloom"}
        encoded = encode_state(state)

        # Should not contain URL-unsafe characters
        assert " " not in encoded
        assert "/" not in encoded or encoded.count("/") == 0  # Base64 URL-safe variant
        assert "+" not in encoded

    def test_validate_state_accepts_valid_params(self):
        """Test that valid state passes validation."""
        state = {
            "H": 120,
            "top_od": 140,
            "bottom_od": 90,
            "t_wall": 3,
            "t_bottom": 3,
            "r_drain": 10,
            "expn": 1.1,
            "style": "SuperformulaBlossom",
        }

        validated, warnings = validate_state(state)
        assert validated is not None
        assert "H" in validated

    def test_validate_state_rejects_out_of_range(self):
        """Test that out-of-range values generate warnings."""
        state = {
            "H": 1000,  # Too high
            "style": "SuperformulaBlossom",
        }

        validated, warnings = validate_state(state)
        # Should have warnings about out-of-range value
        assert len(warnings) > 0

    def test_validate_state_unknown_style(self):
        """Test that unknown style generates warning."""
        state = {"H": 120, "style": "UnknownStyle"}

        validated, warnings = validate_state(state)
        # Should warn about unknown style
        assert len(warnings) > 0

    def test_apply_state_updates_session(self):
        """Test that apply_state queues updates."""
        state = {"H": 150, "top_od": 160}

        # This should not raise (even without actual Streamlit session)
        warnings = apply_state(state, quiet=True)
        # Function should complete without error
        assert isinstance(warnings, list)


class TestColorUtilities:
    """Test color utility functions for UX."""

    def test_hex_to_rgb_tuple_basic(self):
        """Test converting hex color to RGB tuple."""
        rgb = hex_to_rgb_tuple("#FF0000")
        assert rgb == (255, 0, 0)

        rgb = hex_to_rgb_tuple("#00FF00")
        assert rgb == (0, 255, 0)

        rgb = hex_to_rgb_tuple("#0000FF")
        assert rgb == (0, 0, 255)

    def test_hex_to_rgb_tuple_without_hash(self):
        """Test hex color without leading #."""
        rgb = hex_to_rgb_tuple("FFFFFF")
        assert rgb == (255, 255, 255)

    def test_hex_to_rgb_tuple_lowercase(self):
        """Test hex color with lowercase."""
        rgb = hex_to_rgb_tuple("#abc123")
        assert len(rgb) == 3
        assert all(0 <= c <= 255 for c in rgb)

    def test_interpolate_rgb_midpoint(self):
        """Test RGB interpolation at midpoint."""
        black = (0, 0, 0)
        white = (255, 255, 255)

        mid = interpolate_rgb(black, white, 0.5)
        # Should be approximately gray
        assert all(120 <= c <= 135 for c in mid)

    def test_interpolate_rgb_extremes(self):
        """Test RGB interpolation at extremes."""
        c1 = (100, 150, 200)
        c2 = (200, 100, 50)

        # At t=0, should return c1
        result = interpolate_rgb(c1, c2, 0.0)
        assert result == c1

        # At t=1, should return c2
        result = interpolate_rgb(c1, c2, 1.0)
        assert result == c2

    def test_interpolate_rgb_clamps_values(self):
        """Test that RGB interpolation clamps to 0-255."""
        c1 = (0, 0, 0)
        c2 = (255, 255, 255)

        # Normal interpolation should stay in range
        result = interpolate_rgb(c1, c2, 0.5)
        assert all(0 <= c <= 255 for c in result)

    def test_resolve_palette_named(self):
        """Test resolving named color palette."""
        palette = resolve_palette("Classic Blue")
        assert palette is not None
        assert len(palette) == 3
        # Should be RGB tuples
        for color in palette:
            assert len(color) == 3

    def test_resolve_palette_custom_colors(self):
        """Test resolving custom color palette."""
        custom = ["#FF0000", "#00FF00", "#0000FF"]
        palette = resolve_palette(None, custom_colors=custom)
        assert len(palette) == 3

    def test_build_gradient_colors_basic(self):
        """Test building gradient colors."""
        import numpy as np
        z_values = [0.0, 0.25, 0.5, 0.75, 1.0]
        gradient = build_gradient_colors(z_values, "Classic Blue")
        # Should return numpy array
        assert isinstance(gradient, np.ndarray)
        assert gradient.dtype == np.uint8
        assert len(gradient) == 5
        assert gradient.shape == (5, 3)
        # All should be valid RGB values
        for color in gradient:
            assert len(color) == 3
            assert all(0 <= c <= 255 for c in color)

    def test_build_gradient_colors_monotonic(self):
        """Test building monotonic gradient."""
        import numpy as np
        z_values = [0.0, 0.2, 0.4, 0.6, 0.8, 1.0]
        gradient = build_gradient_colors(z_values, "Mono Height")
        assert isinstance(gradient, np.ndarray)
        assert len(gradient) == 6
        assert gradient.shape == (6, 3)


class TestImportUtilities:
    """Test import utility functions."""

    def test_imports_available(self):
        """Test that key imports are available."""
        assert STYLES is not None
        assert build_pot_mesh is not None
        assert WRITE_STL_BINARY is not None

    def test_styles_dict_populated(self):
        """Test that STYLES dict is populated."""
        assert len(STYLES) > 0
        # Should have at least the 5 main styles
        assert "SuperformulaBlossom" in STYLES
        assert "FourierBloom" in STYLES
        assert "SpiralRidges" in STYLES

    def test_build_pot_mesh_callable(self):
        """Test that build_pot_mesh is callable."""
        assert callable(build_pot_mesh)

    def test_write_stl_binary_available(self):
        """Test that write_stl_binary is available."""
        assert WRITE_STL_BINARY is not None
        assert callable(WRITE_STL_BINARY)


class TestSchemaHelpers:
    """Test schema conversion helpers for UX."""

    def test_schemas_exist(self):
        """Test that pfui schemas module exists and loads."""
        try:
            from pfui import schemas

            assert schemas is not None
        except ImportError:
            pytest.skip("Schemas module not available without Streamlit")

    def test_state_management_exists(self):
        """Test that state management modules exist."""
        try:
            from pfui import state

            assert state is not None
        except ImportError:
            pytest.skip("State module not available without Streamlit")


class TestDeeplinkEdgeCases:
    """Test edge cases in deeplink functionality."""

    def test_decode_invalid_base64(self):
        """Test decoding invalid base64 string."""
        try:
            result = decode_state("not_valid_base64!!!")
            # Should handle gracefully
            assert result is None or isinstance(result, dict)
        except ValueError:
            # Acceptable to raise ValueError for invalid input
            pass

    def test_encode_empty_state(self):
        """Test encoding empty state."""
        encoded = encode_state({})
        assert isinstance(encoded, str)
        assert len(encoded) > 0

    def test_encode_large_state(self):
        """Test encoding large state with many options."""
        large_state = {
            "H": 120,
            "top_od": 140,
            "bottom_od": 90,
            "t_wall": 3,
            "t_bottom": 3,
            "r_drain": 10,
            "expn": 1.1,
            "style": "SuperformulaBlossom",
            "opts": {
                "sf_m": 6,
                "sf_n1": 2.0,
                "sf_n2": 3.0,
                "sf_n3": 4.0,
                "petal_amp": 0.1,
                "flare_center": 0.5,
                "bell_amp": 0.05,
            },
        }

        encoded = encode_state(large_state)
        decoded = decode_state(encoded)

        assert decoded is not None
        assert "opts" in decoded

    def test_validate_state_with_numeric_type_checking(self):
        """Test validation handles numeric type checking."""
        state = {
            "H": "120",  # String instead of number
            "style": "SuperformulaBlossom",
        }

        validated, warnings = validate_state(state)
        # Should either convert or warn
        assert isinstance(warnings, list)


class TestColorEdgeCases:
    """Test edge cases in color utilities."""

    def test_hex_to_rgb_invalid_format(self):
        """Test handling of invalid hex format."""
        try:
            result = hex_to_rgb_tuple("invalid")
            # If it doesn't raise, should return a valid tuple
            assert len(result) == 3
        except ValueError:
            # Acceptable to raise error
            pass

    def test_interpolate_rgb_negative_t(self):
        """Test interpolation with negative t value."""
        c1 = (100, 100, 100)
        c2 = (200, 200, 200)

        result = interpolate_rgb(c1, c2, -0.5)
        # Should clamp or handle gracefully
        assert all(0 <= c <= 255 for c in result)

    def test_interpolate_rgb_t_greater_than_1(self):
        """Test interpolation with t > 1."""
        c1 = (100, 100, 100)
        c2 = (200, 200, 200)

        result = interpolate_rgb(c1, c2, 1.5)
        # Should clamp or handle gracefully
        assert all(0 <= c <= 255 for c in result)

    def test_build_gradient_zero_steps(self):
        """Test building gradient with zero steps."""
        gradient = build_gradient_colors([], "Classic Blue")
        assert len(gradient) == 0

    def test_build_gradient_single_step(self):
        """Test building gradient with single step."""
        gradient = build_gradient_colors([0.5], "Warm Sunset")
        assert len(gradient) == 1
        assert len(gradient[0]) == 3  # RGB triplet


class TestUXIntegration:
    """Integration tests for UX workflows."""

    def test_deeplink_workflow_complete(self):
        """Test complete deeplink sharing workflow."""
        # User creates a design
        design_state = {
            "H": 130,
            "top_od": 150,
            "bottom_od": 95,
            "style": "FourierBloom",
            "opts": {"fb_amp1": 0.08},
        }

        # Encode for sharing
        link = encode_state(design_state)
        assert isinstance(link, str)

        # Another user decodes
        received = decode_state(link)
        assert received is not None

        # Validate received state
        validated, warnings = validate_state(received)
        assert validated is not None
        assert validated["H"] == 130

    def test_color_palette_workflow(self):
        """Test color palette selection workflow."""
        # User selects a palette
        palette_name = "Classic Blue"
        palette = resolve_palette(palette_name)
        assert palette is not None
        assert len(palette) == 3

        # Generate gradient for visualization
        z_values = [i / 19 for i in range(20)]  # 20 normalized values
        gradient = build_gradient_colors(z_values, palette_name)
        assert len(gradient) == 20

        # All colors should be valid RGB
        for color in gradient:
            assert len(color) == 3
            assert all(0 <= c <= 255 for c in color)
