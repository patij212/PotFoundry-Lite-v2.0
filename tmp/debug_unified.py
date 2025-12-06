import importlib
import sys
import types

sys.path.insert(0, ".")

fake = types.ModuleType("streamlit")
fake.session_state = {}

# experimental rerun function
calls = []
def fake_rerun():
    calls.append(True)

fake.experimental_rerun = fake_rerun
sys.modules["streamlit"] = fake

# Import modules
state = importlib.import_module("pfui.state")
renderer = importlib.import_module("pfui.tabs.interactive.preview.webgpu_renderer")

print("get_st() id in state:", id(state.get_st()))
print("get_st() id in renderer:", id(renderer.get_st()))
print("fake id:", id(fake))

# Test queue updates
state.queue_update({"a": {"x": 1}})
state.queue_update({"a": {"y": 2}})
state.apply_pending_updates()
print("session state after apply:", fake.session_state)

# Test _apply_live_param_batch
payload = {
    "commit": True,
    "timestamp": 123,
    "fields": [{"sessionKey": "H", "value": 150.0}],
    "params": {"H": 150},
    "canvasId": "test-canvas",
}
renderer._apply_live_param_batch(payload, rerun_if_queued=True)
print("rerun calls:", len(calls))
print("session state now:", fake.session_state)
