# tests/pfui/test_state_history.py
import sys
import types
from typing import Any

# stub streamlit
fake_st = types.SimpleNamespace()
fake_st.session_state = {}
# Use ModuleType so sys.modules contains proper module objects (hashable)
mod: Any = types.ModuleType("streamlit")
mod.session_state = fake_st.session_state

import importlib


def _reset():
    fake_st.session_state.clear()


def test_checkpoint_and_undo_redo_roundtrip():
    _reset()
    # Ensure the pfui modules import under the test's shim
    sys.modules["streamlit"] = mod
    H = importlib.import_module("pfui.state_history")
    importlib.reload(H)
    # prepare UI state
    fake_st.session_state["ui.style"] = "S1"
    fake_st.session_state["ui.global"] = {"H": 100}
    fake_st.session_state["ui.params"] = {"S1": {"a": 1}}

    H.checkpoint("S1")
    # mutate
    fake_st.session_state["ui.global"]["H"] = 200
    fake_st.session_state["ui.params"]["S1"]["a"] = 2

    H.undo()
    assert fake_st.session_state["ui.global"]["H"] == 100
    assert fake_st.session_state["ui.params"]["S1"]["a"] == 1

    H.redo()
    assert fake_st.session_state["ui.global"]["H"] == 200
    assert fake_st.session_state["ui.params"]["S1"]["a"] == 2
