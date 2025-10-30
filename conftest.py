"""
Pytest configuration for the PotFoundry test suite.

Defines Hypothesis profiles for different testing scenarios.
"""

import warnings

try:
    from hypothesis import settings, Verbosity

    _HAVE_HYPOTHESIS = True
except Exception as _e:  # ImportError or others
    _HAVE_HYPOTHESIS = False
    warnings.warn(
        "Hypothesis not installed; property-based tests may be skipped. "
        "Install dev deps with 'pip install -r requirements-dev.txt'.",
        RuntimeWarning,
    )

# CI profile: Reduced examples for faster execution in CI/CD
if _HAVE_HYPOTHESIS:
    settings.register_profile(
        "ci",
        max_examples=10,
        deadline=5000,  # 5 seconds per test
        verbosity=Verbosity.normal,
        print_blob=True,
    )

# Development profile: More examples for thorough local testing
if _HAVE_HYPOTHESIS:
    settings.register_profile(
        "dev",
        max_examples=50,
        deadline=10000,  # 10 seconds per test
        verbosity=Verbosity.verbose,
    )

# Quick profile: Minimal examples for rapid iteration
if _HAVE_HYPOTHESIS:
    settings.register_profile(
        "quick",
        max_examples=5,
        deadline=2000,  # 2 seconds per test
        verbosity=Verbosity.quiet,
    )

# Default to CI profile in CI environments, dev otherwise
import os

if _HAVE_HYPOTHESIS:
    settings.load_profile(os.getenv("HYPOTHESIS_PROFILE", "dev"))

# Robust Streamlit fallbacks for CI/test environments
import sys

try:
    import streamlit as st
except ImportError:
    st = None

def _noop(*args, **kwargs):
    return None

class _EmptyObj:
    def __getattr__(self, name):
        return _noop
    def __call__(self, *a, **k):
        return None

def _identity_decorator(func):
    return func

def _cache_data_stub(*args, **kwargs):
    return _identity_decorator

def _cols(n, *args, **kwargs):
    return tuple(_EmptyObj() for _ in range(n))

def _tabs(names, *args, **kwargs):
    return tuple(_EmptyObj() for _ in names)

def _spinner(*args, **kwargs):
    class DummyContext:
        def __enter__(self): return None
        def __exit__(self, exc_type, exc_val, exc_tb): return False
    return DummyContext()

def _empty(*args, **kwargs):
    return _EmptyObj()

if st is not None:
    for attr in [
        'set_page_config', 'title', 'caption', 'markdown', 'info', 'warning', 'success',
        'subheader', 'divider', 'empty', 'columns', 'tabs', 'spinner', 'cache_data', 'session_state']:
        if not hasattr(st, attr):
            if attr == 'cache_data':
                setattr(st, 'cache_data', _cache_data_stub)
            elif attr == 'columns':
                setattr(st, 'columns', _cols)
            elif attr == 'tabs':
                setattr(st, 'tabs', _tabs)
            elif attr == 'spinner':
                setattr(st, 'spinner', _spinner)
            elif attr == 'empty':
                setattr(st, 'empty', _empty)
            else:
                setattr(st, attr, _noop)
    # Ensure session_state is at least a dict-like object
    if not hasattr(st, 'session_state'):
        st.session_state = {}
    sys.modules['streamlit'] = st
else:
    import types
    st = types.SimpleNamespace()
    st.set_page_config = _noop
    st.title = _noop
    st.caption = _noop
    st.markdown = _noop
    st.info = _noop
    st.warning = _noop
    st.success = _noop
    st.subheader = _noop
    st.divider = _noop
    st.empty = _empty
    st.columns = _cols
    st.tabs = _tabs
    st.spinner = _spinner
    st.cache_data = _cache_data_stub
    st.session_state = {}
    sys.modules['streamlit'] = st
"""
Pytest configuration for the PotFoundry test suite.

Defines Hypothesis profiles for different testing scenarios.
"""

import warnings

try:
    from hypothesis import settings, Verbosity

    _HAVE_HYPOTHESIS = True
except Exception as _e:  # ImportError or others
    _HAVE_HYPOTHESIS = False
    warnings.warn(
        "Hypothesis not installed; property-based tests may be skipped. "
        "Install dev deps with 'pip install -r requirements-dev.txt'.",
        RuntimeWarning,
    )

# CI profile: Reduced examples for faster execution in CI/CD
if _HAVE_HYPOTHESIS:
    settings.register_profile(
        "ci",
        max_examples=10,
        deadline=5000,  # 5 seconds per test
        verbosity=Verbosity.normal,
        print_blob=True,
    )

# Development profile: More examples for thorough local testing
if _HAVE_HYPOTHESIS:
    settings.register_profile(
        "dev",
        max_examples=50,
        deadline=10000,  # 10 seconds per test
        verbosity=Verbosity.verbose,
    )

# Quick profile: Minimal examples for rapid iteration
if _HAVE_HYPOTHESIS:
    settings.register_profile(
        "quick",
        max_examples=5,
        deadline=2000,  # 2 seconds per test
        verbosity=Verbosity.quiet,
    )

# Default to CI profile in CI environments, dev otherwise
import os

if _HAVE_HYPOTHESIS:
    settings.load_profile(os.getenv("HYPOTHESIS_PROFILE", "dev"))
