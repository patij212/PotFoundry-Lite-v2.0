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
from typing import Any

# Placeholders so static analyzers don't complain when Hypothesis isn't installed
settings: Any = None
Verbosity: Any = None
from types import ModuleType

# Hypothesis profile setup (optional)
_HAVE_HYPOTHESIS = False
try:
    from hypothesis import settings, Verbosity

    _HAVE_HYPOTHESIS = True
except Exception:
    _HAVE_HYPOTHESIS = False

if _HAVE_HYPOTHESIS:
    settings.register_profile(
        "ci",
        max_examples=10,
        deadline=5000,
        verbosity=Verbosity.normal,
        print_blob=True,
    )
    settings.register_profile(
        "dev", max_examples=50, deadline=10000, verbosity=Verbosity.verbose
    )
    settings.register_profile(
        "quick", max_examples=5, deadline=2000, verbosity=Verbosity.quiet
    )
    settings.load_profile(os.getenv("HYPOTHESIS_PROFILE", "dev"))
else:
    warnings.warn(
        "Hypothesis not installed; property-based tests may be skipped. "
        "Install dev deps with 'pip install -r requirements-dev.txt'.",
        RuntimeWarning,
    )

# Provide a minimal, runtime-safe Streamlit shim when Streamlit isn't
# available. Use loose typing (Any) to avoid mypy errors when assigning
# module-like objects.
st: Any
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

    setattr(st_mod, "empty", _EmptyObj())
    setattr(st_mod, "columns", _cols)
    setattr(st_mod, "tabs", _tabs)
    setattr(st_mod, "spinner", _spinner)
    setattr(st_mod, "cache_data", _cache_data_stub)
    setattr(st_mod, "session_state", {})

    st = st_mod

# Ensure streamlit is importable via sys.modules
sys.modules.setdefault("streamlit", st)
