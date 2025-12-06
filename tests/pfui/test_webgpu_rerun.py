"""Tests for server-side dedupe & rate-limiting for WebGPU param commit reruns."""

from __future__ import annotations

import sys
import types
from typing import Any, cast

# Stub streamlit before importing preview modules to avoid heavy dependency requirements.
fake_streamlit = cast("Any", types.ModuleType("streamlit")) if False else types.ModuleType("streamlit")
fake_streamlit.session_state = {}


def _noop(*args: Any, **kwargs: Any) -> None:
    return None


fake_streamlit.info = _noop  # type: ignore[attr-defined]
fake_streamlit.warning = _noop  # type: ignore[attr-defined]
fake_streamlit.caption = _noop  # type: ignore[attr-defined]
class _DummyContext:
    def __enter__(self):
        return self

    def __exit__(self, *args: object) -> bool:
        return False


fake_streamlit.columns = lambda *args, **kwargs: (_DummyContext(), _DummyContext())  # type: ignore[attr-defined]
fake_streamlit.checkbox = lambda *args, **kwargs: False  # type: ignore[attr-defined]
fake_streamlit.button = lambda *args, **kwargs: False  # type: ignore[attr-defined]
fake_streamlit.expander = lambda *args, **kwargs: _DummyContext()  # type: ignore[attr-defined]
fake_streamlit.slider = _noop  # type: ignore[attr-defined]
fake_streamlit.number_input = _noop  # type: ignore[attr-defined]

# We assign the streamlit shim inside each test below, to ensure the pfui
# modules are imported under the test's shim rather than a session-level shim.

# Defer importing the module until each test to ensure the Streamlit shim
# assignment in the test module is actually bound; importing at module
# import-time can yield stale module objects when the test environment's
# autouse fixture resets modules between tests.
import importlib


class _DummyContext:
    def __enter__(self):
        return self

    def __exit__(self, *args: object) -> bool:
        return False


def test_param_commit_dedupe():
    fake_streamlit.session_state.clear()
    sys.modules["streamlit"] = fake_streamlit
    rerun_calls = []

    def fake_rerun():
        rerun_calls.append(True)

    fake_streamlit.experimental_rerun = fake_rerun  # type: ignore[attr-defined]

    payload = {
        "commit": True,
        "timestamp": 123,
        "fields": [{"sessionKey": "H", "value": 150.0}],
        "params": {"H": 150.0},
        "canvasId": "test-canvas",
    }

    # Reload to ensure the module references our fake streamlit
    renderer = importlib.import_module("pfui.tabs.interactive.preview.webgpu_renderer")
    importlib.reload(renderer)
    renderer._apply_live_param_batch(payload, rerun_if_queued=True)  # type: ignore[attr-defined]
    # process queued events to flush scheduled reruns
    renderer.process_pending_webgpu_events()
    # Simulate a duplicate commit (same payload); server-side dedupe should prevent rerun
    renderer._apply_live_param_batch(payload, rerun_if_queued=True)  # type: ignore[attr-defined]
    renderer.process_pending_webgpu_events()

    assert len(rerun_calls) == 1, "Duplicate param commits should only cause a single rerun"


def test_param_commit_rate_limit():
    fake_streamlit.session_state.clear()
    sys.modules["streamlit"] = fake_streamlit
    rerun_calls = []

    def fake_rerun():
        rerun_calls.append(True)

    fake_streamlit.experimental_rerun = fake_rerun  # type: ignore[attr-defined]

    payload1 = {
        "commit": True,
        "timestamp": 124,
        "fields": [{"sessionKey": "H", "value": 150.0}],
        "params": {"H": 150.0},
        "canvasId": "test-canvas",
    }
    payload2 = {
        "commit": True,
        "timestamp": 125,
        "fields": [{"sessionKey": "H", "value": 180.0}],
        "params": {"H": 180.0},
        "canvasId": "test-canvas",
    }

    renderer = importlib.import_module("pfui.tabs.interactive.preview.webgpu_renderer")
    importlib.reload(renderer)
    renderer._apply_live_param_batch(payload1, rerun_if_queued=True)  # type: ignore[attr-defined]
    renderer.process_pending_webgpu_events()
    # Simulate a quick follow-up commit; since the last rerun time was just set,
    # the second rerun should be suppressed by the cooldown.
    renderer._apply_live_param_batch(payload2, rerun_if_queued=True)  # type: ignore[attr-defined]
    renderer.process_pending_webgpu_events()

    assert len(rerun_calls) == 1, "Rate limiter should prevent repeated reruns in a short window"


def test_camera_state_does_not_rerun():
    fake_streamlit.session_state.clear()
    sys.modules["streamlit"] = fake_streamlit
    rerun_calls = []

    def fake_rerun():
        rerun_calls.append(True)

    fake_streamlit.experimental_rerun = fake_rerun  # type: ignore[attr-defined]

    camera_payload = {
        "rotX": 0.01,
        "rotY": 0.02,
        "zoom": 1.0,
        "panX": 0.0,
        "panY": 0.0,
        "timestamp": 500,
        "canvasId": "test-canvas",
    }

    event = {"type": "cameraState", "payload": camera_payload, "seq": 1}
    renderer = importlib.import_module("pfui.tabs.interactive.preview.webgpu_renderer")
    importlib.reload(renderer)
    renderer._handle_component_event(event, rerun_if_queued=True)  # type: ignore[attr-defined]

    assert len(rerun_calls) == 0, "Camera state events should not trigger a Streamlit rerun"


def test_global_rerun_cooldown():
    fake_streamlit.session_state.clear()
    sys.modules["streamlit"] = fake_streamlit
    rerun_calls = []

    def fake_rerun():
        rerun_calls.append(True)

    fake_streamlit.experimental_rerun = fake_rerun  # type: ignore[attr-defined]
    import importlib
    renderer = importlib.import_module("pfui.tabs.interactive.preview.webgpu_renderer")
    importlib.reload(renderer)
    # First call should schedule a rerun
    renderer._request_streamlit_rerun("test-reason")  # type: ignore[attr-defined]
    # Immediately calling again should be suppressed by the global cooldown
    renderer._request_streamlit_rerun("test-reason-2")  # type: ignore[attr-defined]
    # Only one rerun call allowed due to the global cooldown
    assert len(rerun_calls) <= 1


def test_commit_different_canvas_not_dedupe():
    fake_streamlit.session_state.clear()
    sys.modules["streamlit"] = fake_streamlit
    rerun_calls = []

    def fake_rerun():
        rerun_calls.append(True)

    fake_streamlit.experimental_rerun = fake_rerun  # type: ignore[attr-defined]
    import importlib
    renderer = importlib.import_module("pfui.tabs.interactive.preview.webgpu_renderer")
    importlib.reload(renderer)

    payload_a = {
        "commit": True,
        "timestamp": 200,
        "fields": [{"sessionKey": "H", "value": 150.0}],
        "params": {"H": 150.0},
        "canvasId": "canvas-a",
    }
    payload_b = {
        "commit": True,
        "timestamp": 201,
        "fields": [{"sessionKey": "H", "value": 150.0}],
        "params": {"H": 150.0},
        "canvasId": "canvas-b",
    }
    # Mark both canvases as "seen" by the server so the first commit
    # behaves like a user action rather than the initial sync commit.
    fake_streamlit.session_state["_webgpu_component_seen:canvas-a"] = True
    fake_streamlit.session_state["_webgpu_component_seen:canvas-b"] = True
    renderer._apply_live_param_batch(payload_a, rerun_if_queued=True)  # type: ignore[attr-defined]
    renderer.process_pending_webgpu_events()
    # Clear the global cooldown timestamp so the second per-canvas commit can
    # trigger an otherwise valid rerun in the test environment.
    fake_streamlit.session_state["_webgpu_global_rerun_ts"] = 0
    renderer._apply_live_param_batch(payload_b, rerun_if_queued=True)  # type: ignore[attr-defined]
    renderer.process_pending_webgpu_events()

    # Different canvases should trigger separate reruns
    assert len(rerun_calls) == 2


def test_many_camera_states_no_rerun():
    fake_streamlit.session_state.clear()
    sys.modules["streamlit"] = fake_streamlit
    rerun_calls = []
    def fake_rerun():
        rerun_calls.append(True)
    fake_streamlit.experimental_rerun = fake_rerun  # type: ignore[attr-defined]
    import importlib
    renderer = importlib.import_module("pfui.tabs.interactive.preview.webgpu_renderer")
    importlib.reload(renderer)

    # Simulate multiple camera state events with slightly varying values
    for i in range(10):
        payload = {"rotX": 0.35, "rotY": 0.1 * i, "zoom": 1.0, "timestamp": 100 + i, "canvasId": "test-canvas"}
        event = {"type": "cameraState", "payload": payload, "seq": i}
        renderer._handle_component_event(event, rerun_if_queued=False)  # type: ignore[attr-defined]
    # Confirm no reruns triggered
    assert len(rerun_calls) == 0
    # Now apply pending updates and confirm the latest rotY is present
    from pfui.state import apply_pending_updates
    apply_pending_updates()
    assert fake_streamlit.session_state.get("webgpu_rotY") == 0.9


def test_coalesced_commit_burst():
    fake_streamlit.session_state.clear()
    sys.modules["streamlit"] = fake_streamlit
    rerun_calls = []

    def fake_rerun():
        rerun_calls.append(True)

    fake_streamlit.experimental_rerun = fake_rerun  # type: ignore[attr-defined]
    import importlib
    renderer = importlib.import_module("pfui.tabs.interactive.preview.webgpu_renderer")
    importlib.reload(renderer)

    canvas_id = "coalesce-canvas"
    # Mark the canvas as seen (component mounted)
    fake_streamlit.session_state[f"_webgpu_component_seen:{canvas_id}"] = True

    # Emit a burst of commit events; we expect coalescing to keep reruns low
    payload = {
        "commit": True,
        "timestamp": 400,
        "fields": [{"sessionKey": "H", "value": 150.0}],
        "params": {"H": 150.0},
        "canvasId": canvas_id,
    }
    for i in range(10):
        payload["timestamp"] = 400 + i
        payload["fields"][0]["value"] = 150.0 + i
        renderer._apply_live_param_batch(payload, rerun_if_queued=True)  # type: ignore[attr-defined]
        # Do not process pending events until after burst
    renderer.process_pending_webgpu_events()
    # Only one rerun should be scheduled (coalesced)
    assert len(rerun_calls) <= 1


def test_backpressure_blocks_heavy_burst():
    fake_streamlit.session_state.clear()
    sys.modules["streamlit"] = fake_streamlit
    rerun_calls = []

    def fake_rerun():
        rerun_calls.append(True)

    fake_streamlit.experimental_rerun = fake_rerun  # type: ignore[attr-defined]
    import importlib
    renderer = importlib.import_module("pfui.tabs.interactive.preview.webgpu_renderer")
    importlib.reload(renderer)

    canvas_id = "heavy-burst"
    fake_streamlit.session_state[f"_webgpu_component_seen:{canvas_id}"] = True
    # Emit a large number of commits across many canvases to trigger backpressure
    for i in range(500):
        payload = {
            "commit": True,
            "timestamp": 1000 + i,
            "fields": [{"sessionKey": "H", "value": 150.0 + (i % 10)}],
            "params": {"H": 150.0 + (i % 10)},
            "canvasId": canvas_id,
        }
        renderer._apply_live_param_batch(payload, rerun_if_queued=True)  # type: ignore[attr-defined]
    # Now process events once — backpressure should be activated and block subsequent runs
    renderer.process_pending_webgpu_events()
    # If backpressure activated, no more than a small number of reruns should have been scheduled
    assert len(rerun_calls) <= 3


def test_multiple_canvases_burst():
    fake_streamlit.session_state.clear()
    sys.modules["streamlit"] = fake_streamlit
    rerun_calls = []

    def fake_rerun():
        rerun_calls.append(True)

    fake_streamlit.experimental_rerun = fake_rerun  # type: ignore[attr-defined]
    import importlib
    renderer = importlib.import_module("pfui.tabs.interactive.preview.webgpu_renderer")
    importlib.reload(renderer)

    # Simulate multiple canvases each with a few commits
    canvas_ids = [f"burst-{i}" for i in range(5)]
    for c in canvas_ids:
        fake_streamlit.session_state[f"_webgpu_component_seen:{c}"] = True
    for c in canvas_ids:
        for i in range(3):
            payload = {
                "commit": True,
                "timestamp": 500 + i,
                "fields": [{"sessionKey": "H", "value": 150.0 + i}],
                "params": {"H": 150.0 + i},
                "canvasId": c,
            }
            renderer._apply_live_param_batch(payload, rerun_if_queued=True)  # type: ignore[attr-defined]
    renderer.process_pending_webgpu_events()
    # We expect at most len(canvas_ids) reruns (one per canvas), and due to
    # global cooldown and coalescing it should be <= len(canvas_ids).
    assert len(rerun_calls) <= len(canvas_ids)
