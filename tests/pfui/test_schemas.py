# tests/pfui/test_schemas.py
from typing import Any, cast

import pytest

from pfui import schemas as S


def test_strip_alt_to_canonical_removes_legacy():
    style = "HarmonicRipple"
    opts = {
        "hr_petals": 7,  # legacy
        "petals_count": 9,  # canonical (wins)
        "unknown_key": 123,  # passthrough
    }
    out = S.normalize_style_opts(style, opts, direction="to_canonical", strip_alt=True)
    assert "petals_count" in out
    assert out["petals_count"] == 9
    assert "hr_petals" not in out, "legacy key should be stripped"
    assert out["unknown_key"] == 123


def test_strip_alt_to_engine_removes_canonical():
    style = "HarmonicRipple"
    opts = {
        "petals_count": 11,  # canonical
        "hr_petals": 5,  # legacy (wins for to_engine)
    }
    out = S.normalize_style_opts(style, opts, direction="to_engine", strip_alt=True)
    assert "hr_petals" in out
    assert out["hr_petals"] == 5
    assert "petals_count" not in out


def test_both_direction_keeps_both_even_with_strip_alt():
    style = "HarmonicRipple"
    opts = {"hr_petals": 7}
    out = S.normalize_style_opts(style, opts, direction="both", strip_alt=True)
    assert "hr_petals" in out and "petals_count" in out


def test_unknown_keys_passthrough():
    style = "SpiralRidges"
    opts = {"totally_unknown": 42}
    out = S.to_canonical(style, opts)
    assert out["totally_unknown"] == 42


def test_backward_compatibility_legacy_keys_roundtrip():
    style = "SpiralRidges"
    legacy = {"spiral_k": 9, "spiral_turns": 1.2}
    canon = S.to_canonical(style, legacy)
    # canonical keys should be present
    assert "ridge_count" in canon and canon["ridge_count"] == 9
    assert "ridge_helix_turns" in canon and canon["ridge_helix_turns"] == 1.2
    # going back to engine should produce legacy keys
    back = S.to_engine(style, canon)
    assert "spiral_k" in back and back["spiral_k"] == 9
    assert "spiral_turns" in back and back["spiral_turns"] == 1.2


def test_select_validation_in_coerce_one():
    meta = {"type": "select", "options": ["a", "b", "c"]}
    assert S._coerce_one("a", cast("Any", meta)) == "a"
    with pytest.raises(ValueError):
        S._coerce_one("z", cast("Any", meta))


def test_integrity_ok():
    problems = S.check_schema_integrity()
    assert problems == [], f"schema/alias inconsistencies found: {problems}"
