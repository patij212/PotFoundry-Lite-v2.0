"""Tests for WebGPU style parameter payload helpers."""
from __future__ import annotations

from pfui.preview.style_params import (
    STYLE_ID_MAP,
    STYLE_PARAM_CAPACITY,
    build_style_param_payload,
)


def test_payload_lengths_and_sentinels() -> None:
    for style_name, style_id in STYLE_ID_MAP.items():
        sid, payload = build_style_param_payload(style_name, {})
        assert sid == style_id
        assert len(payload) == STYLE_PARAM_CAPACITY
        assert payload[-1] == float(style_id + 1)


def test_unknown_style_defaults_to_superformula() -> None:
    sid, payload = build_style_param_payload("UnknownStyle", {})
    assert sid == 0
    assert len(payload) == STYLE_PARAM_CAPACITY
    assert payload[-1] == 1.0
