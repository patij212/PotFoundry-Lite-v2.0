import sys
import types

# Create the streamlit shim similar to conftest.py
st_mod = types.ModuleType("streamlit")
st_mod.session_state = {}
sys.modules["streamlit"] = st_mod
# Minimal streamlit.components.v1.html shim required by webgpu_renderer
components_mod = types.ModuleType("streamlit.components")
v1_mod = types.ModuleType("streamlit.components.v1")
v1_mod.html = lambda *args, **kwargs: None
components_mod.v1 = v1_mod
sys.modules["streamlit.components"] = components_mod
sys.modules["streamlit.components.v1"] = v1_mod
# Add a basic declare_component implementation used by pfui.components.webgpu_component
def declare_component(name: str, *args, **kwargs):
	# Return a callable that accepts props and returns None (no event)
	def component_callable(*_a, **_k):
		return None

	return component_callable

components_mod.declare_component = declare_component
v1_mod.declare_component = declare_component

from pfui.state import apply_pending_updates
from pfui.tabs.interactive.preview import webgpu_renderer

ss = sys.modules["streamlit"].session_state
ss.clear()
widget_key = "webgpu_preview"
ev = {"type": "paramBatchComplete", "payload": {"commit": True, "params": {"H": 150.0}, "fields": []}}
ss[widget_key] = ev

print("Before process:", ss)
webgpu_renderer.process_pending_webgpu_events([widget_key])
print("After process, before apply:", ss)
apply_pending_updates()
print("After apply:", ss)

print("\n--- CAMERA STATE LOOP ---")
ss.clear()
for i in range(10):
	payload = {"rotX": 0.35, "rotY": 0.1 * i, "zoom": 1.0, "timestamp": 100 + i, "canvasId": "test-canvas"}
	ss[widget_key] = {"type": "cameraState", "payload": payload, "seq": i}
	webgpu_renderer.process_pending_webgpu_events([widget_key])
	ss.pop(widget_key, None)
print("After camera events (pending):", ss)
apply_pending_updates()
print("After apply camera updates:", ss)
