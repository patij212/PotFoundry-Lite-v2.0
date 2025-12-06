"""Unit tests for the rerun rate limiting behavior implemented in
pfui.tabs.interactive.preview.webgpu_renderer.

These ensure the per-canvas and global-per-minute caps prevent runaway
re-runs even when a noisy client attempts repeated commits.
"""

from __future__ import annotations

import sys
import types
import importlib

fake_streamlit = types.ModuleType("streamlit")
fake_streamlit.session_state = {}

def _noop(*args, **kwargs):
    return None

fake_streamlit.info = _noop
fake_streamlit.warning = _noop
fake_streamlit.caption = _noop
fake_streamlit.expander = lambda *args, **kwargs: type("_D", (), {"__enter__": lambda s: s, "__exit__": lambda s, *a: False})()


def test_per_canvas_rerun_cap():
    fake_streamlit.session_state.clear()
    sys.modules["streamlit"] = fake_streamlit
    rerun_calls = []

    def fake_rerun():
        rerun_calls.append(True)

    fake_streamlit.experimental_rerun = fake_rerun
    renderer = importlib.import_module("pfui.tabs.interactive.preview.webgpu_renderer")
    importlib.reload(renderer)
    # expose the configured caps from the module
    cap = getattr(renderer, "_CANVAS_RERUNS_PER_MINUTE", 3)
    # Mark the canvas as seen
    canvas_id = "ratecap-canvas"
    fake_streamlit.session_state[f"_webgpu_component_seen:{canvas_id}"] = True
    reason = f"webgpu-live-controls:{canvas_id}"

    # Reset any global cooldown tracking in the session_state
    fake_streamlit.session_state["_webgpu_global_rerun_ts"] = 0
    # Simulate many rerun requests; the cap should suppress excess reruns
    import time
    for i in range(cap + 3):
        renderer._request_streamlit_rerun(reason)  # type: ignore[attr-defined]
        # Reset global cooldown timestamp so repeated calls count toward the
        # per-minute cap and are not suppressed by the 1s cooldown.
        fake_streamlit.session_state["_webgpu_global_rerun_ts"] = 0
    # debug info removed
    assert len(rerun_calls) == cap, "Per-canvas rerun cap should suppress excess reruns"


def test_global_rerun_cap():
    fake_streamlit.session_state.clear()
    sys.modules["streamlit"] = fake_streamlit
    rerun_calls = []

    def fake_rerun():
        rerun_calls.append(True)

    fake_streamlit.experimental_rerun = fake_rerun
    renderer = importlib.import_module("pfui.tabs.interactive.preview.webgpu_renderer")
    importlib.reload(renderer)
    cap = getattr(renderer, "_GLOBAL_RERUNS_PER_MINUTE", 8)
    fake_streamlit.session_state["_webgpu_global_rerun_ts"] = 0

    # Use distinct canvas ids so per-canvas caps do not mask the global cap
    import time
    for i in range(cap + 3):
        canvas = f"gcap-{i}"
        reason = f"webgpu-live-controls:{canvas}"
        # Ensure each one is marked as seen to avoid initial commit guard
        fake_streamlit.session_state[f"_webgpu_component_seen:{canvas}"] = True
        renderer._request_streamlit_rerun(reason)  # type: ignore[attr-defined]
        # Reset global cooldown timestamp so repeated calls count toward the
        # per-minute cap and are not suppressed by the 1s cooldown.
        fake_streamlit.session_state["_webgpu_global_rerun_ts"] = 0
    # debug info removed
    assert len(rerun_calls) == cap, "Global rerun cap should limit total reruns per minute"
