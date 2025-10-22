"""Tests for canonical JSON generation and content hashing."""

import json
import hashlib

from potfoundry.library import canonical_payload, content_id, _normalize_dict


def test_canonical_payload_structure(
    sample_style,
    sample_size,
    sample_opts,
    sample_mesh,
    sample_diagnostics,
    sample_license,
):
    """Test that canonical payload has correct structure."""
    payload = canonical_payload(
        sample_style,
        sample_size,
        sample_opts,
        sample_mesh,
        sample_diagnostics,
        sample_license,
    )

    assert "version" in payload
    assert "style" in payload
    assert "size" in payload
    assert "opts" in payload
    assert "mesh" in payload
    assert "diagnostics" in payload
    assert "license" in payload

    assert payload["style"] == sample_style
    assert payload["license"] == sample_license


def test_canonical_float_rounding():
    """Test that floats are rounded to 6 decimal places."""
    data = {"value": 1.23456789012345}
    normalized = _normalize_dict(data, precision=6)

    assert normalized["value"] == 1.234568


def test_canonical_dict_sorting():
    """Test that dictionary keys are sorted."""
    data = {"z": 3, "a": 1, "m": 2}
    normalized = _normalize_dict(data)

    keys = list(normalized.keys())
    assert keys == ["a", "m", "z"]


def test_canonical_nested_sorting():
    """Test that nested dictionaries are also sorted."""
    data = {"z": {"b": 2, "a": 1}, "a": {"z": 3, "m": 2}}
    normalized = _normalize_dict(data)

    # Check top-level sort
    top_keys = list(normalized.keys())
    assert top_keys == ["a", "z"]

    # Check nested sort
    assert list(normalized["z"].keys()) == ["a", "b"]
    assert list(normalized["a"].keys()) == ["m", "z"]


def test_content_id_stability(
    sample_style,
    sample_size,
    sample_opts,
    sample_mesh,
    sample_diagnostics,
    sample_license,
):
    """Test that content_id is stable across multiple calls."""
    payload = canonical_payload(
        sample_style,
        sample_size,
        sample_opts,
        sample_mesh,
        sample_diagnostics,
        sample_license,
    )

    id1 = content_id(payload)
    id2 = content_id(payload)
    id3 = content_id(payload)

    assert id1 == id2 == id3
    assert len(id1) == 64  # sha256 hex is 64 characters
    assert all(c in "0123456789abcdef" for c in id1)


def test_content_id_key_order_invariant(
    sample_style,
    sample_size,
    sample_opts,
    sample_mesh,
    sample_diagnostics,
    sample_license,
):
    """Test that content_id is same regardless of key insertion order."""
    # Create two payloads with different key orders
    payload1 = canonical_payload(
        sample_style,
        sample_size,
        sample_opts,
        sample_mesh,
        sample_diagnostics,
        sample_license,
    )

    # Manually reorder keys by reconstructing
    payload2 = {
        "license": sample_license,
        "diagnostics": _normalize_dict(sample_diagnostics),
        "mesh": _normalize_dict(sample_mesh),
        "opts": _normalize_dict(sample_opts),
        "size": _normalize_dict(sample_size),
        "style": sample_style,
        "version": "2.0.0",
    }

    id1 = content_id(payload1)
    id2 = content_id(payload2)

    assert id1 == id2


def test_content_id_different_for_different_data(
    sample_style,
    sample_size,
    sample_opts,
    sample_mesh,
    sample_diagnostics,
    sample_license,
):
    """Test that different data produces different IDs."""
    payload1 = canonical_payload(
        sample_style,
        sample_size,
        sample_opts,
        sample_mesh,
        sample_diagnostics,
        sample_license,
    )

    # Change one parameter
    modified_size = {**sample_size, "height": 150.0}
    payload2 = canonical_payload(
        sample_style,
        modified_size,
        sample_opts,
        sample_mesh,
        sample_diagnostics,
        sample_license,
    )

    id1 = content_id(payload1)
    id2 = content_id(payload2)

    assert id1 != id2


def test_content_id_matches_manual_hash(sample_style):
    """Test that content_id matches manual sha256 computation."""
    payload = {
        "version": "2.0.0",
        "style": sample_style,
        "size": {"height": 100.0},
        "opts": {},
        "mesh": {"n_theta": 144},
        "diagnostics": {},
        "license": "CC BY-NC 4.0",
    }

    # Manual hash
    canonical_json = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    manual_hash = hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()

    # Library hash
    lib_hash = content_id(payload)

    assert lib_hash == manual_hash
