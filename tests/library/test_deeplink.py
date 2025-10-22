"""Tests for deep link encoding/decoding."""

import pytest
import base64
import json

from pfui.deeplink import (
    encode_state,
    decode_state,
    validate_state,
    generate_deep_link,
)


def test_encode_decode_roundtrip():
    """Test that encode -> decode is symmetric."""
    state = {
        "style": "HarmonicRipple",
        "H": 120.0,
        "top_od": 105.5,
        "bottom_od": 95.5,
        "opts": {"freq": 8.0, "amp": 2.5},
    }

    encoded = encode_state(state)
    decoded = decode_state(encoded)

    assert decoded == state


def test_encode_produces_url_safe_string():
    """Test that encoded string is URL-safe (no +, /, =)."""
    state = {"style": "Test", "H": 123.456}
    encoded = encode_state(state)

    # URL-safe base64 uses - and _ instead of + and /
    # Padding (=) is stripped
    assert "+" not in encoded
    assert "/" not in encoded
    # Note: padding may be stripped, so = may or may not be present


def test_decode_invalid_base64_raises():
    """Test that invalid base64 raises ValueError."""
    with pytest.raises(ValueError, match="Invalid state parameter"):
        decode_state("not-valid-base64!!!")


def test_decode_non_dict_raises():
    """Test that decoding non-dict JSON raises ValueError."""
    # Encode a list instead of dict
    json_str = json.dumps([1, 2, 3])
    b64 = base64.urlsafe_b64encode(json_str.encode()).decode().rstrip("=")

    with pytest.raises(ValueError, match="not a dictionary"):
        decode_state(b64)


def test_validate_state_accepts_valid_params():
    """Test that validate_state accepts valid parameters."""
    state = {
        "style": "HarmonicRipple",
        "H": 120.0,
        "top_od": 105.5,
        "opts": {"freq": 8.0},
    }

    validated, warnings = validate_state(state)

    assert "style" in validated
    assert "H" in validated
    assert "top_od" in validated
    assert "opts" in validated
    assert len(warnings) == 0


def test_validate_state_rejects_unknown_keys():
    """Test that unknown keys are filtered out."""
    state = {
        "style": "HarmonicRipple",
        "H": 120.0,
        "evil_key": "malicious_value",
    }

    validated, warnings = validate_state(state)

    assert "evil_key" not in validated
    assert any("unknown parameter" in w.lower() for w in warnings)


def test_validate_state_rejects_out_of_range_values():
    """Test that out-of-range values are rejected."""
    state = {
        "H": 999.0,  # Too high (max 500)
        "top_od": 1000.0,  # Too high (max 400)
    }

    validated, warnings = validate_state(state)

    # Both should be rejected
    assert "H" not in validated
    assert "top_od" not in validated
    assert len(warnings) >= 2


def test_validate_state_unknown_style():
    """Test that unknown style is rejected."""
    state = {"style": "UnknownStyleName"}

    validated, warnings = validate_state(state)

    assert "style" not in validated
    assert any("unknown style" in w.lower() for w in warnings)


def test_generate_deep_link_format():
    """Test that generated link has correct format."""
    state = {"style": "HarmonicRipple", "H": 120.0}
    base_url = "https://example.com"

    link = generate_deep_link(state, base_url)

    assert link.startswith("https://example.com/?state=")

    # Extract and decode state
    encoded = link.split("state=")[1]
    decoded = decode_state(encoded)
    assert decoded == state


def test_encode_large_state():
    """Test encoding large state dict."""
    # Create a state with many parameters
    state = {
        "style": "SuperformulaBlossom",
        "H": 120.0,
        "top_od": 105.5,
        "bottom_od": 95.5,
        "t_wall": 2.5,
        "t_bottom": 3.0,
        "r_drain": 6.0,
        "expn": 1.5,
        "opts": {f"param_{i}": float(i) for i in range(20)},
    }

    encoded = encode_state(state)

    # Should be under typical URL length limit
    assert len(encoded) < 2000

    # Should roundtrip correctly
    decoded = decode_state(encoded)
    assert decoded == state


def test_validate_numeric_type_checking():
    """Test that non-numeric values for numeric params are rejected."""
    state = {
        "H": "not_a_number",
        "top_od": [123],  # List instead of number
    }

    validated, warnings = validate_state(state)

    assert "H" not in validated
    assert "top_od" not in validated
    assert len(warnings) >= 2
