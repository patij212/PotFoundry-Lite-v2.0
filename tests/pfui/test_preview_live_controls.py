# tests/pfui/test_preview_live_controls.py
"""Unit tests for live-control preview persistence wiring."""

from __future__ import annotations

import sys
import types
from typing import Any, cast

# Stub streamlit before importing preview modules to avoid heavy dependency requirements.
fake_streamlit = cast("Any", types.ModuleType("streamlit"))
fake_streamlit.session_state = {}


def _noop(*args: Any, **kwargs: Any) -> None:
    return None


class _DummyContext:
    def __enter__(self):
        return self

    def __exit__(self, *args: object) -> bool:
        return False


fake_streamlit.info = _noop  # type: ignore[attr-defined]
fake_streamlit.warning = _noop  # type: ignore[attr-defined]
fake_streamlit.caption = _noop  # type: ignore[attr-defined]
fake_streamlit.columns = lambda *args, **kwargs: (_DummyContext(), _DummyContext())  # type: ignore[attr-defined]
fake_streamlit.checkbox = lambda *args, **kwargs: False  # type: ignore[attr-defined]
fake_streamlit.button = lambda *args, **kwargs: False  # type: ignore[attr-defined]
fake_streamlit.expander = lambda *args, **kwargs: _DummyContext()  # type: ignore[attr-defined]
fake_streamlit.slider = _noop  # type: ignore[attr-defined]
fake_streamlit.number_input = _noop  # type: ignore[attr-defined]

_test_mod = fake_streamlit

import importlib

from pfui.state import widget_key  # noqa: E402
from pfui.tabs.interactive import (
    preview_impl as preview,  # type: ignore[attr-defined]
)


def _build_session_with_preview(style: str) -> dict[str, Any]:
    ss: dict[str, Any] = {
        "H": 180.0,
        widget_key(style, "spin_turns"): 1.75,
    }
    style_field_key = widget_key(style, "hr_petals")
    ss[style_field_key] = 22.0
    ss["_webgpu_live_controls_preview"] = {
        "timestamp": 123.0,
        "fields": [
            {"sessionKey": "H", "value": 150.0},
            {"sessionKey": widget_key(style, "spin_turns"), "value": -1.0},
            {"sessionKey": style_field_key, "value": 12.0},
        ],
    }
    return ss


def _field_value(spec: dict[str, Any], session_key: str) -> float:
    for field in spec["fields"]:
        if field["sessionKey"] == session_key:
            return field["value"]
    raise AssertionError(f"Field with sessionKey={session_key} missing")


def test_live_controls_use_preview_snapshot_for_all_field_groups():
    style = "HarmonicRipple"
    ss = _build_session_with_preview(style)

    spec = preview._build_live_controls_spec(ss, style, enabled=True)

    assert spec["enabled"] is True
    assert _field_value(spec, "H") == 150.0

    twist_key = widget_key(style, "spin_turns")
    assert _field_value(spec, twist_key) == -1.0

    style_field_key = widget_key(style, "hr_petals")
    assert _field_value(spec, style_field_key) == 12.0


def test_live_controls_fall_back_to_session_state_when_no_preview():
    style = "HarmonicRipple"
    ss: dict[str, Any] = {
        "H": 200.0,
        widget_key(style, "spin_turns"): -0.5,
        widget_key(style, "hr_petals"): 9.0,
    }

    spec = preview._build_live_controls_spec(ss, style, enabled=True)

    assert _field_value(spec, "H") == 200.0
    assert _field_value(spec, widget_key(style, "spin_turns")) == -0.5
    assert _field_value(spec, widget_key(style, "hr_petals")) == 9.0


def test_preview_snapshot_map_persists_prior_fields():
    fake_streamlit.session_state.clear()
    sys.modules["streamlit"] = _test_mod
    renderer = importlib.import_module("pfui.tabs.interactive.preview.webgpu_renderer")
    importlib.reload(renderer)
    renderer._store_live_preview_snapshot(  # type: ignore[attr-defined]
        {
            "timestamp": 1,
            "fields": [
                {"sessionKey": "H", "value": 150.0},
            ],
        },
    )
    renderer._store_live_preview_snapshot(  # type: ignore[attr-defined]
        {
            "timestamp": 2,
            "fields": [
                {"sessionKey": widget_key("HarmonicRipple", "spin_turns"), "value": -1.0},
            ],
        },
    )

    preview_map = fake_streamlit.session_state["_webgpu_live_controls_preview_map"]
    assert preview_map["H"]["value"] == 150.0
    assert preview_map[widget_key("HarmonicRipple", "spin_turns")]["value"] == -1.0


def test_preview_snapshot_overwrites_same_field_with_latest_value():
    fake_streamlit.session_state.clear()
    sys.modules["streamlit"] = _test_mod
    renderer = importlib.import_module("pfui.tabs.interactive.preview.webgpu_renderer")
    importlib.reload(renderer)
    renderer._store_live_preview_snapshot(  # type: ignore[attr-defined]
        {
            "timestamp": 5,
            "fields": [
                {"sessionKey": "H", "value": 140.0},
            ],
        },
    )
    renderer._store_live_preview_snapshot(  # type: ignore[attr-defined]
        {
            "timestamp": 9,
            "fields": [
                {"sessionKey": "H", "value": 175.0},
            ],
        },
    )

    preview_map = fake_streamlit.session_state["_webgpu_live_controls_preview_map"]
    assert preview_map["H"]["value"] == 175.0
    assert preview_map["H"]["timestamp"] == 9


def test_preview_snapshot_clears_on_commit():
    fake_streamlit.session_state.clear()
    sys.modules["streamlit"] = _test_mod
    renderer = importlib.import_module("pfui.tabs.interactive.preview.webgpu_renderer")
    importlib.reload(renderer)
    renderer._store_live_preview_snapshot(  # type: ignore[attr-defined]
        {
            "timestamp": 10,
            "fields": [
                {"sessionKey": "H", "value": 160.0},
            ],
        },
    )
    renderer._clear_live_preview_snapshot()  # type: ignore[attr-defined]
    assert "_webgpu_live_controls_preview" not in fake_streamlit.session_state
    assert "_webgpu_live_controls_preview_map" not in fake_streamlit.session_state


def test_live_param_batch_prefers_frontend_scaled_radii():
    fake_streamlit.session_state.clear()
    applied: list[dict[str, float]] = []
    sys.modules["streamlit"] = _test_mod
    renderer = importlib.import_module("pfui.tabs.interactive.preview.webgpu_renderer")
    importlib.reload(renderer)
    original_queue = renderer.queue_update  # type: ignore[attr-defined]

    def _capture_queue(payload: dict[str, float]) -> None:
        applied.append(dict(payload))

    renderer.queue_update = _capture_queue  # type: ignore[attr-defined]
    try:
        renderer._apply_live_param_batch(  # type: ignore[attr-defined]
            {
                "commit": True,
                "timestamp": 42,
                "fields": [
                    {"sessionKey": "top_od", "value": 140.0},
                    {"sessionKey": "bottom_od", "value": 100.0},
                ],
                # Frontend already supplied scaled radii (e.g., after paramScale).
                "params": {
                    "Rt": 60.0,
                    "Rb": 40.0,
                    "H": 180.0,
                },
            },
        )
    finally:
        renderer.queue_update = original_queue  # type: ignore[attr-defined]

    assert applied, "queue_update should be invoked"
    latest = applied[-1]
    # Ensure the frontend-provided radii win over derived OD -> radius conversions.
    assert latest["Rt"] == 60.0
    assert latest["Rb"] == 40.0
    # Raw OD values should still propagate for legacy session keys.
    assert latest["top_od"] == 140.0
    assert latest["bottom_od"] == 100.0
    # Session state reflects the update bookkeeping flags.
    assert fake_streamlit.session_state["_preview_stale"] is True
    assert fake_streamlit.session_state["_webgpu_live_params"]["Rt"] == 60.0
