import importlib
import sys
import types

# simulate conftest session shim
shim = types.ModuleType("streamlit")
shim.session_state = {}
sys.modules["streamlit"] = shim

# Now test sets its own fake_streamlit shim
fake = types.ModuleType("streamlit")
fake.session_state = {}
fake.info = lambda *a, **k: None
fake.caption = lambda *a, **k: None
sys.modules["streamlit"] = fake

# Import renderer
renderer = importlib.import_module("pfui.tabs.interactive.preview.webgpu_renderer")
# Call store function
renderer._store_live_preview_snapshot({"timestamp": 1, "fields": [{"sessionKey": "H", "value": 150.0}]})
renderer._store_live_preview_snapshot({"timestamp": 2, "fields": [{"sessionKey": "opt__harmonicripple_spin_turns", "value": -1.0}]})

print("session_state:", fake.session_state)
