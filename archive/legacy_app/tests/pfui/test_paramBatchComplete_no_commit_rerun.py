from __future__ import annotations

import sys
import types

# Set a streamlit shim before import so pfui modules bind to the shim
shim = types.ModuleType("streamlit")
shim.session_state = {}
shim.info = lambda *a, **k: None
shim.warning = lambda *a, **k: None
shim.caption = lambda *a, **k: None
shim.empty = lambda *a, **k: None
shim.columns = lambda *a, **k: tuple(type("_C", (), {"__enter__": lambda s: None, "__exit__": lambda s, *a: None})() for _ in range(max(1, int(a[0] if a else 1))))
sys.modules["streamlit"] = shim
import streamlit as st

# Force re-import pfui modules under our shim by removing cached pfui modules
for k in list(sys.modules.keys()):
    if k == "pfui" or k.startswith("pfui.") or k.startswith("potfoundry."):
        del sys.modules[k]
from pfui.state import apply_pending_updates
from pfui.tabs.interactive.preview import webgpu_renderer


def test_param_batch_non_commit_does_not_rerun(monkeypatch):
    rerun_called = {"flag": False}

    def fake_rerun():
        rerun_called["flag"] = True

    monkeypatch.setattr(st, "rerun", fake_rerun, raising=False)
    monkeypatch.setattr(st, "experimental_rerun", fake_rerun, raising=False)

    # Arrange: fake component returns a paramBatchComplete with commit False
    def fake_component(*args, **kwargs):
        return {"type": "paramBatchComplete", "payload": {"commit": False, "params": {"H": 120}, "fields": []}}

    monkeypatch.setattr(webgpu_renderer, "_render_component", fake_component)

    st.session_state.clear()

    webgpu_renderer.render_webgpu_preview(params={})
    apply_pending_updates()

    assert not rerun_called["flag"], "Non-commit paramBatchComplete events should not cause a rerun"
    # ensure pending updates are reflected in module session_state if any
    assert webgpu_renderer.get_st().session_state.get("_preview_stale") in (True, None)
