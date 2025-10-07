"""Tests for library validation functions."""
import pytest

from potfoundry.library import (
    validate_title,
    validate_tags,
    validate_license,
    validate_stl_size,
    validate_triangle_count,
)


def test_validate_title_accepts_valid():
    """Test that valid titles are accepted."""
    valid, error = validate_title("My Beautiful Pot Design")
    assert valid
    assert error is None


def test_validate_title_rejects_empty():
    """Test that empty titles are rejected."""
    valid, error = validate_title("")
    assert not valid
    assert "empty" in error.lower()


def test_validate_title_rejects_too_long():
    """Test that titles over 120 chars are rejected."""
    long_title = "x" * 121
    valid, error = validate_title(long_title)
    assert not valid
    assert "120" in error


def test_validate_title_accepts_max_length():
    """Test that titles at exactly 120 chars are accepted."""
    max_title = "x" * 120
    valid, error = validate_title(max_title)
    assert valid


def test_validate_title_blocklist():
    """Test that blocklisted words are rejected."""
    valid, error = validate_title("This is a spam title")
    assert not valid
    assert "inappropriate" in error.lower()


def test_validate_tags_accepts_valid():
    """Test that valid tags are accepted."""
    tags = ["modern", "fluted", "tall"]
    valid, error = validate_tags(tags)
    assert valid
    assert error is None


def test_validate_tags_rejects_too_many():
    """Test that more than 10 tags are rejected."""
    tags = [f"tag{i}" for i in range(11)]
    valid, error = validate_tags(tags)
    assert not valid
    assert "10" in error


def test_validate_tags_rejects_too_long():
    """Test that tags over 24 chars are rejected."""
    tags = ["x" * 25]
    valid, error = validate_tags(tags)
    assert not valid
    assert "24" in error


def test_validate_tags_rejects_invalid_chars():
    """Test that tags with invalid characters are rejected."""
    tags = ["tag with spaces"]
    valid, error = validate_tags(tags)
    assert not valid
    assert "invalid characters" in error.lower()
    
    tags = ["tag@with!special"]
    valid, error = validate_tags(tags)
    assert not valid


def test_validate_tags_accepts_alphanumeric_dash_underscore():
    """Test that tags with alphanumeric, dash, underscore are accepted."""
    tags = ["modern-style", "tall_pot", "design2024"]
    valid, error = validate_tags(tags)
    assert valid


def test_validate_license_accepts_allowed():
    """Test that allowed licenses are accepted."""
    allowed = [
        "CC BY-NC 4.0",
        "CC BY 4.0",
        "CC BY-SA 4.0",
        "CC0 1.0",
        "MIT",
        "Apache 2.0",
    ]
    
    for license in allowed:
        valid, error = validate_license(license)
        assert valid, f"License {license} should be valid"


def test_validate_license_rejects_unknown():
    """Test that unknown licenses are rejected."""
    valid, error = validate_license("Unknown License")
    assert not valid
    assert "must be one of" in error.lower()


def test_validate_stl_size_accepts_small():
    """Test that small STL files are accepted."""
    small_stl = b"x" * 1024  # 1KB
    valid, error = validate_stl_size(small_stl)
    assert valid


def test_validate_stl_size_rejects_large():
    """Test that STL files over 25MB are rejected."""
    large_stl = b"x" * (26 * 1024 * 1024)  # 26MB
    valid, error = validate_stl_size(large_stl)
    assert not valid
    assert "too large" in error.lower()
    assert "25" in error


def test_validate_triangle_count_accepts_reasonable():
    """Test that reasonable triangle counts are accepted."""
    diagnostics = {"triangle_count": 100000}
    valid, error = validate_triangle_count(diagnostics)
    assert valid


def test_validate_triangle_count_rejects_huge():
    """Test that huge triangle counts are rejected."""
    diagnostics = {"triangle_count": 6_000_000}
    valid, error = validate_triangle_count(diagnostics)
    assert not valid
    assert "too high" in error.lower()
    assert "5,000,000" in error or "5000000" in error
