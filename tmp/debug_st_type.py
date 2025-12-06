import sys

sys.path.insert(0, ".")
import streamlit as st

from pfui._st import get_st
from pfui.tabs.interactive.preview import webgpu_renderer

st2 = get_st()
print("test-st is", type(st), "id", id(st))
print("get_st returns", type(st2), "id", id(st2))
print("st is st2?", st is st2)
print("session_state type", type(st.session_state), "id", id(st.session_state))
print("get_st.session_state type", type(st2.session_state), "id", id(st2.session_state))

# Now manipulate
st.session_state.clear()
st.session_state["k"] = "v"
print("after set via test-st, get_st sees", st2.session_state.get("k"))

# call process
webgpu_renderer.process_pending_webgpu_events(["k"])
print("after process k present?", st.session_state.get("k"), st2.session_state.get("k"))

print("--- done")
