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

from pfui._st import get_effective_st as get_st
from pfui._st import try_get_st
from pfui.imports import STYLES  # re-exposed for test monkeypatching

# Provide a small proxy object that dynamically resolves the active
# Streamlit module at attribute access time. This allows test suites to
# swap in a shim via sys.modules['streamlit'] without requiring
# reloading all pfui modules, and keeps exported `preview.st` usable for
# direct monkeypatches that expect an object to attach to.


class _Noop:
    def __call__(self, *a, **k):
        return None

    def __getattr__(self, name: str):
        return self


class _StProxy:
    """Proxy for a live Streamlit module that resolves `get_st()` on every
    attribute lookup. Supports local override attributes to allow tests to
    monkeypatch `preview.st.*` safely.
    """

    def __init__(self):
        object.__setattr__(self, "_overrides", {})
        object.__setattr__(self, "_noop", _Noop())

    def _base_mod(self):
        return get_st() or try_get_st()

    def __getattr__(self, name: str):
        # Local overrides take precedence so monkeypatch.setattr works
        ov = self._overrides.get(name)
        if ov is not None:
            return ov
        base = self._base_mod()
        if base is None:
            return getattr(self._noop, name)
        return getattr(base, name)

    def __setattr__(self, name: str, value: object) -> None:  # pragma: no cover - tiny helper
        # Allow tests to set or override attributes on the proxy
        self._overrides[name] = value

    def __dir__(self):
        base = self._base_mod()
        names = set(self._overrides.keys())
        if base is not None:
            names.update(dir(base))
        else:
            names.update(dir(self._noop))
        return sorted(names)


# Export a live proxy instance rather than a static module import.
st = _StProxy()

# ruff: noqa: E402 - See module docstring for justification
# Export explicit symbols from structured submodules (avoid F405)
from .mesh_renderer import render_mesh_snapshot_cached
from .profile_renderer import render_profile
from .snapshot_cache import (
    render_preview_apng_cached,
    render_preview_png_cached,
)
from .utils import _pyplot, cache_data
from .visualization import make_preview_arrays, render_preview

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
