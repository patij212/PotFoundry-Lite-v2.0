# tests/pfui/test_state_history.py
import sys
import types

# stub streamlit
fake_st = types.SimpleNamespace()
fake_st.session_state = {}
sys.modules["streamlit"] = types.SimpleNamespace(
    session_state=fake_st.session_state
)

from pfui import state_history as H


def _reset():
    fake_st.session_state.clear()


def test_checkpoint_and_undo_redo_roundtrip():
    _reset()
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
