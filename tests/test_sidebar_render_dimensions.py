import streamlit as st

from pfui.app_components.sidebar import render_dimensions


class DummyIssue:
    def __init__(self, level, message, suggestion, field):
        self.level = level
        self.message = message
        self.suggestion = suggestion
        self.field = field


def test_render_dimensions_returns_keys_and_defaults(monkeypatch):
    # Prepare a clean session_state
    monkeypatch.setattr(st, "session_state", {}, raising=False)

    # Mock number_input to return sensible defaults based on label
    def fake_number_input(label, *args, **kwargs):
        mapping = {
            "Height": 150.0,
            "Top OD": 200.0,
            "Bottom OD": 100.0,
            "Wall thickness": 3.0,
            "Bottom slab": 3.0,
            "Drain hole": 5.0,
        }
        return mapping.get(label, args[2] if len(args) > 2 else 0)

    monkeypatch.setattr(st, "number_input", fake_number_input, raising=False)

    # Make expander a no-op context manager
    class DummyExpander:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    monkeypatch.setattr(st, "expander", lambda *a, **k: DummyExpander(), raising=False)

    # Run
    out = render_dimensions(mark_changed=lambda: None, style_key="test")

    assert isinstance(out, dict)
    for k in ("H", "top_od", "bottom_od", "t_wall", "t_bottom", "r_drain", "Rt", "Rb"):
        assert k in out

    # session_state should remain a dict
    assert isinstance(st.session_state, dict)


def test_render_dimensions_fix_suggestion_applies(monkeypatch):
    # Start with empty session_state
    ss = {}
    monkeypatch.setattr(st, "session_state", ss, raising=False)

    # number_input returns base values
    def fake_number_input(label, *args, **kwargs):
        mapping = {
            "Height": 80.0,
            "Top OD": 140.0,
            "Bottom OD": 90.0,
            "Wall thickness": 3.0,
            "Bottom slab": 3.0,
            "Drain hole": 10.0,
        }
        return mapping[label]

    monkeypatch.setattr(st, "number_input", fake_number_input, raising=False)

    # Make expander a no-op
    class DummyExpander:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    monkeypatch.setattr(st, "expander", lambda *a, **k: DummyExpander(), raising=False)

    # Monkeypatch validate_dimensions to return an issue with a suggestion
    import pfui.health as ph

    def fake_validate(H, top_od, bottom_od, t_wall, t_bottom, r_drain):
        return [DummyIssue("warn", "Test warning", {"H": 99.0}, "H")]

    monkeypatch.setattr(ph, "validate_dimensions", fake_validate)

    # Monkeypatch st.columns used by the Fix button (we only need a simple object)
    monkeypatch.setattr(
        st, "columns", lambda *a, **k: (DummyExpander(), DummyExpander()), raising=False,
    )

    # Monkeypatch st.button to simulate clicking the Fix button once
    def fake_button(label, *a, **k):
        return True

    monkeypatch.setattr(st, "button", fake_button, raising=False)
    # Monkeypatch rerun to no-op
    monkeypatch.setattr(st, "rerun", lambda: None, raising=False)

    render_dimensions(mark_changed=lambda: None, style_key="test")

    # After pressing Fix, session_state should contain the suggested key
    assert ss.get("H") == 99.0


def test_render_dimensions_writes_to_caller_session_state(monkeypatch):
    """Ensure render_dimensions writes to the `st.session_state` object found
    in the caller's global namespace (used by test shims). This prevents
    regressions if different `st` instances are present in sys.modules.
    """
    import sys
    import types

    # Create a dummy module-like object for st in the test's globals
    dummy_st = types.ModuleType("streamlit_test_shim")
    ss = {}
    dummy_st.session_state = ss

    # Minimal widgets used by render_dimensions
    def fake_number_input(label, *a, **k):
        mapping = {
            "Height": 80.0,
            "Top OD": 140.0,
            "Bottom OD": 90.0,
            "Wall thickness": 3.0,
            "Bottom slab": 3.0,
            "Drain hole": 10.0,
        }
        return mapping[label]

    dummy_st.number_input = fake_number_input

    class DummyExpander:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    dummy_st.expander = lambda *a, **k: DummyExpander()
    dummy_st.columns = lambda *a, **k: (DummyExpander(), DummyExpander())
    dummy_st.button = lambda *a, **k: True
    dummy_st.rerun = lambda: None
    dummy_st.warning = lambda *a, **k: None
    dummy_st.error = lambda *a, **k: None
    dummy_st.info = lambda *a, **k: None
    dummy_st.caption = lambda *a, **k: None

    # Put dummy st in this test module's global namespace; the helper should
    # prefer this `st` for resolving session_state.
    monkeypatch.setattr(sys.modules[__name__], "st", dummy_st, raising=False)

    # Monkeypatch validation to force a suggestion
    import pfui.health as ph

    def fake_validate(H, top_od, bottom_od, t_wall, t_bottom, r_drain):
        return [DummyIssue("warn", "Test warning", {"H": 99.0}, "H")]

    monkeypatch.setattr(ph, "validate_dimensions", fake_validate)

    render_dimensions(mark_changed=lambda: None, style_key="test")

    # Ensure the caller's dummy session_state was updated
    assert ss.get("H") == 99.0
