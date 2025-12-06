import sys
import types

sys.path.insert(0, ".")

# Setup shim and assign
shim = types.ModuleType("streamlit")
shim.session_state = {}
shim.info = lambda *a, **k: None
shim.warning = lambda *a, **k: None
shim.caption = lambda *a, **k: None
shim.columns = lambda *a, **k: tuple(type("_C", (), {"__enter__": lambda s: None, "__exit__": lambda s, *a: None})() for _ in range(max(1, int(a[0] if a else 1))))

sys.modules["streamlit"] = shim
import streamlit as st

# remove pfui modules and import pfui
for k in list(sys.modules.keys()):
    if k == "pfui" or k.startswith("pfui.") or k.startswith("potfoundry."):
        del sys.modules[k]

from pfui.tabs.interactive.preview import webgpu_renderer

print("id-test-st", id(st))
print("id-get_st", id(webgpu_renderer.get_st()))
print("id-test-ss", id(st.session_state))
print("id-get_st-ss", id(webgpu_renderer.get_st().session_state))

st.session_state.clear()
st.session_state["webgpu_preview"] = {"type":"paramBatchComplete", "payload": {"commit":True, "params": {"H": 150}, "fields": []}}

print("Before event present in ss:", st.session_state.get("webgpu_preview"))
webgpu_renderer.process_pending_webgpu_events(["webgpu_preview"])
print("After event present in ss:", st.session_state.get("webgpu_preview"))
print("id-get_st-ss after", id(webgpu_renderer.get_st().session_state))
print("get_st().session_state", webgpu_renderer.get_st().session_state)
