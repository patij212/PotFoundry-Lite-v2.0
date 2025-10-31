import importlib
import sys
import types


def _reload_preview():
    # Ensure a fresh import of pfui.preview so its module-level decorators
    # are re-evaluated against the current `streamlit` shim.
    if "pfui.preview" in sys.modules:
        del sys.modules["pfui.preview"]
    return importlib.import_module("pfui.preview")


def test_preview_import_with_non_callable_cache(monkeypatch):
    """Ensure pfui.preview imports cleanly when streamlit.cache_data is
    a non-callable test double (e.g., SimpleNamespace or custom object).

    This prevents the TypeError: '_Cache' object is not callable seen in CI
    when a test or environment injects a non-callable cache shim.
    """

    import streamlit as st

    # Case 1: SimpleNamespace (has attributes but is not callable)
    monkeypatch.setattr(st, "cache_data", types.SimpleNamespace(), raising=False)
    mod = _reload_preview()
    assert hasattr(mod, "make_preview_arrays")

    # Case 2: custom non-callable object
    class NonCallable:
        def clear(self):
            return None

    monkeypatch.setattr(st, "cache_data", NonCallable(), raising=False)
    mod = _reload_preview()
    assert hasattr(mod, "render_preview")

    # Case 3: explicit None
    monkeypatch.setattr(st, "cache_data", None, raising=False)
    mod = _reload_preview()
    assert hasattr(mod, "render_preview")
