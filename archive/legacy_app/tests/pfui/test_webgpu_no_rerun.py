from __future__ import annotations

import sys
import types

# Ensure a streamlit shim exists in sys.modules before importing pfui modules
shim = types.ModuleType("streamlit")
shim.session_state = {}
shim.info = lambda *a, **k: None
shim.warning = lambda *a, **k: None
shim.caption = lambda *a, **k: None
shim.empty = lambda *a, **k: None
shim.columns = lambda *a, **k: tuple(type("_C", (), {"__enter__": lambda s: None, "__exit__": lambda s, *a: None})() for _ in range(max(1, int(a[0] if a else 1))))
sys.modules["streamlit"] = shim
import streamlit as st

# Remove any cached pfui modules before import so they're bound to our shim
for k in list(sys.modules.keys()):
    if k == "pfui" or k.startswith("pfui.") or k.startswith("potfoundry."):
        del sys.modules[k]
from pfui.state import apply_pending_updates
from pfui.tabs.interactive.preview import webgpu_renderer


def test_camera_state_does_not_force_rerun(monkeypatch):
    # Arrange: fake component returns a continuous cameraState event
    def fake_component(*args, **kwargs):
        return {"type": "cameraState", "payload": {"autoRotate": True}}

    monkeypatch.setattr(webgpu_renderer, "_render_component", fake_component)

    rerun_called = {"flag": False}

    def fake_rerun():
        rerun_called["flag"] = True

    # Replace st.rerun (and experimental variant) with our fake
    monkeypatch.setattr(st, "rerun", fake_rerun, raising=False)
    monkeypatch.setattr(st, "experimental_rerun", fake_rerun, raising=False)

    # Ensure session state is cleared for test isolation
    st.session_state.clear()

    # Act: render the webgpu preview (which would call our fake_component)
    webgpu_renderer.render_webgpu_preview(params={})

    # Pending camera update should be queued; applying pending updates updates session_state
    apply_pending_updates()

    # Assert: no rerun was triggered by the cameraState event
    assert not rerun_called["flag"], "Camera state should not force Streamlit rerun"
    # And the pending camera state was applied; use module's active st
    assert webgpu_renderer.get_st().session_state.get("webgpu_auto_rotate") is True
