import sys

sys.path.insert(0, ".")
import streamlit as st

from pfui.state import apply_pending_updates
from pfui.tabs.interactive.preview import webgpu_renderer

st.session_state.clear()
key="webgpu_preview"
event={"type":"paramBatchComplete","payload":{"commit":True,"params":{"H":150.0},"fields":[]}}
st.session_state[key]=event

try:
    webgpu_renderer._handle_component_event(event, rerun_if_queued=True)
    print("Handle OK")
    print("Pending:", st.session_state.get("__pending_updates__"))
except Exception:
    import traceback
    traceback.print_exc()

try:
    webgpu_renderer.process_pending_webgpu_events([key])
    print("Process OK")
except Exception:
    import traceback
    traceback.print_exc()

print("After process event present?", st.session_state.get(key))
apply_pending_updates()
print("H?", st.session_state.get("H"))
