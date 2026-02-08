"""Pytest configuration for the PotFoundry test suite.

This file sets up a Hypothesis profile if available and provides a
lightweight Streamlit shim for CI/test environments where Streamlit
isn't installed. Edits here prefer simple, mypy-friendly typing so the
test-suite's static checks remain clean.
"""

from __future__ import annotations

import os
import sys
import warnings
from types import ModuleType
from typing import TYPE_CHECKING, Any

# Provide names for static checkers during type-checking. At runtime we
# initialize placeholders and attempt a real import below. This avoids
# "redefined name" mypy errors caused by assigning to the same symbol
# twice (once as a placeholder and once by `from hypothesis import ...`).
if TYPE_CHECKING:
    # Let type checkers know these symbols exist (no runtime import here).
    from hypothesis import Verbosity, settings
else:
    settings: Any = None
    Verbosity: Any = None

# Hypothesis profile setup (optional)
_HAVE_HYPOTHESIS = False
try:
    from hypothesis import Verbosity, settings

    _HAVE_HYPOTHESIS = True
except Exception:
    _HAVE_HYPOTHESIS = False

if _HAVE_HYPOTHESIS:
    settings.register_profile(
        "ci",
        max_examples=10,
        deadline=2000,
        verbosity=Verbosity.normal,
        print_blob=True,
    )
    settings.register_profile(
        "dev", max_examples=50, deadline=2000, verbosity=Verbosity.verbose,
    )
    settings.register_profile(
        "quick", max_examples=5, deadline=2000, verbosity=Verbosity.quiet,
    )
    _sel = os.getenv("HYPOTHESIS_PROFILE")
    if _sel:
        settings.load_profile(_sel)
    # Prefer CI profile on GH Actions or CI environments
    elif os.getenv("GITHUB_ACTIONS") == "true" or os.getenv("CI"):
        settings.load_profile("ci")
    else:
        settings.load_profile("dev")
else:
    warnings.warn(
        "Hypothesis not installed; property-based tests may be skipped. "
        "Install dev deps with 'pip install -r requirements-dev.txt'.",
        RuntimeWarning,
    )

# Provide a minimal, runtime-safe Streamlit shim when Streamlit isn't
# available. During type-checking we import Streamlit names so mypy sees
# the right symbols; at runtime we either use the real module or a tiny
# shim that provides the same attributes used by the app/tests.
if TYPE_CHECKING:
    import streamlit as st
else:
    st: Any = None
    try:
        import streamlit as st
    except Exception:
        # Build a small ModuleType shim
        st_mod = ModuleType("streamlit")

        def _noop(*args: Any, **kwargs: Any) -> Any:
            return None

        class _EmptyObj:
            def __getattr__(self, name: str) -> Any:  # pragma: no cover - trivial shim
                return _noop

            def __call__(self, *a: Any, **k: Any) -> Any:  # pragma: no cover
                return None

        def _identity_decorator(f: Any) -> Any:  # pragma: no cover
            return f

        def _cache_data_stub(*a: Any, **k: Any) -> Any:  # pragma: no cover
            return _identity_decorator

        def _cols(n: int, *a: Any, **k: Any) -> tuple:
            return tuple(_EmptyObj() for _ in range(n))

        def _tabs(names: Any, *a: Any, **k: Any) -> tuple:
            return tuple(_EmptyObj() for _ in names)

        def _spinner(*a: Any, **k: Any):
            class _Ctx:
                def __enter__(self) -> None:
                    return None

                def __exit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
                    return None

            return _Ctx()

        # Attach common attributes
        for n in (
            "set_page_config",
            "title",
            "caption",
            "markdown",
            "info",
            "warning",
            "success",
            "subheader",
            "divider",
        ):
            setattr(st_mod, n, _noop)

        st_mod.empty = _EmptyObj()
        st_mod.columns = _cols
        st_mod.tabs = _tabs
        st_mod.spinner = _spinner
        st_mod.cache_data = _cache_data_stub
        st_mod.session_state = {}

        st = st_mod

# Ensure streamlit is importable via sys.modules.
# Use assignment so test-runner can override real Streamlit with the shim
# during collection/ import-time, ensuring deterministic behavior.
sys.modules.setdefault("streamlit", st)


import sys as _sys

import pytest


@pytest.fixture(autouse=True)
def _isolate_pfui_py_modules():
    """Autouse fixture to remove any `pfui` or `potfoundry` modules imported
    during a test so each test imports a fresh set of modules and honors
    test-specific streamlit shims.

    This reduces test flakiness caused by module-level `st` bindings that may
    otherwise refer to an older streamlit shim from a previous test.
    """
    before = set(k for k in _sys.modules.keys())
    # Save original streamlit module (if present) so we can restore it after tests
    original_streamlit = _sys.modules.get("streamlit")
    try:
        yield
    finally:
        after = set(k for k in _sys.modules.keys())
        # Remove modules that were created during the test and belong to pfui or potfoundry
        for name in sorted(after - before):
            if name.startswith("pfui.") or name == "pfui" or name.startswith("potfoundry.") or name == "potfoundry":
                try:
                    del _sys.modules[name]
                except KeyError:
                    pass


@pytest.fixture(scope="session", autouse=True)
def _default_streamlit_shim():
    """Session-level fixture that ensures a default streamlit shim exists
    to make tests deterministic when the real Streamlit package is present
    or when no package is installed. Tests that need the real Streamlit can
    override `sys.modules['streamlit']` per test.
    """
    import sys as _sys
    import types as _types

    # Save previous module to restore at end of session
    prev = _sys.modules.get("streamlit")
    # Minimal shim used by many tests
    shim = _types.ModuleType("streamlit")
    shim.session_state = {}
    shim.info = lambda *a, **k: None
    shim.warning = lambda *a, **k: None
    shim.caption = lambda *a, **k: None
    class _Ctx:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    shim.columns = lambda *a, **k: (_Ctx(), _Ctx())
    shim.expander = lambda *a, **k: _Ctx()
    # Tweak session_state default to empty dict if not set
    _sys.modules["streamlit"] = shim
    try:
        yield
    finally:
        if prev is None:
            _sys.modules.pop("streamlit", None)
        else:
            _sys.modules["streamlit"] = prev
