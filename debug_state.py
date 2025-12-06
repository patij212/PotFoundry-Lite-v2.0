import sys
import types

fake_st = types.ModuleType("streamlit")
fake_st.session_state = {}
sys.modules["streamlit"] = fake_st

import pfui.state as S

S.queue_update({"a": {"x":1}})
S.queue_update({"a": {"y":2}})
S.apply_pending_updates()
print("After apply:", fake_st.session_state)
