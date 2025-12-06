import sys
import types

import streamlit as streamlit_module

from pfui.app_components.sidebar import render_dimensions

print("Original stub id", id(streamlit_module), "session_state id", id(getattr(streamlit_module, "session_state", None)))

# Case 1: the test that monkeypatches streamlit.session_state directly
ss1 = {}
streamlit_module.session_state = ss1
streamlit_module.number_input = lambda label, *a, **k: {
    "Height": 80.0,
    "Top OD": 140.0,
    "Bottom OD": 90.0,
    "Wall thickness": 3.0,
    "Bottom slab": 3.0,
    "Drain hole": 10.0,
}[label]
class DummyExpander:
    def __enter__(self): return self
    def __exit__(self, exc_type, exc, tb): return False
streamlit_module.expander = lambda *a, **k: DummyExpander()
streamlit_module.columns = lambda *a, **k: (DummyExpander(), DummyExpander())
streamlit_module.button = lambda *a, **k: True
streamlit_module.rerun = lambda : None
import pfui.health as ph

ph.validate_dimensions = lambda H, top_od, bottom_od, t_wall, t_bottom, r_drain: [type("X", (), {"level":"warn", "message":"Test warning", "suggestion":{"H": 99.0}, "field":"H"})()]

print("Calling render_dimensions with sys.modules streamlit modified...")
out = render_dimensions(mark_changed=lambda: None, style_key="test")
print("Post call ss1:", ss1)

# Case 2: the test where the caller has a local st shim
print("\nCreating local module-like st shim...")

mod = types.ModuleType("streamlit_test_shim")
ss2 = {}
mod.session_state = ss2
mod.number_input = streamlit_module.number_input
mod.expander = streamlit_module.expander
mod.columns = streamlit_module.columns
mod.button = streamlit_module.button
mod.rerun = streamlit_module.rerun

# Replace this module's global 'st' with the shim
sys.modules[__name__].st = mod
print("Local shim id", id(mod), "ss id", id(mod.session_state))
print("Calling render_dimensions with local shim in globals...")
out2 = render_dimensions(mark_changed=lambda: None, style_key="test")
print("Post call ss2:", ss2)

print("Done")
