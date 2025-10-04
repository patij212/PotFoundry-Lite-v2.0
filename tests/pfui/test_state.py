# tests/pfui/test_state.py
import sys
import types
import pytest

# --- stub streamlit BEFORE importing pfui.state ---
fake_st = types.SimpleNamespace()
fake_st.session_state = {}
sys.modules["streamlit"] = types.SimpleNamespace(
    session_state=fake_st.session_state
)

from pfui import state as S
from pfui import schemas as SC


def _reset_session():
    fake_st.session_state.clear()


def test_queue_update_deep_merge_and_apply():
    _reset_session()
    S.queue_update({"a": {"x": 1}})
    S.queue_update({"a": {"y": 2}})
    S.apply_pending_updates()
    assert fake_st.session_state["a"] == {"x": 1, "y": 2}
    # pending cleared
    assert S._PENDING_KEY not in fake_st.session_state


def test_queue_update_order_last_write_wins_leaf():
    _reset_session()
    S.queue_update({"k": 1})
    S.queue_update({"k": 2})
    S.apply_pending_updates()
    assert fake_st.session_state["k"] == 2


def test_queue_update_merges_into_existing_nested():
    _reset_session()
    fake_st.session_state["cfg"] = {"a": 1, "b": {"x": 1}}
    S.queue_update({"cfg": {"b": {"y": 2}}})
    S.apply_pending_updates()
    assert fake_st.session_state["cfg"] == {"a": 1, "b": {"x": 1, "y": 2}}


def test_reset_style_defaults_uses_schema_defaults():
    _reset_session()
    style = "HarmonicRipple"
    S.reset_style_defaults(style)
    # look at the pending updates that were queued
    pending = fake_st.session_state[S._PENDING_KEY]
    # all global defaults present
    for gkey, gmeta in SC.GLOBAL_CONTROLS.items():
        wk = S.widget_key(style, gkey)
        assert wk in pending
        assert pending[wk] == gmeta.get("default")
    # all style defaults present
    for skey, smeta in SC.STYLE_SCHEMAS[style].items():
        wk = S.widget_key(style, skey)
        assert wk in pending
        assert pending[wk] == smeta.get("default")


def test_reset_style_defaults_for_all_styles_covers_every_style():
    _reset_session()
    S.reset_style_defaults_for_all_styles()
    pending = fake_st.session_state[S._PENDING_KEY]
    # every style key block should have at least one widget key
    for style in SC.STYLE_SCHEMAS.keys():
        # find any key with this style's prefix
        pref = f"opt__{''.join([c if c.isalnum() or c=='_' else '_' for c in style]).lower()}_"
        assert any(k.startswith(pref) for k in pending.keys())


def test_apply_pending_updates_noop_when_empty():
    _reset_session()
    # no pending key yet
    S.apply_pending_updates()  # should not raise
    assert S._PENDING_KEY not in fake_st.session_state


def test_ensure_initialized_queues_and_applies():
    _reset_session()
    # ensure_initialized should queue defaults and apply them
    S.ensure_initialized("HarmonicRipple")
    # after running, initialized flag should be set
    assert "__ui_initialized__" in fake_st.session_state
    # pending should be cleared (applied)
    assert S._PENDING_KEY not in fake_st.session_state
