import sys
import types

sys.path.insert(0, ".")

# Setup shim
shim = types.ModuleType("streamlit")
shim.session_state = {}
shim.info = lambda *a, **k: None
shim.warning = lambda *a, **k: None
shim.caption = lambda *a, **k: None
shim.empty = lambda *a, **k: None
shim.columns = lambda *a, **k: tuple(type("_C", (), {"__enter__": lambda s: None, "__exit__": lambda s, *a: None})() for _ in range(max(1, int(a[0] if a else 1))))

sys.modules["streamlit"] = shim

# Import the module under test
from pfui.tabs.interactive.preview import webgpu_renderer

# Emulate stored event, process, and inspect session_state
st = shim
ss = st.session_state
ss.clear()
key = "webgpu_preview"
ess = {"type": "paramBatchComplete", "payload": {"commit": True, "params": {"H": 150.0}, "fields": []}}
ss[key] = ess
print("Before", ss.get(key))
webgpu_renderer.process_pending_webgpu_events([key])
print("After", ss.get(key))
print("session_state keys:", list(ss.keys()))

# Also show _PENDING updates
print("_PENDING:", ss.get("__pending_updates__"))
