import sys
import types

sys.modules["streamlit"] = m = types.ModuleType("streamlit")
m.session_state = {}
from pfui._st import get_st

print('sys.modules["streamlit"] id=', id(m))
print("get_st() id=", id(get_st()))

# Add attribute and check
m.number_input = lambda *a, **k: 123
print("has number_input in sys.modules:", hasattr(sys.modules["streamlit"], "number_input"))
print("get_st has number_input:", hasattr(get_st(), "number_input"))
# remove attribute and check again
del m.number_input
print("after delete, has number_input", hasattr(get_st(), "number_input"))
