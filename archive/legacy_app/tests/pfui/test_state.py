# tests/pfui/test_state.py
import sys
import types
from typing import Any

# --- stub streamlit BEFORE importing pfui.state ---
fake_st = types.SimpleNamespace()
fake_st.session_state = {}
# Insert a real module object into sys.modules so tools that iterate or
# build sets from sys.modules.values() won't encounter unhashable values
mod: Any = types.ModuleType("streamlit")
mod.session_state = fake_st.session_state
sys.modules["streamlit"] = mod

import importlib

from pfui import schemas as SC  # noqa: E402


def _reset_session():
    fake_st.session_state.clear()

print("DEBUG: sys.modules['streamlit'] id (top of test module)", id(sys.modules.get("streamlit")))


def test_queue_update_deep_merge_and_apply():
    _reset_session()
    sys.modules["streamlit"] = mod
    S = importlib.import_module("pfui.state")
    importlib.reload(S)
    # debug prints removed
    S.queue_update({"a": {"x": 1}})
    S.queue_update({"a": {"y": 2}})
    S.apply_pending_updates()
    assert fake_st.session_state["a"] == {"x": 1, "y": 2}
    # pending cleared
    assert S._PENDING_KEY not in fake_st.session_state


def test_queue_update_order_last_write_wins_leaf():
    _reset_session()
    sys.modules["streamlit"] = mod
    S = importlib.import_module("pfui.state")
    importlib.reload(S)
    S.queue_update({"k": 1})
    S.queue_update({"k": 2})
    S.apply_pending_updates()
    assert fake_st.session_state["k"] == 2


def test_queue_update_merges_into_existing_nested():
    _reset_session()
    fake_st.session_state["cfg"] = {"a": 1, "b": {"x": 1}}
    sys.modules["streamlit"] = mod
    S = importlib.import_module("pfui.state")
    importlib.reload(S)
    S.queue_update({"cfg": {"b": {"y": 2}}})
    S.apply_pending_updates()
    assert fake_st.session_state["cfg"] == {"a": 1, "b": {"x": 1, "y": 2}}


def test_reset_style_defaults_uses_schema_defaults():
    _reset_session()
    style = "HarmonicRipple"
    sys.modules["streamlit"] = mod
    S = importlib.import_module("pfui.state")
    importlib.reload(S)
    S.reset_style_defaults(style)
    # look at the pending updates that were queued
    pending = fake_st.session_state[S._PENDING_KEY]
    # all global defaults present
    for gkey, gmeta in SC.get_global_controls().items():
        wk = S.widget_key(style, gkey)
        assert wk in pending
        assert pending[wk] == gmeta.get("default")
    # all style defaults present
    styles = SC.get_style_schemas()
    for skey, smeta in styles[style].items():
        wk = S.widget_key(style, skey)
        assert wk in pending
        assert pending[wk] == smeta.get("default")


def test_reset_style_defaults_for_all_styles_covers_every_style():
    _reset_session()
    sys.modules["streamlit"] = mod
    S = importlib.import_module("pfui.state")
    importlib.reload(S)
    S.reset_style_defaults_for_all_styles()
    pending = fake_st.session_state[S._PENDING_KEY]
    # debug printing removed
    # every style key block should have at least one widget key
    styles = SC.get_style_schemas()
    for style in styles.keys():
        # find any key with this style's prefix
        pref = f"opt__{''.join([c if c.isalnum() or c == '_' else '_' for c in style]).lower()}_"
        assert any(k.startswith(pref) for k in pending.keys())


def test_apply_pending_updates_noop_when_empty():
    _reset_session()
    # no pending key yet
    sys.modules["streamlit"] = mod
    S = importlib.import_module("pfui.state")
    importlib.reload(S)
    S.apply_pending_updates()  # should not raise
    assert S._PENDING_KEY not in fake_st.session_state


def test_ensure_initialized_queues_and_applies():
    _reset_session()
    # ensure_initialized should queue defaults and apply them
    sys.modules["streamlit"] = mod
    S = importlib.import_module("pfui.state")
    importlib.reload(S)
    S.ensure_initialized("HarmonicRipple")
    # after running, initialized flag should be set
    assert "__ui_initialized__" in fake_st.session_state
    # pending should be cleared (applied)
    assert S._PENDING_KEY not in fake_st.session_state


def test_get_webgpu_camera_snapshot_defaults():
    _reset_session()
    sys.modules["streamlit"] = mod
    S = importlib.import_module("pfui.state")
    snap = S.get_webgpu_camera_snapshot(fake_st.session_state)
    assert snap["autoRotate"] is False
    assert snap["rotX"] == 0.35
    assert snap["rotY"] == 0.0
    assert snap["zoom"] == 1.0
    assert snap["panX"] == 0.0
    assert snap["panY"] == 0.0
    assert snap["cameraNonce"] == 0


def test_get_webgpu_camera_snapshot_uses_session_values():
    _reset_session()
    sys.modules["streamlit"] = mod
    fake_st.session_state.update(
        {
            "webgpu_rotX": "0.7",
            "webgpu_rotY": -0.25,
            "webgpu_zoom": 1.8,
            "webgpu_panX": 0.1,
            "webgpu_panY": -0.2,
            "webgpu_auto_rotate": True,
            "webgpu_camera_nonce": 12,
        },
    )
    S = importlib.import_module("pfui.state")
    snap = S.get_webgpu_camera_snapshot(fake_st.session_state)
    assert snap == {
        "autoRotate": True,
        "rotX": 0.7,
        "rotY": -0.25,
        "zoom": 1.8,
        "panX": 0.1,
        "panY": -0.2,
        "cameraNonce": 12,
    }


def test_queue_webgpu_camera_state_flags_auto_toggle():
    _reset_session()
    sys.modules["streamlit"] = mod
    S = importlib.import_module("pfui.state")
    assert S.queue_webgpu_camera_state({"autoRotate": True}) is True
    S.apply_pending_updates()
    assert fake_st.session_state["webgpu_auto_rotate"] is True

    # Same value should not request another rerun
    assert S.queue_webgpu_camera_state({"autoRotate": True}) is False
    assert S.queue_webgpu_camera_state({"autoRotate": False}) is True


def test_webgpu_camera_signature_changes_on_update():
    _reset_session()
    sys.modules["streamlit"] = mod
    fake_st.session_state.update({
        "webgpu_rotX": 0.1,
        "webgpu_auto_rotate": False,
    })
    S = importlib.import_module("pfui.state")
    first = S.webgpu_camera_signature(S.get_webgpu_camera_snapshot(fake_st.session_state))
    fake_st.session_state["webgpu_auto_rotate"] = True
    second = S.webgpu_camera_signature(S.get_webgpu_camera_snapshot(fake_st.session_state))
    assert first != second
