import importlib
import sys
import types

sys.path.insert(0, ".")

fake_st = types.SimpleNamespace()
fake_st.session_state = {}

mod = types.ModuleType("streamlit")
mod.session_state = fake_st.session_state
sys.modules["streamlit"] = mod

S = importlib.import_module("pfui.state")
print("fake_st id:", id(fake_st))
print("mod id:", id(mod))
print("get_st id:", id(S.get_st()))
print("session_state ids:", id(fake_st.session_state), id(S.get_st().session_state))

S.queue_update({"a": 1})
S.apply_pending_updates()
print("session_state after apply:", fake_st.session_state)
