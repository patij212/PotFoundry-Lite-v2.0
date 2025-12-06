import sys
import types

from pfui._st import get_effective_st


def test_get_effective_st_prefers_caller_shim(monkeypatch):
    """If the caller's module defines `st` with a session_state mapping, we
    must prefer it over the global streamlit module.
    """
    dummy_st = types.ModuleType("streamlit_test_shim")
    dummy_st.session_state = {}
    # Put the shim into this test module's globals
    monkeypatch.setattr(sys.modules[__name__], "st", dummy_st, raising=False)

    chosen = get_effective_st()
    assert chosen is dummy_st


def test_get_effective_st_falls_back_to_sys_module_when_no_caller_shim(monkeypatch):
    import importlib

    # Use the real streamlit module (or a shim) as the sys.modules candidate
    sys_mod = sys.modules.get("streamlit") or importlib.import_module("streamlit")
    # Make sure no 'st' variable exists in this test module's globals
    if "st" in globals():
        monkeypatch.delattr(sys.modules[__name__], "st", raising=False)
    chosen = get_effective_st()
    assert chosen in (sys_mod, )


def test_get_effective_st_nested_frames(monkeypatch):
    import types

    dummy_st = types.ModuleType("streamlit_nested_shim")
    dummy_st.session_state = {}

    # Put the shim into the global namespace of this test module
    monkeypatch.setattr(__import__(__name__), "st", dummy_st, raising=False)

    # Create nested calling stack: outer() calls inner(), which asks for get_effective_st()
    def inner():
        return get_effective_st()

    def outer():
        return inner()

    chosen = outer()
    assert chosen is dummy_st
