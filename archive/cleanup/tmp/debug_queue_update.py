import sys
import types

fake = types.ModuleType("streamlit")
fake.session_state = {}
sys.modules["streamlit"] = fake
from pfui import state

print("get_st id", id(state.get_st()))
print("session_state id", id(state.get_st().session_state))
state.queue_update({"a": {"x": 1}})
state.queue_update({"a": {"y": 2}})
state.apply_pending_updates()
print("session_state", state.get_st().session_state)
