import sys
import types

sys.modules.pop("pfui", None)
sys.modules.pop("pfui.tabs.interactive.preview", None)
# Create fake streamlit
fake_st = types.ModuleType("streamlit")
fake_st.session_state = {}
data = dict(session_state=fake_st.session_state)
sys.modules["streamlit"] = fake_st
# Add stub components.v1.html to mimic streamlit.components.v1
components_mod = types.ModuleType("streamlit.components")
v1_mod = types.ModuleType("streamlit.components.v1")
v1_mod.html = lambda *args, **kwargs: None
v1_mod.declare_component = lambda *args, **kwargs: (lambda *a, **k: None)
components_mod.v1 = v1_mod
sys.modules["streamlit.components"] = components_mod
sys.modules["streamlit.components.v1"] = v1_mod

from pfui.state import widget_key
from pfui.tabs.interactive.preview import webgpu_renderer as renderer

fake_st.session_state.clear()
payload1 = {"timestamp":1, "fields":[{"sessionKey":"H","value":150.0}]}
renderer._store_live_preview_snapshot(payload1)
print("after 1:", fake_st.session_state)
payload2 = {"timestamp":2, "fields":[{"sessionKey": widget_key("HarmonicRipple", "spin_turns"), "value":-1.0}]}
renderer._store_live_preview_snapshot(payload2)
print("after 2:", fake_st.session_state)
