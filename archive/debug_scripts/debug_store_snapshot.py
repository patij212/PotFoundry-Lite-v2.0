import sys
import types

# create fake streamlit shim similar to tests
fake = types.ModuleType("streamlit")
fake.session_state = {}
# minimal attributes used by webgpu_renderer
fake.info = lambda *a, **k: None
fake.warning = lambda *a, **k: None
fake.caption = lambda *a, **k: None
fake.columns = lambda *a, **k: (None, None)
fake.expander = lambda *a, **k: type("C", (), {"__enter__": lambda self: None, "__exit__": lambda self, *args: False})()

sys.modules["streamlit"] = fake

from pfui.tabs.interactive.preview import webgpu_renderer as renderer

ss = sys.modules["streamlit"].session_state
ss.clear()
print("Before:", ss)

renderer._store_live_preview_snapshot({
    "timestamp": 1,
    "fields": [
        {"sessionKey": "H", "value": 150.0},
    ],
})
renderer._store_live_preview_snapshot({
    "timestamp": 2,
    "fields": [
        {"sessionKey": "opt__harmonicripple_spin_turns", "value": -1.0},
    ],
})

print("After:", ss)
