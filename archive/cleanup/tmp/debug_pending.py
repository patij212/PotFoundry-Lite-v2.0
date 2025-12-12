import streamlit as st

from pfui.tabs.interactive.preview import webgpu_renderer

st.session_state.clear()
key = "webgpu_preview"
st.session_state[key] = {"type":"paramBatchComplete","payload":{"commit":True,"params":{"H":150.0},"fields":[]}}
print("Before", st.session_state.get(key))
webgpu_renderer.process_pending_webgpu_events([key])
print("After", st.session_state.get(key))
print("H?", st.session_state.get("H"))
