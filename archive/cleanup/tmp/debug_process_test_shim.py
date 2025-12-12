import sys
import types

sys.path.insert(0, ".")
# assign shim
shim = types.ModuleType("streamlit")
shim.session_state = {}
shim.info = lambda *a, **k: None
shim.warning = lambda *a, **k: None
shim.caption = lambda *a, **k: None
shim.columns = lambda *a, **k: tuple(type("_C", (), {"__enter__": lambda s: None, "__exit__": lambda s, *a: None})() for _ in range(max(1, int(a[0] if a else 1))))
sys.modules["streamlit"] = shim
from importlib import import_module

# remove pfui modules
for k in list(sys.modules.keys()):
    if k == "pfui" or k.startswith("pfui.") or k.startswith("potfoundry."):
        del sys.modules[k]
# import pfui module
webgpu_renderer = import_module("pfui.tabs.interactive.preview.webgpu_renderer")
ss = shim.session_state
ss.clear()
ss["webgpu_preview"] = {"type": "paramBatchComplete", "payload": {"commit": True, "params": {"H": 150.0}, "fields": []}}
print("Before:", ss.get("webgpu_preview"))
webgpu_renderer.process_pending_webgpu_events(["webgpu_preview"])
print("After:", ss.get("webgpu_preview"))
print("_PENDING:", ss.get("__pending_updates__"))
