"""pfui.preview package

Modular preview implementation split across submodules.

Design note: we intentionally perform a small amount of Streamlit
environment preparation before importing heavy submodules to avoid
side-effects during editor introspection. We therefore add a file-level
ruff ignore for E402 (imports not at top of file) with this documented
justification. Star imports are avoided in favor of explicit names to
keep static analysis clean.
"""

from __future__ import annotations

import streamlit as st
from pfui.imports import STYLES  # re-exposed for test monkeypatching

# Ensure commonly-used Streamlit attributes exist in degraded/test environments.
for _attr in (
    "info",
    "warning",
    "error",
    "success",
    "caption",
    "empty",
    "write",
    "json",
    "pyplot",
    "set_page_config",
    "session_state",
):
    if not hasattr(st, _attr):
        try:
            setattr(st, _attr, (lambda *a, **k: None))
        except Exception:
            pass

# ruff: noqa: E402 - See module docstring for justification
# Export explicit symbols from structured submodules (avoid F405)
from .utils import cache_data, _pyplot  # noqa: E402
from .visualization import make_preview_arrays, render_preview  # noqa: E402
from .profile_renderer import render_profile  # noqa: E402
from .snapshot_cache import (  # noqa: E402
    render_preview_png_cached,
    render_preview_apng_cached,
)
from .mesh_renderer import render_mesh_snapshot_cached  # noqa: E402

__all__ = [
    # utils
    "cache_data",
    "_pyplot",
    # visualization
    "make_preview_arrays",
    "render_preview",
    # profile
    "render_profile",
    # snapshots
    "render_preview_png_cached",
    "render_preview_apng_cached",
    # mesh
    "render_mesh_snapshot_cached",
    # mapping for styles (tests monkeypatch this directly on pfui.preview)
    "STYLES",
    # st is intentionally left exported for test monkeypatching
    "st",
]
