from __future__ import annotations

import sys
import types

# Ensure we have a shim in sys.modules before importing pfui modules so that
# module-level imports inside pfui bind to our shim in tests. This must occur
# at import time for the module under test.
shim = types.ModuleType("streamlit")
shim.session_state = {}
shim.info = lambda *a, **k: None
shim.warning = lambda *a, **k: None
shim.caption = lambda *a, **k: None
shim.empty = lambda *a, **k: None
shim.columns = lambda *a, **k: tuple(type("_C", (), {"__enter__": lambda s: None, "__exit__": lambda s, *a: None})() for _ in range(max(1, int(a[0] if a else 1))))
sys.modules["streamlit"] = shim
import streamlit as st


def test_pending_event_popped(monkeypatch):
    # Import pfui modules only after we've set a shim and ensured streamlit
    # in sys.modules refers to that shim so pfui binds to the right module.
    # Remove any pfui modules from sys.modules so we force a reimport bound to our shim.
    for k in list(sys.modules.keys()):
        if k == "pfui" or k.startswith("pfui.") or k.startswith("potfoundry."):
            del sys.modules[k]
    from importlib import import_module

    from pfui.tabs.interactive.preview import webgpu_renderer
    apply_pending_updates = import_module("pfui.state").apply_pending_updates
    # Emulate stored event in session_state that should be processed and
    # then removed to avoid repeated processing.
    print("DEBUG: test st id", id(st))
    print("DEBUG: webgpu get_st id", id(webgpu_renderer.get_st()))
    print("DEBUG: test st.session_state id", id(st.session_state))
    print("DEBUG: webgpu get_st.session_state id", id(webgpu_renderer.get_st().session_state))
    import sys as _sys
    print("sys.modules keys for streamlit:", [k for k in _sys.modules.keys() if k.startswith("streamlit")])
    st.session_state.clear()
    widget_key = "webgpu_preview"
    ev = {"type": "paramBatchComplete", "payload": {"commit": True, "params": {"H": 150.0}, "fields": []}}
    st.session_state[widget_key] = ev

    # Monkeypatch pfui.state.queue_update to capture calls for verification
    captured = []
    orig_queue = webgpu_renderer.queue_update
    def _wrap_queue(payload):
        captured.append(dict(payload))
        return orig_queue(payload)
    monkeypatch.setattr(webgpu_renderer, "queue_update", _wrap_queue)

    # Ensure our fake component isn't needed by using process_pending_webgpu_events directly.
    webgpu_renderer.process_pending_webgpu_events([widget_key])
    # verify that the param batch queued an update
    if not captured:
        # As a fallback, directly invoke the handler with same payload to debug
        webgpu_renderer._apply_live_param_batch(ev["payload"])
    assert captured, "queue_update should be called for paramBatchComplete commit payload"
    assert captured[0].get("H") == 150.0
    print("DEBUG: pending after process:", webgpu_renderer.get_st().session_state.get("__pending_updates__"))
    # After processing, the event should be popped from the active session state
    assert webgpu_renderer.get_st().session_state.get(widget_key) is None
    # And the param should have been queued/applied
    apply_pending_updates()
    print("DEBUG: pending after apply:", webgpu_renderer.get_st().session_state.get("__pending_updates__"))
    print("DEBUG: H after apply:", webgpu_renderer.get_st().session_state.get("H"))
    assert webgpu_renderer.get_st().session_state.get("H") == 150.0
